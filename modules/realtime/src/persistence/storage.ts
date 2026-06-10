/**
 * Snapshot Storage Adapter
 *
 * Abstract storage interface for snapshots (database or filesystem)
 */

import type { Logger, DatabaseService } from '@civicpress/core';
import { coreError, isCivicPressError } from '@civicpress/core';
import type { Snapshot, SnapshotRow } from './snapshots.js';
import { SNAPSHOT_FORMAT_V1 } from './snapshots.js';
import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import path from 'path';

export interface SnapshotStorage {
  // Legacy Snapshot-shaped API (used by the existing realtime-server wiring).
  loadSnapshot(roomId: string): Promise<Snapshot | null>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  deleteSnapshot(roomId: string): Promise<void>;

  // W4 row-shaped API (integrity / format / size / TTL aware).
  /** Insert a fully-formed snapshot row (integrity hash + metadata included). */
  insert(row: SnapshotRow): Promise<void>;
  /** Load the latest row for a room (highest version), or null. */
  loadLatestRow(roomId: string): Promise<SnapshotRow | null>;
  /** Return every row whose created_at is strictly older than the cutoff. */
  findOlderThan(cutoff: number): Promise<SnapshotRow[]>;
  /** Delete a single (room_id, version) row. */
  deleteRow(roomId: string, version: number): Promise<void>;
}

/**
 * Database Snapshot Storage
 */
export class DatabaseSnapshotStorage implements SnapshotStorage {
  private db: DatabaseService;
  private logger: Logger;

  constructor(db: DatabaseService, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  async loadSnapshot(roomId: string): Promise<Snapshot | null> {
    try {
      const rows = await this.db.query(
        'SELECT * FROM realtime_snapshots WHERE room_id = ? ORDER BY version DESC LIMIT 1',
        [roomId]
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0] as {
        room_id: string;
        snapshot_data: Uint8Array;
        version: number;
        created_at: number;
      };
      return {
        roomId: row.room_id,
        yjsState: Buffer.from(row.snapshot_data),
        version: row.version,
        timestamp: row.created_at,
      };
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_LOAD_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:load:error',
          roomId,
        }
      );
      throw error;
    }
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    try {
      const snapshotId = `${snapshot.roomId}-${snapshot.version}-${snapshot.timestamp}`;
      await this.db.query(
        'INSERT OR REPLACE INTO realtime_snapshots (id, room_id, snapshot_data, version, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          snapshotId,
          snapshot.roomId,
          Buffer.from(snapshot.yjsState),
          snapshot.version,
          snapshot.timestamp,
        ]
      );
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_SAVE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:save:error',
          roomId: snapshot.roomId,
        }
      );
      throw error;
    }
  }

  async deleteSnapshot(roomId: string): Promise<void> {
    try {
      await this.db.query('DELETE FROM realtime_snapshots WHERE room_id = ?', [
        roomId,
      ]);
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_DELETE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:delete:error',
          roomId,
        }
      );
      throw error;
    }
  }

  // ---- W4 row-shaped API ----

  async insert(row: SnapshotRow): Promise<void> {
    try {
      const snapshotId = `${row.room_id}-${row.version}-${row.created_at}`;
      await this.db.query(
        `INSERT OR REPLACE INTO realtime_snapshots
           (id, room_id, snapshot_data, version, integrity_hash, format_version, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshotId,
          row.room_id,
          Buffer.from(row.snapshot_data),
          row.version,
          row.integrity_hash,
          row.format_version,
          row.byte_size,
          row.created_at,
        ]
      );
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_SAVE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:insert:error',
          roomId: row.room_id,
        }
      );
      throw error;
    }
  }

  async loadLatestRow(roomId: string): Promise<SnapshotRow | null> {
    try {
      const rows = await this.db.query(
        'SELECT * FROM realtime_snapshots WHERE room_id = ? ORDER BY version DESC LIMIT 1',
        [roomId]
      );
      if (rows.length === 0) {
        return null;
      }
      return this.toRow(rows[0]);
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_LOAD_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:load:error',
          roomId,
        }
      );
      throw error;
    }
  }

  async findOlderThan(cutoff: number): Promise<SnapshotRow[]> {
    try {
      const rows = await this.db.query(
        'SELECT * FROM realtime_snapshots WHERE created_at < ? ORDER BY created_at ASC',
        [cutoff]
      );
      return rows.map((r) => this.toRow(r));
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_LOAD_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        { operation: 'realtime:snapshot:storage:find-older:error' }
      );
      throw error;
    }
  }

  async deleteRow(roomId: string, version: number): Promise<void> {
    try {
      await this.db.query(
        'DELETE FROM realtime_snapshots WHERE room_id = ? AND version = ?',
        [roomId, version]
      );
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_DELETE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:delete-row:error',
          roomId,
        }
      );
      throw error;
    }
  }

  /** Map a raw DB row to a typed SnapshotRow (BLOB → Uint8Array). */
  private toRow(raw: unknown): SnapshotRow {
    const r = raw as {
      room_id: string;
      version: number;
      snapshot_data: Uint8Array;
      integrity_hash: string;
      format_version: number;
      byte_size: number;
      created_at: number;
    };
    return {
      room_id: r.room_id,
      version: r.version,
      snapshot_data: new Uint8Array(Buffer.from(r.snapshot_data)),
      integrity_hash: r.integrity_hash,
      format_version: r.format_version,
      byte_size: r.byte_size,
      created_at: r.created_at,
    };
  }
}

/**
 * Filesystem Snapshot Storage
 */
export class FilesystemSnapshotStorage implements SnapshotStorage {
  private basePath: string;
  private logger: Logger;

  constructor(basePath: string, logger: Logger) {
    this.basePath = path.join(basePath, 'realtime', 'snapshots');
    this.logger = logger;
  }

  async loadSnapshot(roomId: string): Promise<Snapshot | null> {
    try {
      // Find latest snapshot file for this room
      const snapshotDir = path.join(this.basePath, roomId);
      if (!(await fs.pathExists(snapshotDir))) {
        return null;
      }

      const files = await fs.readdir(snapshotDir);
      const snapshotFiles = files
        .filter((f) => f.endsWith('.snapshot'))
        .sort()
        .reverse(); // Latest first

      if (snapshotFiles.length === 0) {
        return null;
      }

      const latestFile = snapshotFiles[0];
      const filePath = path.join(snapshotDir, latestFile);
      const fileContent = await fs.readFile(filePath);

      // Parse filename: {roomId}-{version}-{timestamp}.snapshot
      const parts = latestFile.replace('.snapshot', '').split('-');
      const version = parseInt(parts[parts.length - 2] || '0', 10);
      const timestamp = parseInt(parts[parts.length - 1] || '0', 10);

      return {
        roomId,
        yjsState: new Uint8Array(fileContent),
        version,
        timestamp,
      };
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_LOAD_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:load:error',
          roomId,
        }
      );
      throw error;
    }
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    try {
      const snapshotDir = path.join(this.basePath, snapshot.roomId);
      await fs.ensureDir(snapshotDir);

      const filename = `${snapshot.roomId}-${snapshot.version}-${snapshot.timestamp}.snapshot`;
      const filePath = path.join(snapshotDir, filename);

      await fs.writeFile(filePath, Buffer.from(snapshot.yjsState));
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_SAVE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:save:error',
          roomId: snapshot.roomId,
        }
      );
      throw error;
    }
  }

  async deleteSnapshot(roomId: string): Promise<void> {
    try {
      const snapshotDir = path.join(this.basePath, roomId);
      if (await fs.pathExists(snapshotDir)) {
        await fs.remove(snapshotDir);
      }
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_DELETE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:delete:error',
          roomId,
        }
      );
      throw error;
    }
  }

  // ---- W4 row-shaped API ----
  //
  // The blob is written as <roomId>-<version>-<createdAt>.snapshot and the
  // integrity/format/size metadata in a <...>.meta.json sidecar next to it, so
  // the FS backend carries the same SnapshotRow as the DB backend.

  async insert(row: SnapshotRow): Promise<void> {
    try {
      const snapshotDir = path.join(this.basePath, row.room_id);
      await fs.ensureDir(snapshotDir);

      const base = `${row.room_id}-${row.version}-${row.created_at}`;
      await fs.writeFile(
        path.join(snapshotDir, `${base}.snapshot`),
        Buffer.from(row.snapshot_data)
      );
      await fs.writeJson(path.join(snapshotDir, `${base}.meta.json`), {
        room_id: row.room_id,
        version: row.version,
        integrity_hash: row.integrity_hash,
        format_version: row.format_version,
        byte_size: row.byte_size,
        created_at: row.created_at,
      });
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_SAVE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:insert:error',
          roomId: row.room_id,
        }
      );
      throw error;
    }
  }

  async loadLatestRow(roomId: string): Promise<SnapshotRow | null> {
    try {
      const snapshotDir = path.join(this.basePath, roomId);
      if (!(await fs.pathExists(snapshotDir))) {
        return null;
      }
      const files = await fs.readdir(snapshotDir);
      const bases = files
        .filter((f) => f.endsWith('.snapshot'))
        .map((f) => f.replace('.snapshot', ''));
      if (bases.length === 0) {
        return null;
      }
      // Highest version wins (version is the middle segment).
      let best: { base: string; version: number } | null = null;
      for (const base of bases) {
        const version = this.parseVersion(base);
        if (!best || version > best.version) {
          best = { base, version };
        }
      }
      if (!best) {
        return null;
      }
      return this.readRow(snapshotDir, best.base, roomId);
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_LOAD_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:load:error',
          roomId,
        }
      );
      throw error;
    }
  }

  async findOlderThan(cutoff: number): Promise<SnapshotRow[]> {
    try {
      if (!(await fs.pathExists(this.basePath))) {
        return [];
      }
      const result: SnapshotRow[] = [];
      const roomDirs = await fs.readdir(this.basePath);
      for (const roomId of roomDirs) {
        const snapshotDir = path.join(this.basePath, roomId);
        const stat = await fs.stat(snapshotDir);
        if (!stat.isDirectory()) {
          continue;
        }
        const files = await fs.readdir(snapshotDir);
        const bases = files
          .filter((f) => f.endsWith('.snapshot'))
          .map((f) => f.replace('.snapshot', ''));
        for (const base of bases) {
          const rowItem = await this.readRow(snapshotDir, base, roomId);
          if (rowItem.created_at < cutoff) {
            result.push(rowItem);
          }
        }
      }
      result.sort((a, b) => a.created_at - b.created_at);
      return result;
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_LOAD_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        { operation: 'realtime:snapshot:storage:find-older:error' }
      );
      throw error;
    }
  }

  async deleteRow(roomId: string, version: number): Promise<void> {
    try {
      const snapshotDir = path.join(this.basePath, roomId);
      if (!(await fs.pathExists(snapshotDir))) {
        return;
      }
      const files = await fs.readdir(snapshotDir);
      for (const f of files) {
        const base = f.replace(/\.(snapshot|meta\.json)$/, '');
        if (this.parseVersion(base) === version) {
          await fs.remove(path.join(snapshotDir, f));
        }
      }
      // Remove the room dir if now empty.
      const remaining = await fs.readdir(snapshotDir);
      if (remaining.length === 0) {
        await fs.remove(snapshotDir);
      }
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error)
          ? undefined
          : 'REALTIME_SNAPSHOT_STORAGE_DELETE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:snapshot:storage:delete-row:error',
          roomId,
        }
      );
      throw error;
    }
  }

  /** Extract the version (middle segment) from a `<room>-<version>-<ts>` base. */
  private parseVersion(base: string): number {
    const parts = base.split('-');
    return parseInt(parts[parts.length - 2] || '0', 10);
  }

  /**
   * Read a SnapshotRow from a blob + sidecar. If the sidecar is missing (e.g.
   * a snapshot written by the legacy saveSnapshot()), the hash is recomputed
   * on load and format/size are defaulted, so the row is still usable.
   */
  private async readRow(
    snapshotDir: string,
    base: string,
    roomId: string
  ): Promise<SnapshotRow> {
    const blob = new Uint8Array(
      await fs.readFile(path.join(snapshotDir, `${base}.snapshot`))
    );
    const metaPath = path.join(snapshotDir, `${base}.meta.json`);
    if (await fs.pathExists(metaPath)) {
      const meta = (await fs.readJson(metaPath)) as {
        version: number;
        integrity_hash: string;
        format_version: number;
        byte_size: number;
        created_at: number;
      };
      return {
        room_id: roomId,
        version: meta.version,
        snapshot_data: blob,
        integrity_hash: meta.integrity_hash,
        format_version: meta.format_version,
        byte_size: meta.byte_size,
        created_at: meta.created_at,
      };
    }
    // Sidecar-less legacy blob: reconstruct from the filename + recompute hash.
    const parts = base.split('-');
    const version = parseInt(parts[parts.length - 2] || '0', 10);
    const createdAt = parseInt(parts[parts.length - 1] || '0', 10);
    return {
      room_id: roomId,
      version,
      snapshot_data: blob,
      integrity_hash: createHash('sha256').update(blob).digest('hex'),
      format_version: SNAPSHOT_FORMAT_V1,
      byte_size: blob.byteLength,
      created_at: createdAt,
    };
  }
}
