/**
 * Lock-management methods for RecordsService.
 *
 * Phase 2d W2-T8: extracted verbatim from records-service.ts. Method
 * bodies unchanged.
 */

import { DatabaseService } from '@civicpress/core';
import type { AuthUser, RecordLockRow } from '@civicpress/core';

export interface RecordsLocksDeps {
  db: DatabaseService;
}

export class RecordsLocks {
  constructor(private readonly deps: RecordsLocksDeps) {}

  async acquireLock(
    recordId: string,
    user: AuthUser,
    lockDurationMinutes = 30
  ): Promise<boolean> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + lockDurationMinutes);
    const lockedBy = user.id?.toString() || user.username;

    return await this.deps.db.acquireLock(recordId, lockedBy, expiresAt);
  }

  async releaseLock(recordId: string, user: AuthUser): Promise<boolean> {
    const lockedBy = user.id?.toString() || user.username;
    return await this.deps.db.releaseLock(recordId, lockedBy);
  }

  async getLock(recordId: string): Promise<RecordLockRow | null> {
    return await this.deps.db.getLock(recordId);
  }

  async refreshLock(
    recordId: string,
    user: AuthUser,
    lockDurationMinutes = 30
  ): Promise<boolean> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + lockDurationMinutes);
    const lockedBy = user.id?.toString() || user.username;

    return await this.deps.db.refreshLock(recordId, lockedBy, expiresAt);
  }
}
