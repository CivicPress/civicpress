/**
 * Unit Tests for RecordRoomHandler (W5-T1 → W5-T2)
 *
 * Exercises the server-side writeback that turns collaborative Yjs edits into
 * the canonical Markdown DRAFT. The plan's API assumptions
 * (`recordManager.saveDraft`) are fictional; these tests are written against
 * the REAL draft pipeline the handler uses:
 *
 *   - find-or-create a row in `record_drafts` keyed by the record id,
 *     reusing the canonical DatabaseService.getDraft/createDraft/updateDraft
 *     (the same pipeline modules/api's RecordsDrafts + getDraftOrRecord use),
 *   - persist the Yjs binary via the W4 snapshotManager.persist({roomId,blob})
 *     (integrity-hashed) — NOT the legacy saveSnapshot,
 *   - coalesce concurrent snapshots per-room behind a mutex,
 *   - degrade gracefully when serialization fails (no draft write, hook
 *     emitted, binary persist still attempted).
 *
 * The deps are mocked at the narrow structural interfaces the handler accepts
 * (a draft-persistence subset DatabaseService satisfies, a record-source
 * subset RecordManager satisfies, a snapshot-manager provider, and an event
 * emitter) — NOT the fictional recordManager.saveDraft.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { YjsRoom } from '../rooms/yjs-room.js';
import { RecordRoomHandler } from '../rooms/record-room-handler.js';
import type {
  RecordRoomHandlerDeps,
  RecordDraftPersistence,
  RecordContentSource,
  SnapshotPersister,
} from '../rooms/record-room-handler.js';
import type { Logger, DraftRow, RecordData } from '@civicpress/core';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  isVerbose: () => false,
} as unknown as Logger;

const mockServer = {
  emitHook: vi.fn(),
} as unknown as import('../realtime-server.js').RealtimeServer;

/** Build a real YjsRoom whose `default` fragment holds a single paragraph. */
function makePopulatedRoom(roomId: string, text = 'Hello world.'): YjsRoom {
  const room = new YjsRoom(
    roomId,
    { roomId, roomType: 'records' },
    mockLogger,
    mockServer
  );
  const frag = room.getYjsDoc().getXmlFragment('default');
  const para = new Y.XmlElement('paragraph');
  para.insert(0, [new Y.XmlText(text)]);
  frag.insert(0, [para]);
  return room;
}

/** A published RecordData stub — the source for title/type when no draft exists. */
function makeRecord(id: string): RecordData {
  return {
    id,
    title: 'Budget 2026',
    type: 'bylaw',
    status: 'adopted',
    metadata: { tags: ['finance'] },
    author: 'clerk',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  } as RecordData;
}

interface Mocks {
  draftPersistence: RecordDraftPersistence & {
    getDraft: ReturnType<typeof vi.fn>;
    createDraft: ReturnType<typeof vi.fn>;
    updateDraft: ReturnType<typeof vi.fn>;
  };
  recordSource: RecordContentSource & { getRecord: ReturnType<typeof vi.fn> };
  snapshotPersister: SnapshotPersister & { persist: ReturnType<typeof vi.fn> };
  emit: ReturnType<typeof vi.fn>;
  deps: RecordRoomHandlerDeps;
}

function makeMocks(opts?: {
  existingDraft?: Partial<DraftRow> | null;
  record?: RecordData | null;
}): Mocks {
  const draftPersistence = {
    getDraft: vi.fn().mockResolvedValue(
      opts?.existingDraft === undefined ? null : opts.existingDraft
    ),
    createDraft: vi.fn().mockResolvedValue(undefined),
    updateDraft: vi.fn().mockResolvedValue(undefined),
  } as Mocks['draftPersistence'];

  const recordSource = {
    getRecord: vi
      .fn()
      .mockResolvedValue(opts?.record === undefined ? null : opts.record),
  } as Mocks['recordSource'];

  const snapshotPersister = {
    persist: vi.fn().mockResolvedValue(undefined),
  } as Mocks['snapshotPersister'];

  const emit = vi.fn();

  const deps: RecordRoomHandlerDeps = {
    draftPersistence,
    recordSource,
    getSnapshotManager: () => snapshotPersister,
    hookBus: { emit },
  };

  return { draftPersistence, recordSource, snapshotPersister, emit, deps };
}

describe('RecordRoomHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('conformance', () => {
    it('declares roomType "records" and a passthrough onConnect', async () => {
      const { deps } = makeMocks();
      const handler = new RecordRoomHandler(deps);
      expect(handler.roomType).toBe('records');
      const result = await handler.onConnect?.({
        roomId: 'rec-1',
      } as never);
      expect(result).toEqual({ success: true });
    });

    it('can be constructed with no deps (DI registers, wiring lands later)', () => {
      const handler = new RecordRoomHandler();
      expect(handler.roomType).toBe('records');
    });
  });

  describe('snapshot() — Markdown writeback', () => {
    it('serializes Yjs→Markdown and UPDATES the existing draft', async () => {
      const mocks = makeMocks({
        existingDraft: { id: 'rec-1', title: 'Budget 2026', type: 'bylaw' },
      });
      const handler = new RecordRoomHandler(mocks.deps);
      const room = makePopulatedRoom('records:rec-1');

      await handler.snapshot(room);

      // Existing draft → update path, not create.
      expect(mocks.draftPersistence.getDraft).toHaveBeenCalledWith('rec-1');
      expect(mocks.draftPersistence.createDraft).not.toHaveBeenCalled();
      expect(mocks.draftPersistence.updateDraft).toHaveBeenCalledTimes(1);
      const [id, updates] = mocks.draftPersistence.updateDraft.mock.calls[0];
      expect(id).toBe('rec-1');
      expect(updates.markdown_body.trim()).toBe('Hello world.');
    });

    it('CREATES a draft from the published record when none exists', async () => {
      const mocks = makeMocks({
        existingDraft: null,
        record: makeRecord('rec-2'),
      });
      const handler = new RecordRoomHandler(mocks.deps);
      const room = makePopulatedRoom('records:rec-2', 'New collaborative text.');

      await handler.snapshot(room);

      expect(mocks.recordSource.getRecord).toHaveBeenCalledWith('rec-2');
      expect(mocks.draftPersistence.updateDraft).not.toHaveBeenCalled();
      expect(mocks.draftPersistence.createDraft).toHaveBeenCalledTimes(1);
      const [data] = mocks.draftPersistence.createDraft.mock.calls[0];
      expect(data.id).toBe('rec-2');
      // Title/type preserved from the published record.
      expect(data.title).toBe('Budget 2026');
      expect(data.type).toBe('bylaw');
      expect(data.markdown_body.trim()).toBe('New collaborative text.');
    });

    it('tags the draft write with a system/collab author', async () => {
      const mocks = makeMocks({
        existingDraft: null,
        record: makeRecord('rec-3'),
      });
      const handler = new RecordRoomHandler(mocks.deps);
      await handler.snapshot(makePopulatedRoom('records:rec-3'));

      const [data] = mocks.draftPersistence.createDraft.mock.calls[0];
      expect(data.author).toBe('realtime-snapshot');
      expect(data.created_by).toBe('realtime-snapshot');
    });

    it('persists the Yjs binary via snapshotManager.persist (integrity-hashed)', async () => {
      const mocks = makeMocks({
        existingDraft: { id: 'rec-4', title: 'T', type: 'bylaw' },
      });
      const handler = new RecordRoomHandler(mocks.deps);
      const room = makePopulatedRoom('records:rec-4');

      await handler.snapshot(room);

      expect(mocks.snapshotPersister.persist).toHaveBeenCalledTimes(1);
      const [req] = mocks.snapshotPersister.persist.mock.calls[0];
      expect(req.roomId).toBe('records:rec-4');
      expect(req.blob).toBeInstanceOf(Uint8Array);
      expect(req.blob.byteLength).toBeGreaterThan(0);
      // The persisted blob must round-trip back to the same doc state.
      const restored = new Y.Doc();
      Y.applyUpdate(restored, req.blob);
      expect(
        restored.getXmlFragment('default').length
      ).toBeGreaterThan(0);
    });

    it('coalesces concurrent snapshots: draft write fires once', async () => {
      const mocks = makeMocks({
        existingDraft: { id: 'rec-5', title: 'T', type: 'bylaw' },
      });
      // Gate updateDraft so the second snapshot call overlaps the first while
      // the first is still mid-write (proving the coalescing mutex, not just
      // sequential calls).
      const gate = (() => {
        let release!: () => void;
        const promise = new Promise<void>((resolve) => {
          release = resolve;
        });
        return { promise, release };
      })();
      mocks.draftPersistence.updateDraft.mockImplementation(
        () => gate.promise
      );
      const handler = new RecordRoomHandler(mocks.deps);
      const room = makePopulatedRoom('records:rec-5');

      // p1 enters; p2 must coalesce onto the in-flight p1 (snapshot() registers
      // the in-flight promise synchronously, before any await).
      const p1 = handler.snapshot(room);
      const p2 = handler.snapshot(room);
      expect(p2).toBe(p1); // same in-flight promise → coalesced
      gate.release();
      await Promise.all([p1, p2]);

      // Mutex-coalesced: the in-flight snapshot is shared, draft write once.
      expect(mocks.draftPersistence.updateDraft).toHaveBeenCalledTimes(1);
    });

    it('degrades gracefully when serialization throws: no draft write, hook emitted, binary persist still attempted', async () => {
      const mocks = makeMocks({
        existingDraft: { id: 'rec-6', title: 'T', type: 'bylaw' },
      });
      const handler = new RecordRoomHandler(mocks.deps);
      const room = makePopulatedRoom('records:rec-6');
      // Force the serializer to throw.
      vi.spyOn(room, 'serializeToMarkdown').mockImplementation(() => {
        throw new Error('serialize boom');
      });

      // Must not reject — degradation is graceful.
      await expect(handler.snapshot(room)).resolves.toBeUndefined();

      // No draft write on serialize failure.
      expect(mocks.draftPersistence.createDraft).not.toHaveBeenCalled();
      expect(mocks.draftPersistence.updateDraft).not.toHaveBeenCalled();
      // Failure hook emitted.
      const events = mocks.emit.mock.calls.map((c) => c[0]);
      expect(events).toContain('realtime:snapshot:writeback-failed');
      // The Yjs binary is still archived (snapshot is the merge-aid).
      expect(mocks.snapshotPersister.persist).toHaveBeenCalledTimes(1);
    });

    it('does not throw if the draft write fails (binary persist already done)', async () => {
      const mocks = makeMocks({
        existingDraft: { id: 'rec-7', title: 'T', type: 'bylaw' },
      });
      mocks.draftPersistence.updateDraft.mockRejectedValue(
        new Error('db down')
      );
      const handler = new RecordRoomHandler(mocks.deps);
      const room = makePopulatedRoom('records:rec-7');

      await expect(handler.snapshot(room)).resolves.toBeUndefined();
      const events = mocks.emit.mock.calls.map((c) => c[0]);
      expect(events).toContain('realtime:snapshot:writeback-failed');
    });

    it('extracts <id> from records:<id> room ids (singular + plural)', async () => {
      const mocks = makeMocks({
        existingDraft: { id: 'abc', title: 'T', type: 'bylaw' },
      });
      const handler = new RecordRoomHandler(mocks.deps);

      await handler.snapshot(makePopulatedRoom('records:abc'));
      expect(mocks.draftPersistence.getDraft).toHaveBeenLastCalledWith('abc');

      await handler.snapshot(makePopulatedRoom('record:xyz'));
      expect(mocks.draftPersistence.getDraft).toHaveBeenLastCalledWith('xyz');
    });

    it('no-ops the draft write when deps are absent (unwired handler)', async () => {
      const handler = new RecordRoomHandler();
      const room = makePopulatedRoom('records:rec-8');
      // Must not throw even with no persistence wired.
      await expect(handler.snapshot(room)).resolves.toBeUndefined();
    });
  });
});
