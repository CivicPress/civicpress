/**
 * The FA-BB-002 redaction worker.
 *
 * Polls `session` records whose capture block is latched
 * `redaction_status: 'pending'` (written only by upload-finalize) and, for
 * each, produces the ONLY publicly-servable variant of the recording:
 *
 *   raw (private `recordings_raw`)
 *     → resolveVisibility(capture)                 [fail-closed: UNKNOWN → HOLD]
 *       → blank padded hidden windows (ffmpeg)     [or -c copy when attested all-public]
 *         → POST-ENCODE VERIFICATION               [decode frames + measure audio]
 *           → publish to public `recordings`
 *             → capture.public_file + redaction_status:'complete'
 *               + the public attached_files 'Recording' entry.
 *
 * The fail-closed invariant (design doc): `capture.public_file` is written
 * ONLY here, ONLY after verification confirms every hidden window is black +
 * silent in the OUTPUT file. Every failure path leaves `public_file` absent
 * and the status 'pending' (retried next cycle; bounded retry / manual
 * escape-hatch is Commit G). ffmpeg missing → the worker idles without
 * touching any record.
 *
 * Design: docs/specs/2026-07-07-fa-bb-002-redaction-design.md (Commit C).
 */

import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Logger } from '@civicpress/core';
import {
  resolveVisibility,
  type SessionCapture,
  type TimeRange,
} from '@civicpress/transcription';
import type { MediaProcessor, MediaProbe } from './redaction-ffmpeg.js';

/** Verification thresholds (design: black ≈ luma 16, silence ≈ -91 dB). */
const MAX_BLACK_LUMA = 48;
const MAX_SILENT_DB = -70;
const DURATION_TOLERANCE_S = 1.5;

/**
 * Post-encode probing (see verifyOutput + hiddenWindowProbes): how far inside a
 * hidden window the edge probes sit, the nominal volumedetect width, and how
 * far back from the output's EOF the last decodable instant is assumed to be.
 */
const PROBE_EDGE_INSET_S = 0.25;
const AUDIO_PROBE_WINDOW_S = 1;
/**
 * How far inside a hidden window an audio measurement must stay, to clear the
 * partly-silenced codec frame that straddles the boundary. See
 * audioProbeWidthS for the measured justification.
 */
const AUDIO_EDGE_MARGIN_S = 0.05;
const EOF_GUARD_S = 0.1;

/**
 * The instants to verify inside ONE hidden window.
 *
 * Verification used to decode a SINGLE frame at the window's midpoint. That
 * only ever proved the window was blanked AT THAT INSTANT: a partially-blanked
 * window — the `drawbox`/`volume` enable expression true at the midpoint but
 * false near an edge (an off-by-a-frame `between()` boundary, a filter re-init
 * after a keyframe, a container whose timeline drifts from the filter clock) —
 * passed verification and PUBLISHED in-camera content at the window edges.
 * Sample near the start, the middle AND the end instead; verifyOutput fails on
 * the first probe that is not black/silent, so nothing publishes.
 *
 * Robustness rules, in order:
 *  - the window is first clamped to the decodable part of the OUTPUT (a window
 *    running past EOF yields no probes, matching the old clamp behaviour);
 *  - probes are inset from both edges — never the boundary frame itself, which
 *    an encoder may legitimately render either way — by at most a QUARTER of
 *    the window, so a sub-second window still produces usable probes;
 *  - instants are de-duplicated at millisecond resolution, so a very short
 *    window yields ONE probe instead of three identical decodes.
 */
export function hiddenWindowProbes(
  range: TimeRange,
  outDurationS: number
): number[] {
  const end = Math.min(range.end, outDurationS - EOF_GUARD_S);
  if (!(end > range.start)) return []; // window fell past EOF (clamped away)
  const inset = Math.min(PROBE_EDGE_INSET_S, (end - range.start) / 4);
  const first = range.start + inset;
  const last = end - inset;
  const seen = new Set<string>();
  const points: number[] = [];
  for (const t of [first, (first + last) / 2, last]) {
    const key = t.toFixed(3);
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(t);
  }
  return points;
}

/**
 * Width of the volumedetect measurement at `atS`, never wider than the part of
 * the hidden window surrounding it. meanVolumeDb() CENTRES its window on `atS`,
 * so a fixed 1 s width at an edge probe would spill past the (already
 * skew-padded) hidden range into legitimately audible public audio and fail a
 * correctly-blanked recording.
 *
 * The window must also stay strictly INSIDE the range, clear of the boundary by
 * more than one codec frame. `volume=0` is applied with an
 * `enable=between(t,start,end)` expression, but the encoder emits fixed-size
 * frames (1024 samples ≈ 21 ms for AAC at 48 kHz) that do not align to the
 * window edges — so the single frame straddling a boundary is only PARTLY
 * silenced. Measured against the real pipeline: a window starting exactly at
 * the boundary reads −31.9 dB, while one starting 20 ms later reads −91 dB.
 * A measurement that merely touches the edge therefore reports a leak on a
 * correctly blanked file. The margin below is ~2.4 AAC frames, and the spill it
 * excludes lies inside the clock-skew padding that surrounds the real in-camera
 * range — it is never in-camera content.
 *
 * Returns 0 when `atS` is too close to an edge to measure anything meaningful;
 * the caller skips that probe and fails closed if NO probe in the range was
 * measurable.
 */
function audioProbeWidthS(
  range: TimeRange,
  atS: number,
  outDurationS: number
): number {
  const end = Math.min(range.end, outDurationS - EOF_GUARD_S);
  const halfInside =
    Math.min(atS - range.start, end - atS) - AUDIO_EDGE_MARGIN_S;
  if (halfInside <= 0) {
    return 0;
  }
  return Math.min(AUDIO_PROBE_WINDOW_S, 2 * halfInside);
}

/**
 * One row as `RecordManager.listRecords` actually returns it: the raw `records`
 * table row, whose `metadata` column is the record's frontmatter serialized to
 * JSON (so it carries `capture.redaction_status` — see scanPendingSessionIds).
 */
export interface ScannedRecordRow {
  id: string;
  metadata?: string | Record<string, unknown> | null;
}

/** The narrow record-manager slice the worker needs (structurally satisfied). */
export interface RedactionRecordStore {
  listRecords(options: {
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ records: ScannedRecordRow[] }>;
  getRecord(id: string): Promise<Record<string, any> | null>;
  /**
   * Concurrency-safe field-level capture merge (RecordManager.mergeCapture,
   * FA-BB-002 E): serialized on a capture lock so racing writers (finalize,
   * manifest, this worker) never clobber each other's fields.
   */
  mergeCapture(
    id: string,
    partialCapture: Record<string, unknown>,
    user: Record<string, unknown>,
    options?: {
      precondition?: (existingCapture: Record<string, unknown>) => boolean;
      appendAttachedFile?: { id: string } & Record<string, unknown>;
    }
  ): Promise<Record<string, unknown> | null>;
}

/** The narrow storage slice the worker needs. */
export interface RedactionBlobStore {
  getFileById(id: string): Promise<{
    id: string;
    folder: string;
    provider_path: string;
    original_name: string;
  } | null>;
  uploadFileStream(request: {
    stream: NodeJS.ReadableStream;
    filename: string;
    folder: string;
    size: number;
    contentType?: string;
    description?: string;
    uploaded_by?: string;
  }): Promise<{ success: boolean; file?: { id: string }; error?: string }>;
}

export interface RedactionWorkerOptions {
  records: RedactionRecordStore;
  storage: RedactionBlobStore;
  media: MediaProcessor;
  logger: Logger;
  /** Clock-skew padding on hidden windows (seconds; defaults 3 lead / 5 trail). */
  leadPadS?: number;
  trailPadS?: number;
  /** Scratch directory for encode outputs (default: a per-job os.tmpdir()). */
  workDir?: string;
  /**
   * How long a session may HOLD on unknown visibility before it escalates to
   * `awaiting_visibility` for manual review (Commit G). Default 30 min.
   */
  visibilityTimeoutMs?: number;
  /**
   * Bounded retry (Commit G): after this many failed redaction attempts the
   * session escalates to `awaiting_visibility` instead of retrying forever
   * (no permanent 'failed' latch — a human decides). Default 5.
   */
  maxAttempts?: number;
}

export interface RedactionRunSummary {
  published: number;
  held: number;
  failed: number;
}

const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };

/** Rows per listRecords page, and a hard stop on the paging loop. */
const SCAN_PAGE_SIZE = 200;
const SCAN_MAX_PAGES = 500;

/** Capture states that can never become work for this worker again. */
const TERMINAL_REDACTION_STATUS = new Set(['complete', 'awaiting_visibility']);

/** Read a field that may live under `metadata` or be lifted top-level. */
function field<T>(record: Record<string, any>, key: string): T | undefined {
  return (record.metadata?.[key] ?? record[key]) as T | undefined;
}

/**
 * `capture.redaction_status` as carried by a listRecords ROW, or undefined when
 * the row has no readable capture block (metadata absent, unparseable, or the
 * record predates the capture block). Undefined means "unknown", NOT "done".
 */
function rowRedactionStatus(row: ScannedRecordRow): string | undefined {
  let meta: unknown = row.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return undefined;
    }
  }
  const capture = (meta as Record<string, any> | null | undefined)?.capture;
  const status = capture?.redaction_status;
  return typeof status === 'string' ? status : undefined;
}

export class RedactionWorker {
  private running = false;
  private stopRequested = false;
  private sleepTimer: NodeJS.Timeout | null = null;
  private wakeSleep: (() => void) | null = null;
  private warnedUnavailable = false;

  constructor(private readonly opts: RedactionWorkerOptions) {}

  /** One poll cycle. Per-session failures are contained; never throws. */
  async runOnce(): Promise<RedactionRunSummary> {
    const { records, media, logger } = this.opts;
    const summary: RedactionRunSummary = { published: 0, held: 0, failed: 0 };

    // ffmpeg-missing → idle. No record is touched, nothing is marked failed.
    if (!(await media.available())) {
      if (!this.warnedUnavailable) {
        logger.warn(
          'redaction: ffmpeg/ffprobe unavailable — worker idle (recordings stay unpublished)',
          { operation: 'broadcast-box:redaction:unavailable' }
        );
        this.warnedUnavailable = true;
      }
      return summary;
    }
    this.warnedUnavailable = false;

    let ids: string[];
    try {
      ids = await this.scanPendingSessionIds();
    } catch (error) {
      logger.error('redaction: session scan failed', {
        operation: 'broadcast-box:redaction:scan-error',
        error: error instanceof Error ? error.message : String(error),
      });
      return summary;
    }

    for (const id of ids) {
      if (this.stopRequested) break;
      let record: Record<string, any> | null = null;
      try {
        record = await records.getRecord(id);
      } catch {
        continue;
      }
      if (!record) continue;
      const capture = field<SessionCapture>(record, 'capture');
      if (!capture?.av_file || capture.redaction_status !== 'pending') continue;

      try {
        const outcome = await this.processSession(id, capture);
        if (outcome === 'published') summary.published++;
        else if (outcome === 'held') summary.held++;
        else {
          summary.failed++;
          await this.recordFailure(id, capture).catch(() => {});
        }
      } catch (error) {
        summary.failed++;
        logger.error('redaction failed — will retry next cycle', {
          operation: 'broadcast-box:redaction:session-error',
          recordId: id,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.recordFailure(id, capture).catch(() => {});
      }
    }

    if (summary.published + summary.held + summary.failed > 0) {
      logger.info('redaction cycle complete', {
        operation: 'broadcast-box:redaction:cycle',
        ...summary,
      });
    }
    return summary;
  }

  /**
   * The candidate scan. `listRecords({ type: 'session' })` had two problems:
   *
   *  1. core's listRecords ALWAYS appends a LIMIT and DEFAULTS it to 10
   *     (core/src/database/stores/record-store.ts), so a poll only ever saw the
   *     10 most recent sessions. Past the tenth recording, an older still-
   *     `pending` session was never scanned again and its verified variant
   *     would never publish. Page explicitly until a short page comes back.
   *  2. Every returned id was then fetched with getRecord() — a DB read PLUS a
   *     markdown read + YAML parse per session, every poll cycle — only to
   *     discard the non-pending ones in JS. Scope on the status the row already
   *     carries: the `records.metadata` column is the frontmatter as JSON, so a
   *     row that positively reports a TERMINAL redaction_status is dropped
   *     without touching the disk.
   *
   * The scoping is deliberately evidence-gated: a row we cannot read a status
   * from (no capture in the indexed metadata, unparseable JSON) still gets the
   * authoritative getRecord(). The markdown file is the source of truth, so the
   * cheap filter may only discard on POSITIVE evidence, never on absence —
   * otherwise an un-reindexed capture would stall unpublished forever.
   *
   * Paging is offset-based over a non-unique sort, so a concurrent insert can
   * shift a row across a page edge. Both directions are safe: a duplicate id is
   * idempotent (the mergeCapture preconditions decline), and a missed id is
   * picked up on the next poll.
   */
  private async scanPendingSessionIds(): Promise<string[]> {
    const { records, logger } = this.opts;
    const ids: string[] = [];
    for (let page = 0; page < SCAN_MAX_PAGES; page++) {
      if (this.stopRequested) break;
      const rows = (
        await records.listRecords({
          type: 'session',
          limit: SCAN_PAGE_SIZE,
          offset: page * SCAN_PAGE_SIZE,
        })
      ).records;
      for (const row of rows) {
        const status = rowRedactionStatus(row);
        if (status !== undefined && TERMINAL_REDACTION_STATUS.has(status)) {
          continue;
        }
        ids.push(row.id);
      }
      if (rows.length < SCAN_PAGE_SIZE) return ids;
    }
    logger.warn('redaction: session scan hit the page cap — truncated', {
      operation: 'broadcast-box:redaction:scan-truncated',
      scanned: SCAN_MAX_PAGES * SCAN_PAGE_SIZE,
    });
    return ids;
  }

  private async processSession(
    recordId: string,
    capture: SessionCapture
  ): Promise<'published' | 'held' | 'failed'> {
    const { storage, media, logger } = this.opts;

    const rawFile = await storage.getFileById(capture.av_file!);
    if (!rawFile) {
      logger.error('redaction: raw A/V not found in storage — holding', {
        operation: 'broadcast-box:redaction:raw-missing',
        recordId,
        avFile: capture.av_file,
      });
      return 'failed';
    }
    // Operate on the provider's local path — a multi-hour recording must
    // never be loaded into a Buffer. (Remote providers need a streamed temp;
    // deferred until a non-local provider carries recordings.)
    const rawPath = rawFile.provider_path;
    try {
      await fs.access(rawPath);
    } catch {
      logger.error('redaction: raw A/V provider_path not readable — holding', {
        operation: 'broadcast-box:redaction:raw-unreadable',
        recordId,
        rawPath,
      });
      return 'failed';
    }

    const probe = await media.probe(rawPath);
    const decision = resolveVisibility(capture, {
      leadPadS: this.opts.leadPadS,
      trailPadS: this.opts.trailPadS,
      mediaDurationS: probe.durationS,
    });

    if (decision.kind === 'hold') {
      logger.info('redaction: visibility unknown — holding (no publish)', {
        operation: 'broadcast-box:redaction:hold',
        recordId,
        reason: decision.reason,
      });
      await this.trackHold(recordId, capture);
      return 'held';
    }

    if (decision.kind === 'none_public') {
      // Fully closed: publishes nothing, and that IS the completed outcome.
      await this.writeBack(recordId, { redaction_status: 'complete' }, null);
      logger.info('redaction: no public content — completed without publish', {
        operation: 'broadcast-box:redaction:none-public',
        recordId,
      });
      return 'published';
    }

    const workDir = await fs.mkdtemp(
      path.join(this.opts.workDir ?? os.tmpdir(), 'redaction-')
    );
    try {
      const outPath = path.join(workDir, `redacted-${recordId}.mp4`);
      const hiddenRanges =
        decision.kind === 'partial' ? decision.hiddenRanges : [];

      if (decision.kind === 'all_public') {
        await media.copy(rawPath, outPath);
      } else {
        await media.blank(rawPath, outPath, hiddenRanges, probe);
      }

      await this.verifyOutput(outPath, hiddenRanges, probe);

      const publicId = await this.publish(recordId, outPath);
      await this.writeBack(
        recordId,
        { public_file: publicId, redaction_status: 'complete' },
        publicId
      );
      logger.info('redaction: verified variant published', {
        operation: 'broadcast-box:redaction:published',
        recordId,
        publicFile: publicId,
        hiddenWindows: hiddenRanges.length,
      });
      return 'published';
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Commit G: a HOLD that outlives the visibility timeout escalates to
   * `awaiting_visibility` — still unpublished (the invariant holds), but
   * surfaced for a manual, permission-gated decision instead of waiting
   * silently forever (manifest-lost case). The first hold stamps
   * `redaction_pending_since`; the escalation compares against it.
   */
  private async trackHold(
    recordId: string,
    capture: SessionCapture
  ): Promise<void> {
    const { records, logger } = this.opts;
    const timeoutMs = this.opts.visibilityTimeoutMs ?? 30 * 60 * 1000;
    const sinceIso = (capture as Record<string, unknown>)
      .redaction_pending_since as string | undefined;
    const stillPending = (c: Record<string, unknown>) =>
      c.redaction_status === 'pending';

    if (!sinceIso) {
      await records.mergeCapture(
        recordId,
        { redaction_pending_since: new Date().toISOString() },
        SYSTEM_USER,
        { precondition: stillPending }
      );
      return;
    }
    const sinceMs = Date.parse(sinceIso);
    if (Number.isFinite(sinceMs) && Date.now() - sinceMs > timeoutMs) {
      await records.mergeCapture(
        recordId,
        { redaction_status: 'awaiting_visibility' },
        SYSTEM_USER,
        { precondition: stillPending }
      );
      logger.warn(
        'redaction: visibility unknown past timeout — awaiting manual review',
        {
          operation: 'broadcast-box:redaction:awaiting-visibility',
          recordId,
          pendingSince: sinceIso,
        }
      );
    }
  }

  /**
   * Commit G bounded retry: count failed attempts on the capture block; at
   * the cap, escalate to `awaiting_visibility` (manual review) instead of
   * retrying forever — and never latch a permanent 'failed'.
   */
  private async recordFailure(
    recordId: string,
    capture: SessionCapture
  ): Promise<void> {
    const { records, logger } = this.opts;
    const maxAttempts = this.opts.maxAttempts ?? 5;
    const attempts =
      (Number((capture as Record<string, unknown>).redaction_attempts) || 0) +
      1;
    const escalate = attempts >= maxAttempts;
    await records.mergeCapture(
      recordId,
      escalate
        ? {
            redaction_attempts: attempts,
            redaction_status: 'awaiting_visibility',
          }
        : { redaction_attempts: attempts },
      SYSTEM_USER,
      { precondition: (c) => c.redaction_status === 'pending' }
    );
    if (escalate) {
      logger.warn(
        'redaction: attempt cap reached — awaiting manual review (still unpublished)',
        {
          operation: 'broadcast-box:redaction:attempts-exhausted',
          recordId,
          attempts,
        }
      );
    }
  }

  /**
   * Post-encode verification — the encode's exit code is NOT trusted. Decode a
   * frame at SEVERAL points across EVERY hidden window (each must be black) and
   * measure the audio at each (each must be silent). Any miss throws → nothing
   * publishes. See hiddenWindowProbes for why one midpoint sample was not
   * enough.
   */
  private async verifyOutput(
    outPath: string,
    hiddenRanges: TimeRange[],
    rawProbe: MediaProbe
  ): Promise<void> {
    const { media } = this.opts;
    const outProbe = await media.probe(outPath);
    if (Math.abs(outProbe.durationS - rawProbe.durationS) > DURATION_TOLERANCE_S) {
      throw new Error(
        `verification failed: duration drifted (raw ${rawProbe.durationS}s → out ${outProbe.durationS}s)`
      );
    }
    if (rawProbe.hasAudio && !outProbe.hasAudio) {
      throw new Error('verification failed: audio stream lost in redaction');
    }
    for (const range of hiddenRanges) {
      const probes = hiddenWindowProbes(range, outProbe.durationS);
      let audioMeasured = false;

      for (const at of probes) {
        if (rawProbe.hasVideo) {
          const maxLuma = await media.frameMaxLuma(outPath, at);
          if (maxLuma > MAX_BLACK_LUMA) {
            throw new Error(
              `verification failed: frame at ${at.toFixed(1)}s inside a hidden window is not black (max luma ${maxLuma})`
            );
          }
        }
        if (rawProbe.hasAudio) {
          const width = audioProbeWidthS(range, at, outProbe.durationS);
          // width 0 means this probe sits within the codec-frame margin of an
          // edge, where a measurement would read the partly-silenced straddling
          // frame. Skip it — the other probes in this range still cover audio.
          if (width > 0) {
            audioMeasured = true;
            const meanDb = await media.meanVolumeDb(outPath, at, width);
            if (meanDb > MAX_SILENT_DB) {
              throw new Error(
                `verification failed: audio at ${at.toFixed(1)}s inside a hidden window is not silent (${meanDb} dB)`
              );
            }
          }
        }
      }

      // Fail CLOSED. If the window yielded probes but none of them could be
      // measured for audio, we have NOT verified silence — never publish on an
      // unverified window. (No probes at all means the window was clamped away
      // past EOF, so there is genuinely nothing in the file to verify.)
      if (rawProbe.hasAudio && probes.length > 0 && !audioMeasured) {
        throw new Error(
          `verification failed: hidden window ${range.start}-${range.end}s is too short to verify audio silence`
        );
      }
    }
  }

  private async publish(recordId: string, outPath: string): Promise<string> {
    const { size } = await fs.stat(outPath);
    const result = await this.opts.storage.uploadFileStream({
      stream: createReadStream(outPath),
      filename: `recording-${recordId}-public.mp4`,
      folder: 'recordings',
      size,
      contentType: 'video/mp4',
      description: `Redacted public recording for session ${recordId}`,
      uploaded_by: 'system',
    });
    if (!result.success || !result.file) {
      throw new Error(result.error ?? 'public upload failed');
    }
    return result.file.id;
  }

  /**
   * Concurrency-safe write-back via mergeCapture (FA-BB-002 E): the read and
   * write are atomic under the capture lock, so a racing manifest/finalize
   * write can't clobber the latch and vice-versa. When `publicFileId` is set,
   * the public 'Recording' attached_files entry is appended in the SAME
   * update — the ONLY place a recording is attached to the public record.
   * Precondition: never overwrite a redaction another worker completed.
   */
  private async writeBack(
    recordId: string,
    capturePatch: Partial<SessionCapture>,
    publicFileId: string | null
  ): Promise<void> {
    await this.opts.records.mergeCapture(
      recordId,
      capturePatch as Record<string, unknown>,
      SYSTEM_USER,
      {
        precondition: (existing) => existing.redaction_status !== 'complete',
        ...(publicFileId
          ? {
              appendAttachedFile: {
                id: publicFileId,
                path: `/api/v1/storage/files/${publicFileId}`,
                original_name: `recording-${recordId}-public.mp4`,
                description: 'Session recording (redacted public variant)',
                category: 'Recording',
              },
            }
          : {}),
      }
    );
  }

  /** Poll forever until stop(). */
  async start(pollIntervalMs: number): Promise<void> {
    this.running = true;
    this.stopRequested = false;
    while (this.running) {
      try {
        await this.runOnce();
      } catch (error) {
        this.opts.logger.error('redaction cycle errored', {
          operation: 'broadcast-box:redaction:cycle-error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!this.running) break;
      await new Promise<void>((resolve) => {
        this.wakeSleep = resolve;
        this.sleepTimer = setTimeout(resolve, pollIntervalMs);
      });
      this.sleepTimer = null;
      this.wakeSleep = null;
    }
  }

  stop(): void {
    this.running = false;
    this.stopRequested = true;
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.wakeSleep?.();
  }
}
