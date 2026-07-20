/**
 * RedactionWorker unit tests (FA-BB-002 Commit C) — fake records/storage/media.
 *
 * The fail-closed invariant under test: `capture.public_file` is written ONLY
 * after post-encode verification passes, and every failure/unknown path leaves
 * the record unpublished (`redaction_status: 'pending'`, no public_file, no
 * attached_files entry).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  RedactionWorker,
  hiddenWindowProbes,
} from '../services/redaction-worker.js';
import type { MediaProcessor, MediaProbe } from '../services/redaction-ffmpeg.js';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

const PROBE: MediaProbe = { durationS: 60, hasAudio: true, hasVideo: true };

function fakeMedia(overrides: Partial<MediaProcessor> = {}): MediaProcessor {
  return {
    available: vi.fn(async () => true),
    probe: vi.fn(async () => PROBE),
    copy: vi.fn(async (_in: string, out: string) => {
      await fs.writeFile(out, 'copied');
    }),
    blank: vi.fn(async (_in: string, out: string) => {
      await fs.writeFile(out, 'blanked');
    }),
    frameMaxLuma: vi.fn(async () => 16), // black
    meanVolumeDb: vi.fn(async () => -91), // silent
    ...overrides,
  };
}

function fakeStorage(rawPath: string) {
  return {
    getFileById: vi.fn(async (id: string) => ({
      id,
      folder: 'recordings_raw',
      provider_path: rawPath,
      original_name: 'recording.mp4',
    })),
    uploadFileStream: vi.fn(async () => ({
      success: true,
      file: { id: 'public-uuid-1' },
    })),
  };
}

function fakeRecords(records: Record<string, any>[]) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return {
    // Mirrors core's listRecords contract, INCLUDING the trap it sets: a LIMIT
    // is always applied and DEFAULTS TO 10 (record-store.ts). A fake that
    // returned everything would hide the truncation the paged scan fixes.
    listRecords: vi.fn(
      async (options: { limit?: number; offset?: number } = {}) => ({
        records: records
          .slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 10))
          // The row is the raw DB row: metadata is the frontmatter as JSON.
          .map((r) => ({ id: r.id, metadata: JSON.stringify(r.metadata ?? {}) })),
      })
    ),
    getRecord: vi.fn(async (id: string) => byId.get(id) ?? null),
    // Mirrors RecordManager.mergeCapture semantics (field merge + precondition
    // + attached_files append), minus the DB lock.
    mergeCapture: vi.fn(
      async (id: string, patch: any, _user: any, options: any = {}) => {
        const rec = byId.get(id);
        if (!rec) throw new Error(`Record not found: ${id}`);
        const existing = rec.metadata?.capture ?? {};
        if (options.precondition && !options.precondition(existing)) {
          return null;
        }
        const merged = { ...existing, ...patch };
        rec.metadata = { ...rec.metadata, capture: merged };
        if (options.appendAttachedFile) {
          const attached: any[] = rec.attachedFiles ?? [];
          if (!attached.some((f) => f?.id === options.appendAttachedFile.id)) {
            rec.attachedFiles = [...attached, options.appendAttachedFile];
          }
        }
        return merged;
      }
    ),
  };
}

const PARTIAL_SEGMENTS = [
  { start: 0, end: 20, visibility: 'public' },
  { start: 20, end: 40, visibility: 'in_camera' },
  { start: 40, end: 60, visibility: 'public' },
];

function sessionRecord(
  capture: Record<string, unknown>,
  id = 'pv-1'
): Record<string, any> {
  return {
    id,
    type: 'session',
    attachedFiles: [],
    metadata: { capture: { device: 'bb-001', av_file: 'raw-uuid-1', ...capture } },
  };
}

describe('RedactionWorker', () => {
  let rawPath: string;

  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'redaction-test-'));
    rawPath = path.join(dir, 'raw.mp4');
    await fs.writeFile(rawPath, 'raw-bytes');
  });

  function makeWorker(
    records: any,
    media: MediaProcessor,
    storage = fakeStorage(rawPath)
  ) {
    return {
      worker: new RedactionWorker({ records, storage, media, logger: silentLogger }),
      storage,
    };
  }

  it('publishes a verified blanked variant and latches public_file + complete', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const records = fakeRecords([rec]);
    const media = fakeMedia();
    const { worker, storage } = makeWorker(records, media);

    const summary = await worker.runOnce();

    expect(summary).toEqual({ published: 1, held: 0, failed: 0 });
    expect(media.blank).toHaveBeenCalledOnce();
    // Publishes to the PUBLIC folder…
    expect(storage.uploadFileStream.mock.calls[0][0].folder).toBe('recordings');
    // …and latches the capture block + the public attachment.
    const capture = rec.metadata.capture;
    expect(capture.public_file).toBe('public-uuid-1');
    expect(capture.redaction_status).toBe('complete');
    expect(capture.av_file).toBe('raw-uuid-1'); // raw pointer preserved
    expect(rec.attachedFiles).toEqual([
      expect.objectContaining({ id: 'public-uuid-1', category: 'Recording' }),
    ]);
  });

  it('verifies EVERY hidden window midpoint (frame black + audio silent)', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const media = fakeMedia();
    const { worker } = makeWorker(fakeRecords([rec]), media);

    await worker.runOnce();

    // One padded hidden window [17,45] → its midpoint is checked on both tracks.
    expect(media.frameMaxLuma).toHaveBeenCalledWith(expect.any(String), 31);
    expect(media.meanVolumeDb).toHaveBeenCalledWith(expect.any(String), 31, 1);
  });

  it('probes the START, MIDDLE and END of each hidden window — not just the midpoint', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const media = fakeMedia();
    const { worker } = makeWorker(fakeRecords([rec]), media);

    await worker.runOnce();

    // Padded hidden window [17,45] → probes inset from both edges.
    const videoAt = (media.frameMaxLuma as any).mock.calls.map(
      (c: any[]) => c[1]
    );
    expect(videoAt).toEqual([17.25, 31, 44.75]);
    // Every probe sits strictly INSIDE the window (never on a boundary frame).
    for (const t of videoAt) {
      expect(t).toBeGreaterThan(17);
      expect(t).toBeLessThan(45);
    }
    const audioAt = (media.meanVolumeDb as any).mock.calls.map(
      (c: any[]) => c[1]
    );
    expect(audioAt).toEqual([17.25, 31, 44.75]);
    // …and the volumedetect width never spills outside the window either.
    for (const [, at, width] of (media.meanVolumeDb as any).mock.calls) {
      expect(at - width / 2).toBeGreaterThanOrEqual(17);
      expect(at + width / 2).toBeLessThanOrEqual(45);
    }
  });

  // The regression the single-midpoint probe missed: a window blanked at its
  // midpoint but LEAKING at its edges used to pass verification and publish.
  it('does NOT publish when only the hidden-window EDGES leak (midpoint is black)', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const media = fakeMedia({
      frameMaxLuma: vi.fn(async (_path: string, atS: number) =>
        atS > 18 && atS < 44 ? 16 : 200
      ),
    });
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary).toEqual({ published: 0, held: 0, failed: 1 });
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
    expect(rec.metadata.capture.public_file).toBeUndefined();
    expect(rec.metadata.capture.redaction_status).toBe('pending');
  });

  it('does NOT publish when audio leaks only at the END of a hidden window', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const media = fakeMedia({
      meanVolumeDb: vi.fn(async (_path: string, atS: number) =>
        atS > 40 ? -12 : -91
      ),
    });
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary.failed).toBe(1);
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
    expect(rec.metadata.capture.public_file).toBeUndefined();
  });

  it('does NOT publish when a hidden-window frame is not black (verification gate)', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const media = fakeMedia({ frameMaxLuma: vi.fn(async () => 180) }); // content!
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary).toEqual({ published: 0, held: 0, failed: 1 });
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
    expect(rec.metadata.capture.public_file).toBeUndefined();
    expect(rec.metadata.capture.redaction_status).toBe('pending'); // retried
  });

  it('does NOT publish when hidden-window audio is not silent', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const media = fakeMedia({ meanVolumeDb: vi.fn(async () => -20) }); // audible!
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary.failed).toBe(1);
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
    expect(rec.metadata.capture.public_file).toBeUndefined();
  });

  it('HOLDS a pending session with no segments and no attestation (UNKNOWN)', async () => {
    const rec = sessionRecord({ redaction_status: 'pending' });
    const media = fakeMedia();
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary).toEqual({ published: 0, held: 1, failed: 0 });
    expect(media.blank).not.toHaveBeenCalled();
    expect(media.copy).not.toHaveBeenCalled();
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
    expect(rec.metadata.capture.redaction_status).toBe('pending');
  });

  it('HOLDS on segments=[] — an empty list is UNKNOWN, never all-public', async () => {
    const rec = sessionRecord({ redaction_status: 'pending', segments: [] });
    const media = fakeMedia();
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary.held).toBe(1);
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
  });

  it('stream-copies (never re-encodes) an attested all-public session', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: [{ start: 0, end: 60, visibility: 'public' }],
    });
    const media = fakeMedia();
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary.published).toBe(1);
    expect(media.copy).toHaveBeenCalledOnce();
    expect(media.blank).not.toHaveBeenCalled();
    expect(storage.uploadFileStream).toHaveBeenCalledOnce();
    expect(rec.metadata.capture.public_file).toBe('public-uuid-1');
  });

  it('publishes NOTHING for a fully in-camera session, but completes it', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: [{ start: 0, end: 60, visibility: 'in_camera' }],
    });
    const media = fakeMedia();
    const { worker, storage } = makeWorker(fakeRecords([rec]), media);

    const summary = await worker.runOnce();

    expect(summary.published).toBe(1);
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
    expect(rec.metadata.capture.public_file).toBeUndefined();
    expect(rec.metadata.capture.redaction_status).toBe('complete');
  });

  it('idles without touching any record when ffmpeg is unavailable', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const records = fakeRecords([rec]);
    const media = fakeMedia({ available: vi.fn(async () => false) });
    const { worker } = makeWorker(records, media);

    const summary = await worker.runOnce();

    expect(summary).toEqual({ published: 0, held: 0, failed: 0 });
    expect(records.listRecords).not.toHaveBeenCalled();
    expect(records.mergeCapture).not.toHaveBeenCalled();
  });

  it('skips sessions that are not pending (complete / no capture / no av_file)', async () => {
    const done = sessionRecord({
      redaction_status: 'complete',
      public_file: 'already',
      segments: PARTIAL_SEGMENTS,
    });
    const noCapture = { id: 'pv-2', type: 'session', metadata: {} };
    const media = fakeMedia();
    const { worker, storage } = makeWorker(fakeRecords([done, noCapture]), media);

    const summary = await worker.runOnce();

    expect(summary).toEqual({ published: 0, held: 0, failed: 0 });
    expect(storage.uploadFileStream).not.toHaveBeenCalled();
  });

  it('never overwrites a public_file completed by another worker mid-flight', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const records = fakeRecords([rec]);
    // Another worker completes the session while ours is mid-encode: flip the
    // latch during blank(). writeBack's precondition (inside the capture lock)
    // must then decline the write.
    const media = fakeMedia({
      blank: vi.fn(async (_in: string, out: string) => {
        rec.metadata.capture.redaction_status = 'complete';
        rec.metadata.capture.public_file = 'other-worker-file';
        await fs.writeFile(out, 'blanked');
      }),
    });
    const { worker } = makeWorker(records, media);

    await worker.runOnce();

    expect(rec.metadata.capture.public_file).toBe('other-worker-file');
    // mergeCapture ran but its precondition declined the overwrite.
    await expect(records.mergeCapture.mock.results[0].value).resolves.toBeNull();
  });

  it('G: stamps redaction_pending_since on first hold, escalates to awaiting_visibility past the timeout', async () => {
    const rec = sessionRecord({ redaction_status: 'pending' }); // no segments → hold
    const records = fakeRecords([rec]);
    const media = fakeMedia();
    const worker = new RedactionWorker({
      records,
      storage: fakeStorage(rawPath),
      media,
      logger: silentLogger,
      visibilityTimeoutMs: 60_000,
    });

    // First cycle: the hold is stamped, status stays pending.
    await worker.runOnce();
    expect(rec.metadata.capture.redaction_pending_since).toBeTruthy();
    expect(rec.metadata.capture.redaction_status).toBe('pending');

    // Simulate the stamp being older than the timeout → escalation.
    rec.metadata.capture.redaction_pending_since = new Date(
      Date.now() - 120_000
    ).toISOString();
    await worker.runOnce();
    expect(rec.metadata.capture.redaction_status).toBe('awaiting_visibility');
    expect(rec.metadata.capture.public_file).toBeUndefined(); // still unpublished

    // awaiting_visibility sessions are no longer scanned.
    const third = await worker.runOnce();
    expect(third).toEqual({ published: 0, held: 0, failed: 0 });
  });

  it('G: bounded retry — failures count attempts, the cap escalates to awaiting_visibility', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const records = fakeRecords([rec]);
    // Every encode fails verification.
    const media = fakeMedia({ frameMaxLuma: vi.fn(async () => 200) });
    const worker = new RedactionWorker({
      records,
      storage: fakeStorage(rawPath),
      media,
      logger: silentLogger,
      maxAttempts: 2,
    });

    await worker.runOnce();
    expect(rec.metadata.capture.redaction_attempts).toBe(1);
    expect(rec.metadata.capture.redaction_status).toBe('pending');

    await worker.runOnce();
    expect(rec.metadata.capture.redaction_attempts).toBe(2);
    expect(rec.metadata.capture.redaction_status).toBe('awaiting_visibility');
    expect(rec.metadata.capture.public_file).toBeUndefined(); // never published
  });

  // ---------------------------------------------------------------------------
  // Scan scoping: core's listRecords always applies a LIMIT (default 10), so an
  // unpaginated scan silently stopped at the 10 newest sessions.
  // ---------------------------------------------------------------------------

  it('scans PAST the 10-row listRecords default — an old pending session still publishes', async () => {
    // 24 completed sessions (newest first, as core sorts) then the pending one:
    // it sits at offset 24, far outside the default LIMIT 10 page.
    const done = Array.from({ length: 24 }, (_, i) =>
      sessionRecord(
        {
          redaction_status: 'complete',
          public_file: `pub-${i}`,
          segments: PARTIAL_SEGMENTS,
        },
        `old-${i}`
      )
    );
    const pending = sessionRecord(
      { redaction_status: 'pending', duration_s: 60, segments: PARTIAL_SEGMENTS },
      'stale-pending'
    );
    const records = fakeRecords([...done, pending]);
    const media = fakeMedia();
    const { worker } = makeWorker(records, media);

    const summary = await worker.runOnce();

    expect(summary).toEqual({ published: 1, held: 0, failed: 0 });
    expect(pending.metadata.capture.redaction_status).toBe('complete');
    expect(pending.metadata.capture.public_file).toBe('public-uuid-1');
  });

  it('scopes the scan by status: terminal rows are never read from disk', async () => {
    const done = sessionRecord(
      { redaction_status: 'complete', public_file: 'pub' },
      'done-1'
    );
    const escalated = sessionRecord(
      { redaction_status: 'awaiting_visibility' },
      'await-1'
    );
    const pending = sessionRecord(
      { redaction_status: 'pending', duration_s: 60, segments: PARTIAL_SEGMENTS },
      'pending-1'
    );
    const records = fakeRecords([done, escalated, pending]);
    const { worker } = makeWorker(records, fakeMedia());

    await worker.runOnce();

    // getRecord() is a DB read PLUS a markdown read + YAML parse — only the
    // session that can still be work should pay for it.
    expect(records.getRecord.mock.calls.map((c) => c[0])).toEqual(['pending-1']);
  });

  it('still reads a row authoritatively when its indexed metadata carries no status', async () => {
    const pending = sessionRecord(
      { redaction_status: 'pending', duration_s: 60, segments: PARTIAL_SEGMENTS },
      'unindexed'
    );
    const records = fakeRecords([pending]);
    // The row's metadata is missing/unparseable (record written before the
    // capture block, or a reindex that has not landed) — absence must NOT be
    // read as "done", the markdown file is the source of truth.
    records.listRecords.mockResolvedValue({
      records: [{ id: 'unindexed', metadata: 'not-json{' }],
    } as any);
    const { worker } = makeWorker(records, fakeMedia());

    const summary = await worker.runOnce();

    expect(records.getRecord).toHaveBeenCalledWith('unindexed');
    expect(summary.published).toBe(1);
  });

  it('leaves the session pending when the public upload fails', async () => {
    const rec = sessionRecord({
      redaction_status: 'pending',
      duration_s: 60,
      segments: PARTIAL_SEGMENTS,
    });
    const storage = fakeStorage(rawPath);
    storage.uploadFileStream.mockResolvedValue({
      success: false,
      error: 'disk full',
    } as any);
    const media = fakeMedia();
    const { worker } = makeWorker(fakeRecords([rec]), media, storage);

    const summary = await worker.runOnce();

    expect(summary.failed).toBe(1);
    expect(rec.metadata.capture.public_file).toBeUndefined();
    expect(rec.metadata.capture.redaction_status).toBe('pending');
  });
});

describe('hiddenWindowProbes', () => {
  it('returns start / middle / end probes strictly inside the window', () => {
    expect(hiddenWindowProbes({ start: 10, end: 30 }, 60)).toEqual([
      10.25, 20, 29.75,
    ]);
  });

  it('insets by at most a quarter of a SHORT window (probes stay inside)', () => {
    const probes = hiddenWindowProbes({ start: 5, end: 5.4 }, 60);
    expect(probes).toHaveLength(3);
    for (const t of probes) {
      expect(t).toBeGreaterThan(5);
      expect(t).toBeLessThan(5.4);
    }
    expect([...probes].sort((a, b) => a - b)).toEqual(probes);
  });

  it('never emits duplicate decodes — a sub-millisecond window yields one probe', () => {
    expect(hiddenWindowProbes({ start: 5, end: 5.0002 }, 60)).toHaveLength(1);
    // Whatever the width, no two probes round to the same ffmpeg -ss instant
    // (ms resolution), so we never pay for the same decode twice.
    for (const end of [5.0002, 5.001, 5.02, 5.4, 9, 40]) {
      const probes = hiddenWindowProbes({ start: 5, end }, 60);
      expect(new Set(probes.map((t) => t.toFixed(3))).size).toBe(probes.length);
    }
  });

  it('clamps to the decodable part of the output near EOF', () => {
    // Window runs to 60s but the output only decodes to 59.9s.
    for (const t of hiddenWindowProbes({ start: 55, end: 60 }, 60)) {
      expect(t).toBeLessThanOrEqual(59.9);
      expect(t).toBeGreaterThan(55);
    }
  });

  it('returns no probes for a window that fell entirely past EOF', () => {
    expect(hiddenWindowProbes({ start: 61, end: 70 }, 60)).toEqual([]);
    expect(hiddenWindowProbes({ start: 59.95, end: 70 }, 60)).toEqual([]);
  });
});
