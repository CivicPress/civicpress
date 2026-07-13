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
import { RedactionWorker } from '../services/redaction-worker.js';
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
    listRecords: vi.fn(async () => ({
      records: records.map((r) => ({ id: r.id })),
    })),
    getRecord: vi.fn(async (id: string) => byId.get(id) ?? null),
    updateRecord: vi.fn(async (id: string, request: any) => {
      const rec = byId.get(id);
      if (!rec) throw new Error('missing');
      if (request.metadata?.capture) {
        rec.metadata = { ...rec.metadata, capture: request.metadata.capture };
      }
      if (request.attachedFiles) rec.attachedFiles = request.attachedFiles;
      return rec;
    }),
  };
}

const PARTIAL_SEGMENTS = [
  { start: 0, end: 20, visibility: 'public' },
  { start: 20, end: 40, visibility: 'in_camera' },
  { start: 40, end: 60, visibility: 'public' },
];

function sessionRecord(capture: Record<string, unknown>): Record<string, any> {
  return {
    id: 'pv-1',
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
    expect(records.updateRecord).not.toHaveBeenCalled();
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
    // Another worker completes the session between our scan and our write-back.
    const realGet = records.getRecord.getMockImplementation()!;
    let calls = 0;
    records.getRecord.mockImplementation(async (id: string) => {
      calls++;
      const rec2 = await realGet(id);
      if (calls > 1 && rec2) {
        rec2.metadata.capture.redaction_status = 'complete';
        rec2.metadata.capture.public_file = 'other-worker-file';
      }
      return rec2;
    });
    const media = fakeMedia();
    const { worker } = makeWorker(records, media);

    await worker.runOnce();

    expect(rec.metadata.capture.public_file).toBe('other-worker-file');
    expect(records.updateRecord).not.toHaveBeenCalled();
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
