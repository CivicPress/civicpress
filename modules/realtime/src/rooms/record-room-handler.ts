/**
 * RecordRoomHandler — handler for the `records:<id>` room type.
 *
 * This is the manifesto-central writeback: it turns collaborative Yjs edits
 * into the canonical Markdown DRAFT so the editor's edit-mode shows the
 * collaborative content and it can be published later via the normal publish
 * flow.
 *
 * Draft pipeline (the REAL one — the plan's `recordManager.saveDraft` is
 * fictional). The UI's `getDraftOrRecord` (modules/api
 * records-service/frontmatter-and-publish.ts) reads `record_drafts.markdown_body`
 * keyed by the record id whenever the caller can edit. So at snapshot time we:
 *
 *   1. serialize the room's Yjs `default` XmlFragment → canonical Markdown
 *      (YjsRoom.serializeToMarkdown, W3),
 *   2. find-or-create the `record_drafts` row keyed by the record id, reusing
 *      the canonical DatabaseService.getDraft/createDraft/updateDraft pipeline
 *      (the same one modules/api's RecordsDrafts uses) — UPDATE if a draft
 *      already exists, otherwise CREATE one seeded with the published record's
 *      title/type/metadata (looked up via RecordManager.getRecord) and the
 *      collaborative Markdown as `markdown_body`,
 *   3. persist the raw Yjs binary via the W4 snapshotManager.persist (an
 *      integrity-hashed, EPHEMERAL merge-aid — NOT the durable archive).
 *
 * The draft write is tagged with the system/collab author `'realtime-snapshot'`
 * so collaborative writebacks are distinguishable from human edits.
 *
 * Resilience (spec §3e — the snapshot is the merge-aid, the Markdown is the
 * archive): the per-room snapshot is mutex-coalesced so overlapping triggers
 * share one in-flight write, and each sub-step degrades independently. If
 * serialization fails we skip the draft write but STILL persist the binary
 * (losing a snapshot is worse than keeping one); if the draft write fails the
 * binary has already been archived. Failures emit
 * `realtime:snapshot:writeback-failed` and never throw out of snapshot().
 */

import type {
  RoomTypeHandler,
  ConnectionContext,
  MessageContext,
  DisconnectContext,
  AuthResult,
} from '../types/handler-registry.types.js';
import type { DraftRow, RecordData } from '@civicpress/core';
import { coreWarn, coreError } from '@civicpress/core';
import type { YjsRoom } from './yjs-room.js';
import * as Y from 'yjs';

/**
 * Narrow draft-persistence surface the handler needs. `DatabaseService`
 * structurally satisfies this (createDraft/getDraft/updateDraft), so wiring is
 * just passing the resolved service — but the handler depends only on this
 * subset, which keeps it testable without the whole DB.
 */
export interface RecordDraftPersistence {
  getDraft(id: string): Promise<DraftRow | null>;
  createDraft(data: {
    id: string;
    title: string;
    type: string;
    status?: string;
    workflow_state?: string;
    markdown_body?: string | null;
    metadata?: string | null;
    author: string;
    created_by: string;
  }): Promise<void>;
  updateDraft(
    id: string,
    updates: {
      title?: string;
      type?: string;
      markdown_body?: string;
      metadata?: string;
    }
  ): Promise<void>;
}

/**
 * Narrow record-lookup surface — used only to seed title/type/metadata when no
 * draft exists yet. `RecordManager` structurally satisfies this.
 */
export interface RecordContentSource {
  getRecord(id: string): Promise<RecordData | null>;
}

/**
 * Narrow snapshot-persist surface — the W4 SnapshotManager.persist, which
 * integrity-hashes the blob. (Provided lazily because the SnapshotManager is
 * constructed inside RealtimeServer.initialize(), after the handler is
 * registered with the DI container.)
 */
export interface SnapshotPersister {
  persist(req: { roomId: string; blob: Uint8Array }): Promise<void>;
}

/** A typed-ish event emitter for snapshot lifecycle observation. */
export interface RecordSnapshotHookBus {
  emit(event: string, payload: Record<string, unknown>): void;
}

/**
 * Dependencies for the writeback. All optional so the W1 DI registration can
 * still `new RecordRoomHandler()` before the wiring lands; an unwired handler
 * no-ops the writeback rather than throwing.
 */
export interface RecordRoomHandlerDeps {
  /** Canonical draft pipeline (DatabaseService). */
  draftPersistence?: RecordDraftPersistence;
  /** Published-record lookup for find-or-create seeding (RecordManager). */
  recordSource?: RecordContentSource;
  /**
   * Provider for the W4 SnapshotManager. A provider (rather than the instance)
   * because the manager is created lazily in RealtimeServer.initialize().
   */
  getSnapshotManager?: () => SnapshotPersister | null;
  /** Optional event emitter for snapshot lifecycle observation. */
  hookBus?: RecordSnapshotHookBus;
}

/** Author tag for collaborative writebacks (distinguishable from human edits). */
const COLLAB_AUTHOR = 'realtime-snapshot';

export class RecordRoomHandler implements RoomTypeHandler {
  public readonly roomType = 'records';

  private readonly deps: RecordRoomHandlerDeps;

  /** Per-room in-flight snapshot promise — the coalescing mutex. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(deps: RecordRoomHandlerDeps = {}) {
    this.deps = deps;
  }

  async onConnect(_ctx: ConnectionContext): Promise<AuthResult> {
    // Generic auth already runs in realtime-server.ts before the handler is called.
    return { success: true };
  }

  async onMessage(_ctx: MessageContext): Promise<void> {
    // Yjs sync messages are handled by RoomManager/YjsRoom; no per-handler routing.
  }

  onDisconnect(_ctx: DisconnectContext): void {
    // Snapshot scheduling is driven by the server/room lifecycle, not here.
  }

  /**
   * Snapshot the room: persist the Yjs binary + write the collaborative
   * Markdown back as a draft. Mutex-coalesced per room so overlapping triggers
   * share a single in-flight write. Never throws — sub-step failures are
   * logged + emitted and degrade independently.
   *
   * NOTE: this is a handler-SPECIFIC method (not part of RoomTypeHandler); it
   * is what RealtimeServer.triggerRecordSnapshot delegates to.
   */
  snapshot(room: YjsRoom): Promise<void> {
    const roomId = room.getRoomId();
    const existing = this.inFlight.get(roomId);
    if (existing) {
      // Coalesce: a snapshot for this room is already running, so overlapping
      // triggers share its single in-flight write. Returned directly (not via
      // an async wrapper) so callers get the identical in-flight promise.
      return existing;
    }

    const run = this.runSnapshot(room).finally(() => {
      this.inFlight.delete(roomId);
    });
    this.inFlight.set(roomId, run);
    return run;
  }

  /** The actual snapshot body (one invocation per coalesced batch). */
  private async runSnapshot(room: YjsRoom): Promise<void> {
    const roomId = room.getRoomId();
    const recordId = this.extractRecordId(roomId);

    // (1) Persist the Yjs binary first — it is the merge-aid and must survive
    // even if the Markdown writeback fails.
    await this.persistBinary(room, roomId);

    // (2) Serialize → Markdown. A failure here must NOT block the binary
    // persist (already done) and must NOT throw out of snapshot().
    let markdown: string;
    try {
      markdown = room.serializeToMarkdown();
    } catch (error) {
      this.emitWritebackFailed(roomId, recordId, 'serialize', error);
      coreWarn(
        'Realtime snapshot: serialization failed; skipping draft writeback',
        {
          operation: 'realtime:record-handler:serialize:error',
          roomId,
          recordId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return;
    }

    // (3) Write the collaborative Markdown back as a draft (find-or-create).
    await this.writeDraft(recordId, roomId, markdown);
  }

  /** Encode the room's Yjs doc and persist it via the W4 snapshot manager. */
  private async persistBinary(room: YjsRoom, roomId: string): Promise<void> {
    const snapshotManager = this.deps.getSnapshotManager?.() ?? null;
    if (!snapshotManager) {
      return;
    }
    try {
      const blob = Y.encodeStateAsUpdate(room.getYjsDoc());
      await snapshotManager.persist({ roomId, blob });
      room.resetUpdateCount();
    } catch (error) {
      // Binary persist failure is logged but does not abort the writeback —
      // the Markdown draft (the durable archive) is still worth attempting.
      this.emitWritebackFailed(
        roomId,
        this.extractRecordId(roomId),
        'persist',
        error
      );
      coreError(
        error instanceof Error ? error : new Error(String(error)),
        'REALTIME_SNAPSHOT_PERSIST_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        { operation: 'realtime:record-handler:persist:error', roomId }
      );
    }
  }

  /**
   * Find-or-create the `record_drafts` row keyed by recordId, setting
   * markdown_body to the collaborative Markdown. Reuses the canonical
   * DatabaseService draft pipeline. Never throws.
   */
  private async writeDraft(
    recordId: string,
    roomId: string,
    markdown: string
  ): Promise<void> {
    const drafts = this.deps.draftPersistence;
    if (!drafts) {
      // Unwired handler (W1 DI before wiring) — nothing to write back to.
      return;
    }

    try {
      const existing = await drafts.getDraft(recordId);
      if (existing) {
        // UPDATE path — preserve title/type/metadata, refresh the body.
        await drafts.updateDraft(recordId, { markdown_body: markdown });
        return;
      }

      // CREATE path — seed title/type/metadata from the published record so the
      // draft the UI reads is complete. If the record can't be found, fall back
      // to minimal placeholders rather than dropping the collaborative content.
      const record = await this.deps.recordSource?.getRecord(recordId);
      await drafts.createDraft({
        id: recordId,
        title: record?.title ?? recordId,
        type: record?.type ?? 'unknown',
        status: record?.status ?? 'draft',
        workflow_state: record?.workflowState ?? 'draft',
        markdown_body: markdown,
        metadata: record?.metadata ? JSON.stringify(record.metadata) : null,
        author: COLLAB_AUTHOR,
        created_by: COLLAB_AUTHOR,
      });
    } catch (error) {
      this.emitWritebackFailed(roomId, recordId, 'draft', error);
      coreError(
        error instanceof Error ? error : new Error(String(error)),
        'REALTIME_SNAPSHOT_DRAFT_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:record-handler:draft:error',
          roomId,
          recordId,
        }
      );
    }
  }

  /** Strip the `records:`/`record:` prefix to recover the bare record id. */
  private extractRecordId(roomId: string): string {
    return roomId.replace(/^records?:/, '');
  }

  /** Emit the writeback-failed lifecycle hook (best-effort, never throws). */
  private emitWritebackFailed(
    roomId: string,
    recordId: string,
    stage: 'serialize' | 'persist' | 'draft',
    error: unknown
  ): void {
    try {
      this.deps.hookBus?.emit('realtime:snapshot:writeback-failed', {
        roomId,
        recordId,
        stage,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // A misbehaving listener must not break snapshot resilience.
    }
  }
}
