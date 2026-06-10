/**
 * Snapshot Manager
 *
 * Manages yjs document snapshots for recovery and faster reconnection.
 *
 * Snapshots are an EPHEMERAL merge-aid for fast reconnection — the canonical
 * durable archive is the Markdown file, NOT the snapshot (spec §3e). The W4
 * persistence rework therefore makes snapshots:
 *
 *   (a) integrity-checked — a sha256 of the blob is stored on persist and
 *       re-verified on load; corruption makes loadLatestVerified() return null
 *       so the caller falls back to reloading from Markdown.
 *   (b) format-versioned — SNAPSHOT_FORMAT_V1 = 1; a row whose format_version
 *       is newer than we understand also returns null (forward-compat hatch).
 *   (c) size-aware — byte_size is recorded; over MAX_SNAPSHOT_BYTES we WARN +
 *       fire a hook but still persist (dropping a snapshot is worse).
 *   (d) TTL-cleaned — cleanupExpired() deletes rows older than SNAPSHOT_TTL_MS
 *       whose room is NOT currently active.
 */

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Logger } from '@civicpress/core';
import {
  coreDebug,
  coreWarn,
  coreInfo,
  coreError,
  isCivicPressError,
} from '@civicpress/core';
import { SnapshotStorage } from './storage.js';
import * as Y from 'yjs';

/** Snapshot binary format version. A row with a higher value is discarded. */
export const SNAPSHOT_FORMAT_V1 = 1;
/** Soft cap on snapshot size; over this we warn + emit, but still persist. */
export const MAX_SNAPSHOT_BYTES = 1 * 1024 * 1024; // 1 MB
/** Rows older than this whose room is inactive are eligible for cleanup. */
export const SNAPSHOT_TTL_MS = 48 * 60 * 60 * 1000; // 48h

export interface Snapshot {
  roomId: string;
  yjsState: Uint8Array;
  version: number;
  timestamp: number;
}

/** Caller-facing persist payload (W4 API). */
export interface PersistRequest {
  roomId: string;
  blob: Uint8Array;
}

/** A full snapshot row as stored, including W4 integrity/format/size metadata. */
export interface SnapshotRow {
  room_id: string;
  version: number;
  snapshot_data: Uint8Array;
  integrity_hash: string;
  format_version: number;
  byte_size: number;
  created_at: number;
}

export interface CleanupOptions {
  activeRoomIds: ReadonlySet<string>;
}

/** Typed payloads for the snapshot hook bus. */
export interface SnapshotHookEvents {
  'realtime:snapshot:oversize': {
    roomId: string;
    byteSize: number;
    cap: number;
  };
  'realtime:snapshot:integrity-failed': {
    roomId: string;
    version: number;
    expectedHash: string;
    computedHash: string;
  };
  'realtime:snapshot:expired': {
    roomId: string;
    version: number;
    ageMs: number;
  };
}

/**
 * Minimal typed event emitter for snapshot lifecycle events.
 *
 * The realtime module's HookSystem is async + string-keyed and aimed at
 * cross-module workflow hooks; for in-process snapshot observation (and for
 * tests that synchronously assert emissions) a small typed emitter is a
 * cleaner fit. Callers that want these on the global hook bus can subscribe
 * here and re-emit.
 */
export class SnapshotHookBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof SnapshotHookEvents>(
    event: K,
    listener: (payload: SnapshotHookEvents[K]) => void
  ): this {
    this.emitter.on(event, listener as (payload: unknown) => void);
    return this;
  }

  off<K extends keyof SnapshotHookEvents>(
    event: K,
    listener: (payload: SnapshotHookEvents[K]) => void
  ): this {
    this.emitter.off(event, listener as (payload: unknown) => void);
    return this;
  }

  emit<K extends keyof SnapshotHookEvents>(
    event: K,
    payload: SnapshotHookEvents[K]
  ): void {
    this.emitter.emit(event, payload);
  }
}

export class SnapshotManager {
  private logger: Logger;
  private storage: SnapshotStorage;
  private snapshots: Map<string, Snapshot> = new Map(); // roomId -> snapshot
  private hookBus: SnapshotHookBus;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    logger: Logger,
    storage: SnapshotStorage,
    hookBus?: SnapshotHookBus
  ) {
    this.logger = logger;
    this.storage = storage;
    // An always-present (possibly unobserved) bus keeps emit() unconditional.
    this.hookBus = hookBus ?? new SnapshotHookBus();
  }

  /** Expose the snapshot hook bus so callers can subscribe to lifecycle events. */
  getHookBus(): SnapshotHookBus {
    return this.hookBus;
  }

  // -------------------------------------------------------------------------
  // W4 caller-facing API (persist / loadLatest / loadLatestVerified /
  // cleanupExpired). W5 is written against these names.
  // -------------------------------------------------------------------------

  /**
   * Persist a snapshot blob with integrity hash, format version and byte size.
   *
   * Over-sized blobs (> MAX_SNAPSHOT_BYTES) still persist — dropping a snapshot
   * is worse than keeping an over-sized one — but warn + fire an oversize hook.
   */
  async persist(req: PersistRequest): Promise<void> {
    const { roomId, blob } = req;
    const integrityHash = createHash('sha256').update(blob).digest('hex');
    const byteSize = blob.byteLength;
    const formatVersion = SNAPSHOT_FORMAT_V1;
    const createdAt = Date.now();

    if (byteSize > MAX_SNAPSHOT_BYTES) {
      this.hookBus.emit('realtime:snapshot:oversize', {
        roomId,
        byteSize,
        cap: MAX_SNAPSHOT_BYTES,
      });
      coreWarn('Snapshot exceeds size cap; persisting anyway', {
        operation: 'realtime:snapshot:oversize',
        roomId,
        byteSize,
        cap: MAX_SNAPSHOT_BYTES,
      });
    }

    const latest = await this.storage.loadLatestRow(roomId);
    const nextVersion = latest ? latest.version + 1 : 1;

    const row: SnapshotRow = {
      room_id: roomId,
      version: nextVersion,
      snapshot_data: blob,
      integrity_hash: integrityHash,
      format_version: formatVersion,
      byte_size: byteSize,
      created_at: createdAt,
    };

    try {
      await this.storage.insert(row);
      // Keep the legacy in-memory cache coherent for callers still on the
      // Snapshot-shaped API (loadSnapshot / applySnapshot).
      this.snapshots.set(roomId, {
        roomId,
        yjsState: blob,
        version: nextVersion,
        timestamp: createdAt,
      });
      coreInfo('Snapshot persisted', {
        operation: 'realtime:snapshot:persisted',
        roomId,
        version: nextVersion,
        byteSize,
      });
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_SNAPSHOT_PERSIST_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:persist:error',
          roomId,
        }
      );
      throw error;
    }
  }

  /**
   * Load the latest raw snapshot row for a room (no integrity verification).
   *
   * Used internally by loadLatestVerified() and by admin/diagnostic tooling
   * that wants the raw blob + metadata even if it is corrupt.
   */
  async loadLatest(roomId: string): Promise<SnapshotRow | null> {
    return this.storage.loadLatestRow(roomId);
  }

  /**
   * Load the latest snapshot row, verifying integrity + format version.
   *
   * Returns null (so the caller falls back to reloading from Markdown) when:
   *   - the sha256 of snapshot_data does not match integrity_hash (corruption)
   *   - format_version is newer than SNAPSHOT_FORMAT_V1 (forward-compat hatch)
   */
  async loadLatestVerified(roomId: string): Promise<SnapshotRow | null> {
    const row = await this.loadLatest(roomId);
    if (!row) {
      return null;
    }

    const computedHash = createHash('sha256')
      .update(row.snapshot_data)
      .digest('hex');
    if (computedHash !== row.integrity_hash) {
      this.hookBus.emit('realtime:snapshot:integrity-failed', {
        roomId,
        version: row.version,
        expectedHash: row.integrity_hash,
        computedHash,
      });
      coreWarn(
        'Snapshot integrity check failed; falling back to Markdown reload',
        {
          operation: 'realtime:snapshot:integrity-failed',
          roomId,
          version: row.version,
        }
      );
      return null;
    }

    if (row.format_version > SNAPSHOT_FORMAT_V1) {
      coreWarn('Snapshot format-version is newer than supported; falling back', {
        operation: 'realtime:snapshot:format-too-new',
        roomId,
        formatVersion: row.format_version,
      });
      return null;
    }

    return row;
  }

  /**
   * Delete snapshot rows older than SNAPSHOT_TTL_MS whose room is not active.
   *
   * Active rooms are skipped: if a room is still in memory its snapshot is
   * load-bearing for the current grace-period semantics. Returns the number of
   * rows deleted; fires realtime:snapshot:expired per deleted row.
   */
  async cleanupExpired(opts: CleanupOptions): Promise<number> {
    const cutoff = Date.now() - SNAPSHOT_TTL_MS;
    const expiredRows = await this.storage.findOlderThan(cutoff);
    let deleted = 0;
    for (const row of expiredRows) {
      if (opts.activeRoomIds.has(row.room_id)) {
        continue;
      }
      await this.storage.deleteRow(row.room_id, row.version);
      // Drop the stale in-memory cache entry too.
      this.snapshots.delete(row.room_id);
      this.hookBus.emit('realtime:snapshot:expired', {
        roomId: row.room_id,
        version: row.version,
        ageMs: Date.now() - row.created_at,
      });
      deleted++;
    }
    if (deleted > 0) {
      coreInfo(`Snapshot cleanup deleted ${deleted} expired rows`, {
        operation: 'realtime:snapshot:cleanup',
        deleted,
      });
    }
    return deleted;
  }

  /**
   * Own the TTL cleanup interval so callers (e.g. RealtimeServer) only start /
   * stop it. Runs once immediately, then every intervalMs. Cleanup failures
   * are logged and retried at the next tick (never throw out of the timer).
   */
  startCleanup(
    activeRoomIdsProvider: () => ReadonlySet<string>,
    intervalMs: number
  ): void {
    if (this.cleanupTimer) {
      return;
    }
    const run = (): void => {
      void this.cleanupExpired({
        activeRoomIds: activeRoomIdsProvider(),
      }).catch((error) => {
        coreWarn('Snapshot cleanup failed; will retry next interval', {
          operation: 'realtime:snapshot:cleanup:error',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    };
    run();
    this.cleanupTimer = setInterval(run, intervalMs);
    // Do not keep the event loop alive solely for snapshot cleanup.
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /** Stop the TTL cleanup interval (idempotent). */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Create snapshot from yjs document
   */
  createSnapshot(roomId: string, yjsDoc: Y.Doc, version: number): Snapshot {
    const yjsState = Y.encodeStateAsUpdate(yjsDoc);
    const snapshot: Snapshot = {
      roomId,
      yjsState,
      version,
      timestamp: Date.now(),
    };

    this.snapshots.set(roomId, snapshot);

    coreDebug('Snapshot created', {
      operation: 'realtime:snapshot:created',
      roomId,
      version,
      size: yjsState.length,
    });

    return snapshot;
  }

  /**
   * Load snapshot for room
   */
  async loadSnapshot(roomId: string): Promise<Snapshot | null> {
    // Try memory first
    const memorySnapshot = this.snapshots.get(roomId);
    if (memorySnapshot) {
      coreDebug('Snapshot loaded from memory', {
        operation: 'realtime:snapshot:loaded',
        roomId,
        source: 'memory',
      });
      return memorySnapshot;
    }

    // Try storage
    try {
      const storedSnapshot = await this.storage.loadSnapshot(roomId);
      if (storedSnapshot) {
        // Cache in memory
        this.snapshots.set(roomId, storedSnapshot);
        coreDebug('Snapshot loaded from storage', {
          operation: 'realtime:snapshot:loaded',
          roomId,
          source: 'storage',
        });
        return storedSnapshot;
      }
    } catch (error) {
      coreWarn('Failed to load snapshot from storage', {
        operation: 'realtime:snapshot:load:error',
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Save snapshot to storage
   */
  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    try {
      // Save to storage
      await this.storage.saveSnapshot(snapshot);

      // Keep in memory
      this.snapshots.set(snapshot.roomId, snapshot);

      coreInfo('Snapshot saved', {
        operation: 'realtime:snapshot:saved',
        roomId: snapshot.roomId,
        version: snapshot.version,
        size: snapshot.yjsState.length,
      });
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_SNAPSHOT_SAVE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:save:error',
          roomId: snapshot.roomId,
        }
      );
      throw error;
    }
  }

  /**
   * Apply snapshot to yjs document
   */
  applySnapshot(yjsDoc: Y.Doc, snapshot: Snapshot): void {
    try {
      Y.applyUpdate(yjsDoc, snapshot.yjsState);
      coreInfo('Snapshot applied to yjs document', {
        operation: 'realtime:snapshot:applied',
        roomId: snapshot.roomId,
        version: snapshot.version,
      });
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_SNAPSHOT_APPLY_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:apply:error',
          roomId: snapshot.roomId,
        }
      );
      throw error;
    }
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(roomId: string): Promise<void> {
    this.snapshots.delete(roomId);
    await this.storage.deleteSnapshot(roomId);

    coreInfo('Snapshot deleted', {
      operation: 'realtime:snapshot:deleted',
      roomId,
    });
  }

  /**
   * Cleanup old snapshots
   */
  async cleanupOldSnapshots(maxAgeSeconds: number): Promise<void> {
    const now = Date.now();
    const maxAge = maxAgeSeconds * 1000;
    const roomsToDelete: string[] = [];

    for (const [roomId, snapshot] of this.snapshots.entries()) {
      if (now - snapshot.timestamp > maxAge) {
        roomsToDelete.push(roomId);
      }
    }

    for (const roomId of roomsToDelete) {
      await this.deleteSnapshot(roomId);
    }

    if (roomsToDelete.length > 0) {
      coreInfo(`Cleaned up ${roomsToDelete.length} old snapshots`, {
        operation: 'realtime:snapshot:cleanup',
      });
    }
  }
}
