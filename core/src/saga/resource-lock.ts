/**
 * Resource Lock for Concurrency Control
 *
 * Prevents concurrent execution of sagas on the same resource.
 */

import { DatabaseService } from '../database/database-service.js';
import { ResourceLock } from './types.js';
import { SagaLockError } from './errors.js';
import { coreDebug, coreError, coreWarn } from '../utils/core-output.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

/**
 * Resource lock manager for saga concurrency control
 */
export class ResourceLockManager {
  private db: DatabaseService;
  private defaultTimeout: number; // Default lock timeout in milliseconds

  constructor(
    databaseService: DatabaseService,
    defaultTimeout: number = 30000 // 30 seconds default
  ) {
    this.db = databaseService;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Acquire lock on a resource
   * Throws SagaLockError if lock cannot be acquired
   */
  async acquireLock(
    resourceKey: string,
    sagaId: string,
    timeout: number = this.defaultTimeout
  ): Promise<ResourceLock> {
    const expiresAt = new Date(Date.now() + timeout);
    const acquiredAt = new Date();

    try {
      // Try to insert lock (will fail if resource is already locked)
      await this.db.getAdapter().execute(
        `INSERT INTO saga_resource_locks (resource_key, saga_id, acquired_at, expires_at)
         VALUES (?, ?, ?, ?)`,
        [resourceKey, sagaId, acquiredAt.toISOString(), expiresAt.toISOString()]
      );

      coreDebug(
        `Resource lock acquired: ${resourceKey} by saga ${sagaId}`,
        {
          resourceKey,
          sagaId,
          expiresAt: expiresAt.toISOString(),
        },
        { operation: 'saga:lock:acquire' }
      );

      return {
        key: resourceKey,
        holder: sagaId,
        acquiredAt,
        timeout,
        expiresAt,
      };
    } catch (error: any) {
      // Check if lock already exists
      const existingLock = await this.getLock(resourceKey);

      if (existingLock) {
        // Check if lock is expired
        if (existingLock.expiresAt < new Date()) {
          // Lock expired, try to acquire it
          await this.releaseLock(resourceKey); // Clean up expired lock
          return this.acquireLock(resourceKey, sagaId, timeout); // Retry
        }

        // Lock is held by another saga
        throw new SagaLockError(
          resourceKey,
          `Resource is locked by saga ${existingLock.holder} until ${existingLock.expiresAt.toISOString()}`
        );
      }

      // Other error
      coreError(
        `Failed to acquire lock: ${resourceKey}`,
        'SAGA_LOCK_ACQUIRE_ERROR',
        {
          resourceKey,
          sagaId,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:lock:acquire' }
      );
      throw error;
    }
  }

  /**
   * Release lock on a resource
   */
  async releaseLock(resourceKey: string, sagaId?: string): Promise<void> {
    try {
      if (sagaId) {
        // Release only if held by this saga
        await this.db.getAdapter().execute(
          `DELETE FROM saga_resource_locks 
           WHERE resource_key = ? AND saga_id = ?`,
          [resourceKey, sagaId]
        );
      } else {
        // Release regardless of holder
        await this.db
          .getAdapter()
          .execute('DELETE FROM saga_resource_locks WHERE resource_key = ?', [
            resourceKey,
          ]);
      }

      coreDebug(
        `Resource lock released: ${resourceKey}`,
        {
          resourceKey,
          sagaId,
        },
        { operation: 'saga:lock:release' }
      );
    } catch (error) {
      coreError(
        `Failed to release lock: ${resourceKey}`,
        'SAGA_LOCK_RELEASE_ERROR',
        {
          resourceKey,
          sagaId,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:lock:release' }
      );
      throw error;
    }
  }

  /**
   * Get current lock on a resource
   */
  async getLock(resourceKey: string): Promise<ResourceLock | null> {
    try {
      const rows = await this.db
        .getAdapter()
        .query('SELECT * FROM saga_resource_locks WHERE resource_key = ?', [
          resourceKey,
        ]);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        key: row.resource_key,
        holder: row.saga_id,
        acquiredAt: new Date(row.acquired_at),
        timeout:
          new Date(row.expires_at).getTime() -
          new Date(row.acquired_at).getTime(),
        expiresAt: new Date(row.expires_at),
      };
    } catch (error) {
      coreError(
        `Failed to get lock: ${resourceKey}`,
        'SAGA_LOCK_GET_ERROR',
        {
          resourceKey,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:lock:get' }
      );
      throw error;
    }
  }

  /**
   * Clean up expired locks
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const result = await this.db
        .getAdapter()
        .execute(`DELETE FROM saga_resource_locks WHERE expires_at < ?`, [
          new Date().toISOString(),
        ]);

      const deletedCount = (result as any).changes || 0;

      if (deletedCount > 0) {
        coreDebug(
          `Cleaned up ${deletedCount} expired locks`,
          { deletedCount },
          { operation: 'saga:lock:cleanup' }
        );
      }

      return deletedCount;
    } catch (error) {
      coreWarn('Failed to cleanup expired locks', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'saga:lock:cleanup',
      });
      return 0;
    }
  }

  /**
   * Extend lock timeout
   */
  async extendLock(
    resourceKey: string,
    sagaId: string,
    additionalTimeout: number
  ): Promise<void> {
    try {
      const lock = await this.getLock(resourceKey);
      if (!lock || lock.holder !== sagaId) {
        throw new SagaLockError(resourceKey, 'Lock not held by this saga');
      }

      const newExpiresAt = new Date(
        lock.expiresAt.getTime() + additionalTimeout
      );

      await this.db.getAdapter().execute(
        `UPDATE saga_resource_locks 
         SET expires_at = ? 
         WHERE resource_key = ? AND saga_id = ?`,
        [newExpiresAt.toISOString(), resourceKey, sagaId]
      );

      coreDebug(
        `Lock extended: ${resourceKey}`,
        {
          resourceKey,
          sagaId,
          newExpiresAt: newExpiresAt.toISOString(),
        },
        { operation: 'saga:lock:extend' }
      );
    } catch (error) {
      coreError(
        `Failed to extend lock: ${resourceKey}`,
        'SAGA_LOCK_EXTEND_ERROR',
        {
          resourceKey,
          sagaId,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:lock:extend' }
      );
      throw error;
    }
  }
}
