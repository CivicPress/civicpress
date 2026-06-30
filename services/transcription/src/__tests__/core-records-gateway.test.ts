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
