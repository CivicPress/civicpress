/**
 * CoreRecordsGateway — mapping, derived scan, audio fetch, and write-back shape,
 * verified with fakes (no real @civicpress/core). The real-CivicPress e2e lives
 * in the monorepo `tests/` suite.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  CoreRecordsGateway,
  type CoreRecord,
  type RecordStore,
} from '../gateways/core-records-gateway.js';
import type { TranscriptResult } from '../types.js';

function fakeStore(records: CoreRecord[]): {
  store: RecordStore;
  updates: Array<{ id: string; request: any; user: any }>;
} {
  const updates: Array<{ id: string; request: any; user: any }> = [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const store: RecordStore = {
    async listRecords() {
      return { records: records.map((r) => ({ id: r.id })) };
    },
    async getRecord(id: string) {
      return byId.get(id) ?? null;
    },
    async updateRecord(id, request, user) {
      updates.push({ id, request, user });
      return null;
    },
  };
  return { store, updates };
}

const TRANSCRIPT: TranscriptResult = {
  language: 'fr',
  text: 'Bonjour.',
  segments: [{ start: 0, end: 1.2, text: 'Bonjour.' }],
};

describe('CoreRecordsGateway.findNeedingTranscription', () => {
  it('keeps only sessions with capture.av_file and no transcript_status', async () => {
    const { store } = fakeStore([
      { id: 'needs', metadata: { capture: { device: 'bb', av_file: 'uuid-1' } } },
      {
        id: 'done',
        metadata: {
          capture: { device: 'bb', av_file: 'uuid-2' },
          transcript_status: 'automated',
        },
      },
      { id: 'no-av', metadata: { capture: { device: 'bb' } } },
      { id: 'no-capture', metadata: {} },
    ]);
    const gw = new CoreRecordsGateway({
      records: store,
      storage: { async getFileContent() { return null; } },
    });
    const result = await gw.findNeedingTranscription();
    expect(result.map((s) => s.id)).toEqual(['needs']);
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
  it('writes the fetched blob to a temp file', async () => {
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
});
