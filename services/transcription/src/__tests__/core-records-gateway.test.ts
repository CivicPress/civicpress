/**
 * CoreRecordsGateway — mapping, derived scan, audio fetch, and write-back shape,
 * verified with fakes (no real @civicpress/core). The real-CivicPress e2e lives
 * in the monorepo `tests/` suite.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import {
  CoreRecordsGateway,
  type CoreRecord,
  type RecordStore,
} from '../gateways/core-records-gateway.js';
import type { TranscriptResult } from '../types.js';

function fakeStore(records: CoreRecord[]): {
  store: RecordStore;
  updates: Array<{ id: string; request: any; user: any }>;
  reads: string[];
  listCalls: Array<{ limit?: number | 'all'; offset?: number }>;
} {
  const updates: Array<{ id: string; request: any; user: any }> = [];
  const reads: string[] = [];
  const listCalls: Array<{ limit?: number | 'all'; offset?: number }> = [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const store: RecordStore = {
    // Mirrors core's listRecords contract (record-store.ts): `limit` is a page
    // size or 'all', and omitting it means 'all'.
    //
    // This fake used to reproduce the OLD contract's trap on purpose — a LIMIT
    // always applied, silently defaulting to 10 — because the gateway escaped
    // it by hand-rolling offset paging, and a fake that returned everything
    // would have hidden the truncation that paging fixed. The trap is gone at
    // the source now, so the fake models the real thing. `listCalls` keeps the
    // guarantee testable from this side: the gateway must still ASK for the
    // complete set.
    async listRecords(
      options: { limit?: number | 'all'; offset?: number } = {}
    ) {
      listCalls.push(options);
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 'all';
      const end = limit === 'all' ? records.length : offset + limit;
      return {
        records: records
          .slice(offset, end)
          // The row is the raw DB row: metadata is the frontmatter as JSON.
          .map((r) => ({ id: r.id, metadata: JSON.stringify(r.metadata ?? {}) })),
      };
    },
    async getRecord(id: string) {
      reads.push(id);
      return byId.get(id) ?? null;
    },
    async updateRecord(id, request, user) {
      updates.push({ id, request, user });
      return null;
    },
  };
  return { store, updates, reads, listCalls };
}

const TRANSCRIPT: TranscriptResult = {
  language: 'fr',
  text: 'Bonjour.',
  segments: [{ start: 0, end: 1.2, text: 'Bonjour.' }],
};

describe('CoreRecordsGateway.findNeedingTranscription', () => {
  it('keeps only sessions with capture.av_file + segments (manifest applied) and no transcript_status', async () => {
    const { store } = fakeStore([
      // av_file + segments present (manifest applied) + no status → READY.
      { id: 'needs', metadata: { capture: { device: 'bb', av_file: 'uuid-1', segments: [] } } },
      {
        id: 'done',
        metadata: {
          capture: { device: 'bb', av_file: 'uuid-2', segments: [] },
          transcript_status: 'automated',
        },
      },
      { id: 'no-av', metadata: { capture: { device: 'bb', segments: [] } } },
      // av_file present but NO segments = upload finalized, session.manifest not yet
      // applied → visibility unknown → NOT ready (transcribing now would leak
      // in-camera audio). This is the manifest race the gate closes.
      { id: 'no-manifest', metadata: { capture: { device: 'bb', av_file: 'uuid-9' } } },
      { id: 'no-capture', metadata: {} },
    ]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });
    const result = await gw.findNeedingTranscription();
    expect(result.map((s) => s.id)).toEqual(['needs']);
  });

  // The 25th session is the one that needs work. Under the store's old silent
  // `LIMIT 10` an unpaged scan stopped at row 10 and 'stale' was never
  // transcribed — no error, just a session that quietly never finished.
  it('scans PAST the first 10 rows, asking the store for the complete set', async () => {
    const done = Array.from({ length: 24 }, (_, i) => ({
      id: `old-${i}`,
      metadata: {
        capture: { device: 'bb', av_file: `uuid-${i}`, segments: [] },
        transcript_status: 'automated',
      },
    }));
    const { store, listCalls } = fakeStore([
      ...done,
      {
        id: 'stale',
        metadata: { capture: { device: 'bb', av_file: 'uuid-x', segments: [] } },
      },
    ]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });
    expect((await gw.findNeedingTranscription()).map((s) => s.id)).toEqual([
      'stale',
    ]);
    // Pin the mechanism, not just the outcome: a numeric page size here would
    // reintroduce the truncation the moment a deployment outgrew it.
    expect(listCalls.every((c) => c.limit === 'all')).toBe(true);
  });

  it('scopes the scan by status: already-transcribed rows are never read from disk', async () => {
    const { store, reads } = fakeStore([
      {
        id: 'done',
        metadata: {
          capture: { device: 'bb', av_file: 'uuid-2', segments: [] },
          transcript_status: 'automated',
        },
      },
      {
        id: 'needs',
        metadata: { capture: { device: 'bb', av_file: 'uuid-1', segments: [] } },
      },
    ]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });

    expect((await gw.findNeedingTranscription()).map((s) => s.id)).toEqual([
      'needs',
    ]);
    // getRecord() is a DB read PLUS a markdown read + YAML parse per session.
    expect(reads).toEqual(['needs']);
  });

  it('still reads a row authoritatively when its indexed metadata is unreadable', async () => {
    const { store, reads } = fakeStore([
      {
        id: 'needs',
        metadata: { capture: { device: 'bb', av_file: 'uuid-1', segments: [] } },
      },
    ]);
    // Absence of a status in the row must NOT be read as "already transcribed";
    // the markdown file is the source of truth.
    store.listRecords = async () => ({
      records: [{ id: 'needs', metadata: 'not-json{' }],
    });
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });

    expect((await gw.findNeedingTranscription()).map((s) => s.id)).toEqual([
      'needs',
    ]);
    expect(reads).toEqual(['needs']);
  });

  it('reads fields lifted to TOP-LEVEL (not nested under metadata)', async () => {
    const { store } = fakeStore([
      { id: 'top', capture: { device: 'bb', av_file: 'uuid-3' }, visibility: 'public' },
    ]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });
    const session = await gw.getSession('top');
    expect(session?.capture?.av_file).toBe('uuid-3');
    expect(session?.visibility).toBe('public');
  });
});

describe('CoreRecordsGateway.prepareAudio', () => {
  // A meeting recording is single-digit GB (the upload cap is 16 GiB), so the
  // whole-file getFileContent() Buffer this replaces pinned that much RSS and
  // hard-failed past Node's ~2 GiB max Buffer length.
  it('STREAMS the A/V to the temp file — never materializes it as a Buffer', async () => {
    const getFileContent = vi.fn(async () => {
      throw new Error('whole-file buffer read must not happen');
    });
    const gw = new CoreRecordsGateway({
      records: fakeStore([]).store,
      storage: {
        getFileContent: getFileContent as any,
        async downloadFileStream() {
          return Readable.from([Buffer.from('CHUNK-1'), Buffer.from('CHUNK-2')]);
        },
      },
    });

    const ref = await gw.prepareAudio({ id: 's1', capture: { av_file: 'uuid-x' } });

    expect(await readFile(ref.path, 'utf-8')).toBe('CHUNK-1CHUNK-2');
    expect(getFileContent).not.toHaveBeenCalled();
  });

  it('throws (leaving the session for the next cycle) when the stream is missing', async () => {
    const gw = new CoreRecordsGateway({
      records: fakeStore([]).store,
      storage: {
        async getFileContent() { return Buffer.from('never'); },
        async downloadFileStream() { return null; },
      },
    });
    await expect(
      gw.prepareAudio({ id: 's1', capture: { av_file: 'gone' } })
    ).rejects.toThrow(/not found in storage/);
  });

  it('propagates a mid-transfer stream failure instead of writing a truncated file', async () => {
    const gw = new CoreRecordsGateway({
      records: fakeStore([]).store,
      storage: {
        async getFileContent() { return null; },
        async downloadFileStream() {
          return new Readable({
            read() {
              this.push(Buffer.from('HEAD'));
              this.destroy(new Error('provider connection reset'));
            },
          });
        },
      },
    });
    await expect(
      gw.prepareAudio({ id: 's1', capture: { av_file: 'uuid-x' } })
    ).rejects.toThrow(/provider connection reset/);
  });

  // FA-BB-013 must hold on the streaming path too.
  it('sanitizes a path-traversal av_file on the STREAMING path', async () => {
    const gw = new CoreRecordsGateway({
      records: fakeStore([]).store,
      storage: {
        async getFileContent() { return null; },
        async downloadFileStream() { return Readable.from([Buffer.from('X')]); },
      },
    });
    const ref = await gw.prepareAudio({
      id: 's1',
      capture: { av_file: '../../../../etc/passwd' },
    });
    expect(ref.path).not.toContain('..');
    expect(ref.path).toContain('transcribe-av-');
    expect(await readFile(ref.path, 'utf-8')).toBe('X');
  });

  it('falls back to the buffered fetch for a store with no streaming path', async () => {
    const bytes = Buffer.from('FAKE-AV-BYTES');
    const gw = new CoreRecordsGateway({
      records: fakeStore([]).store,
      storage: { async getFileContent() { return bytes; } },
    });
    const ref = await gw.prepareAudio({ id: 's1', capture: { av_file: 'uuid-x' } });
    expect(ref.path).toContain('uuid-x');
    expect(await readFile(ref.path)).toEqual(bytes);
  });

  it('throws when the A/V is missing from storage', async () => {
    const gw = new CoreRecordsGateway({
      records: fakeStore([]).store,
      storage: { async getFileContent() { return null; } },
    });
    await expect(
      gw.prepareAudio({ id: 's1', capture: { av_file: 'gone' } })
    ).rejects.toThrow(/not found in storage/);
  });

  // FA-BB-013: capture.av_file is device-controlled. A traversal-laden id must
  // not steer the temp WRITE out of the freshly-created temp dir.
  it('sanitizes a path-traversal av_file to a basename before writing', async () => {
    const bytes = Buffer.from('X');
    const gw = new CoreRecordsGateway({
      records: fakeStore([]).store,
      storage: { async getFileContent() { return bytes; } },
    });
    const ref = await gw.prepareAudio({
      id: 's1',
      capture: { av_file: '../../../../etc/passwd' },
    });
    // The write lands inside a transcribe-av-* temp dir as 'passwd', never at /etc.
    expect(ref.path).not.toContain('..');
    expect(ref.path).toContain('transcribe-av-');
    expect(ref.path.endsWith('/passwd') || ref.path.endsWith('\\passwd')).toBe(
      true
    );
    expect(await readFile(ref.path)).toEqual(bytes);
  });
});

describe('CoreRecordsGateway.writeTranscript', () => {
  it('writes transcript_status + media.transcript_data, preserving existing media, as system user', async () => {
    const { store, updates } = fakeStore([
      { id: 's1', metadata: { media: { recording: 'rec-uuid' } } },
    ]);
    const gw = new CoreRecordsGateway({ records: store, storage: { async getFileContent() { return null; } } });

    await gw.writeTranscript('s1', { transcript: TRANSCRIPT, status: 'automated' });

    expect(updates).toHaveLength(1);
    const [{ request, user }] = updates;
    expect(request.metadata.transcript_status).toBe('automated');
    expect(request.metadata.media.transcript_data).toEqual(TRANSCRIPT);
    // existing media field preserved (shallow-merge guard against clobber):
    expect(request.metadata.media.recording).toBe('rec-uuid');
    expect(user).toEqual({ id: 1, username: 'system', role: 'admin' });
  });

  it('writes draft topics[] + minutes_status:draft when topics are provided', async () => {
    const { store, updates } = fakeStore([{ id: 's1', metadata: {} }]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });

    await gw.writeTranscript('s1', {
      transcript: TRANSCRIPT,
      status: 'automated',
      topics: [{ title: 'Parks budget', description: 'discussion' }],
    });

    const [{ request }] = updates;
    expect(request.metadata.topics).toEqual([
      { title: 'Parks budget', description: 'discussion' },
    ]);
    expect(request.metadata.minutes_status).toBe('draft');
  });

  it('omits topics/minutes_status when no topics are derived', async () => {
    const { store, updates } = fakeStore([{ id: 's1', metadata: {} }]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });

    await gw.writeTranscript('s1', {
      transcript: TRANSCRIPT,
      status: 'automated',
      topics: [],
    });

    const [{ request }] = updates;
    expect(request.metadata.topics).toBeUndefined();
    expect(request.metadata.minutes_status).toBeUndefined();
  });
});

describe('CoreRecordsGateway.getAgenda', () => {
  it('resolves the agenda from the linked meeting record', async () => {
    const { store } = fakeStore([
      {
        id: 's1',
        metadata: {},
        linkedRecords: [{ id: 'm1', type: 'meeting', description: 'recording' }],
      },
      {
        id: 'm1',
        metadata: {
          agenda: [
            { title: 'Parks budget', description: 'annual' },
            { title: 'Zoning bylaw' },
          ],
        },
      },
    ]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });
    expect(await gw.getAgenda({ id: 's1' })).toEqual([
      { title: 'Parks budget', description: 'annual' },
      { title: 'Zoning bylaw' },
    ]);
  });

  it('returns [] when the session has no linked meeting / no agenda', async () => {
    const { store } = fakeStore([{ id: 's1', metadata: {} }]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });
    expect(await gw.getAgenda({ id: 's1' })).toEqual([]);
  });

  it('tolerates linked_records / agenda stored as JSON strings (draft shape)', async () => {
    const { store } = fakeStore([
      {
        id: 's1',
        metadata: {
          linked_records: JSON.stringify([{ id: 'm1', type: 'meeting' }]),
        },
      },
      { id: 'm1', metadata: { agenda: JSON.stringify([{ title: 'Item A' }]) } },
    ]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });
    expect(await gw.getAgenda({ id: 's1' })).toEqual([{ title: 'Item A' }]);
  });
});
