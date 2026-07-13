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

/** The narrow record-manager slice the worker needs (structurally satisfied). */
export interface RedactionRecordStore {
  listRecords(options: {
    type?: string;
    limit?: number;
  }): Promise<{ records: Array<{ id: string }> }>;
  getRecord(id: string): Promise<Record<string, any> | null>;
  updateRecord(
    id: string,
    request: Record<string, unknown>,
    user: Record<string, unknown>
  ): Promise<unknown>;
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
}

export interface RedactionRunSummary {
  published: number;
  held: number;
  failed: number;
}

const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };

/** Read a field that may live under `metadata` or be lifted top-level. */
function field<T>(record: Record<string, any>, key: string): T | undefined {
  return (record.metadata?.[key] ?? record[key]) as T | undefined;
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

    let ids: Array<{ id: string }>;
    try {
      ids = (await records.listRecords({ type: 'session' })).records;
    } catch (error) {
      logger.error('redaction: session scan failed', {
        operation: 'broadcast-box:redaction:scan-error',
        error: error instanceof Error ? error.message : String(error),
      });
      return summary;
    }

    for (const { id } of ids) {
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
        else summary.failed++;
      } catch (error) {
        summary.failed++;
        logger.error('redaction failed — will retry next cycle', {
          operation: 'broadcast-box:redaction:session-error',
          recordId: id,
          error: error instanceof Error ? error.message : String(error),
        });
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
   * Post-encode verification — the encode's exit code is NOT trusted. Decode a
   * frame at the midpoint of EVERY hidden window (must be black) and measure
   * the audio there (must be silent). Any miss throws → nothing publishes.
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
      const mid = Math.min(
        (range.start + range.end) / 2,
        outProbe.durationS - 0.1
      );
      if (mid <= range.start) continue; // window fell past EOF (clamped away)
      if (rawProbe.hasVideo) {
        const maxLuma = await media.frameMaxLuma(outPath, mid);
        if (maxLuma > MAX_BLACK_LUMA) {
          throw new Error(
            `verification failed: frame at ${mid.toFixed(1)}s inside a hidden window is not black (max luma ${maxLuma})`
          );
        }
      }
      if (rawProbe.hasAudio) {
        const meanDb = await media.meanVolumeDb(outPath, mid, 1);
        if (meanDb > MAX_SILENT_DB) {
          throw new Error(
            `verification failed: audio at ${mid.toFixed(1)}s inside a hidden window is not silent (${meanDb} dB)`
          );
        }
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
   * Read-merge write-back (the records write path shallow-merges `metadata`
   * per key). When `publicFileId` is set, the public 'Recording'
   * attached_files entry is appended too — the ONLY place a recording is
   * attached to the public record.
   */
  private async writeBack(
    recordId: string,
    capturePatch: Partial<SessionCapture>,
    publicFileId: string | null
  ): Promise<void> {
    const { records } = this.opts;
    const record = await records.getRecord(recordId);
    if (!record) throw new Error(`session record vanished: ${recordId}`);
    const existing = (field<SessionCapture>(record, 'capture') ?? {}) as Record<
      string,
      unknown
    >;
    // Idempotency latch: if another worker already completed this session,
    // never overwrite its verified public_file.
    if (existing.redaction_status === 'complete') return;

    const request: Record<string, unknown> = {
      metadata: { capture: { ...existing, ...capturePatch } },
    };
    if (publicFileId) {
      const attachedFiles: any[] = (record.attachedFiles as any[]) ?? [];
      if (!attachedFiles.some((f) => f?.id === publicFileId)) {
        request.attachedFiles = [
          ...attachedFiles,
          {
            id: publicFileId,
            path: `/api/v1/storage/files/${publicFileId}`,
            original_name: `recording-${recordId}-public.mp4`,
            description: 'Session recording (redacted public variant)',
            category: 'Recording',
          },
        ];
      }
    }
    await records.updateRecord(recordId, request, SYSTEM_USER);
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
