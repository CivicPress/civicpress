/**
 * Snapshot Storage Adapter
 *
 * Abstract storage interface for snapshots (database or filesystem)
 */

import type { Logger, DatabaseService } from '@civicpress/core';
import type { Snapshot } from './snapshots.js';
import fs from 'fs-extra';
import path from 'path';

export interface SnapshotStorage {
  loadSnapshot(roomId: string): Promise<Snapshot | null>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  deleteSnapshot(roomId: string): Promise<void>;
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

      const row = rows[0];
      return {
        roomId: row.room_id,
        yjsState: Buffer.from(row.snapshot_data),
        version: row.version,
        timestamp: row.created_at,
      };
    } catch (error) {
      this.logger.error('Failed to load snapshot from database', {
        operation: 'realtime:snapshot:storage:load:error',
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
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
      this.logger.error('Failed to save snapshot to database', {
        operation: 'realtime:snapshot:storage:save:error',
        roomId: snapshot.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteSnapshot(roomId: string): Promise<void> {
    try {
      await this.db.query('DELETE FROM realtime_snapshots WHERE room_id = ?', [
        roomId,
      ]);
    } catch (error) {
      this.logger.error('Failed to delete snapshot from database', {
        operation: 'realtime:snapshot:storage:delete:error',
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
      this.logger.error('Failed to load snapshot from filesystem', {
        operation: 'realtime:snapshot:storage:load:error',
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
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
      this.logger.error('Failed to save snapshot to filesystem', {
        operation: 'realtime:snapshot:storage:save:error',
        roomId: snapshot.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
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
      this.logger.error('Failed to delete snapshot from filesystem', {
        operation: 'realtime:snapshot:storage:delete:error',
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
