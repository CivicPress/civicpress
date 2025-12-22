/**
 * Snapshot Manager
 *
 * Manages yjs document snapshots for recovery and faster reconnection
 */

import type { Logger } from '@civicpress/core';
import type { SnapshotMetadata } from '../types/realtime.types.js';
import { SnapshotStorage } from './storage.js';
import * as Y from 'yjs';

export interface Snapshot {
  roomId: string;
  yjsState: Uint8Array;
  version: number;
  timestamp: number;
}

export class SnapshotManager {
  private logger: Logger;
  private storage: SnapshotStorage;
  private snapshots: Map<string, Snapshot> = new Map(); // roomId -> snapshot

  constructor(logger: Logger, storage: SnapshotStorage) {
    this.logger = logger;
    this.storage = storage;
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

    this.logger.debug('Snapshot created', {
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
      this.logger.debug('Snapshot loaded from memory', {
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
        this.logger.debug('Snapshot loaded from storage', {
          operation: 'realtime:snapshot:loaded',
          roomId,
          source: 'storage',
        });
        return storedSnapshot;
      }
    } catch (error) {
      this.logger.warn('Failed to load snapshot from storage', {
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

      this.logger.info('Snapshot saved', {
        operation: 'realtime:snapshot:saved',
        roomId: snapshot.roomId,
        version: snapshot.version,
        size: snapshot.yjsState.length,
      });
    } catch (error) {
      this.logger.error('Failed to save snapshot', {
        operation: 'realtime:snapshot:save:error',
        roomId: snapshot.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Apply snapshot to yjs document
   */
  applySnapshot(yjsDoc: Y.Doc, snapshot: Snapshot): void {
    try {
      Y.applyUpdate(yjsDoc, snapshot.yjsState);
      this.logger.info('Snapshot applied to yjs document', {
        operation: 'realtime:snapshot:applied',
        roomId: snapshot.roomId,
        version: snapshot.version,
      });
    } catch (error) {
      this.logger.error('Failed to apply snapshot', {
        operation: 'realtime:snapshot:apply:error',
        roomId: snapshot.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(roomId: string): Promise<void> {
    this.snapshots.delete(roomId);
    await this.storage.deleteSnapshot(roomId);

    this.logger.info('Snapshot deleted', {
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
      this.logger.info(`Cleaned up ${roomsToDelete.length} old snapshots`, {
        operation: 'realtime:snapshot:cleanup',
      });
    }
  }
}
