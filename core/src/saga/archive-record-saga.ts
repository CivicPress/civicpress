/**
 * Archive Record Saga
 *
 * Orchestrates the multi-step process of archiving a record.
 */

import { Saga, SagaContext, SagaStep } from './types.js';
import { BaseSagaStep } from './saga-step.js';
import { DatabaseService } from '../database/database-service.js';
import { RecordManager, RecordData } from '../records/record-manager.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { IndexingService } from '../indexing/indexing-service.js';
import { AuthUser } from '../auth/auth-service.js';
import { coreDebug, coreError } from '../utils/core-output.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  parseRecordRelativePath,
  buildArchiveRelativePath,
  ensureDirectoryForRecordPath,
} from '../utils/record-paths.js';

/**
 * Context for ArchiveRecord saga
 */
export interface ArchiveRecordContext extends SagaContext {
  /** Record ID to archive */
  recordId: string;
  /** User archiving the record */
  user: AuthUser;
  /** Original record data (before archive) - stored for compensation */
  originalRecord?: RecordData;
  /** Original file path (before move) */
  originalFilePath?: string;
  /** Archive file path (after move) */
  archiveFilePath?: string;
  /** Git commit hash (from step 3) */
  commitHash?: string;
}

/**
 * Step 1: Update status to archived (ACID)
 */
class UpdateStatusToArchivedStep extends BaseSagaStep<
  ArchiveRecordContext,
  RecordData
> {
  name = 'UpdateStatusToArchived';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(
    private db: DatabaseService,
    private recordManager: RecordManager
  ) {
    super(30000);
  }

  async execute(context: ArchiveRecordContext): Promise<RecordData> {
    this.logStep('start', context);

    try {
      // Get existing record
      const record = await this.recordManager.getRecord(context.recordId);
      if (!record) {
        throw new Error(`Record not found: ${context.recordId}`);
      }

      // Store original record for compensation
      context.originalRecord = { ...record };
      context.originalFilePath = record.path;

      // Update status to archived
      await this.db.updateRecord(context.recordId, {
        status: 'archived',
        metadata: JSON.stringify({
          ...record.metadata,
          archived_by: context.user.username,
          archived_by_id: context.user.id,
          archived_by_name: context.user.name || context.user.username,
          archived_at: new Date().toISOString(),
        }),
      });

      // Get updated record
      const updatedRecord = await this.recordManager.getRecord(
        context.recordId
      );
      if (!updatedRecord) {
        throw new Error(
          `Failed to retrieve updated record: ${context.recordId}`
        );
      }

      this.logStep('complete', context, updatedRecord);

      return updatedRecord;
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }

  async compensate(
    context: ArchiveRecordContext,
    result: RecordData
  ): Promise<void> {
    // Restore original status
    if (context.originalRecord && result) {
      try {
        const original = context.originalRecord;
        await this.db.updateRecord(context.recordId, {
          status: original.status,
          metadata: JSON.stringify(original.metadata),
        });

        coreDebug(
          `Compensated: Restored record ${context.recordId} to original status`,
          {
            recordId: context.recordId,
            correlationId: context.correlationId,
          }
        );
      } catch (error) {
        coreError(
          `Failed to compensate UpdateStatusToArchived step: ${context.recordId}`,
          'SAGA_COMPENSATION_ERROR',
          {
            recordId: context.recordId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        throw error;
      }
    }
  }
}

/**
 * Step 2: Move file to archive folder
 */
class MoveFileToArchiveStep extends BaseSagaStep<ArchiveRecordContext, string> {
  name = 'MoveFileToArchive';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(private dataDir: string) {
    super(30000);
  }

  async execute(context: ArchiveRecordContext): Promise<string> {
    this.logStep('start', context);

    if (!context.originalRecord || !context.originalFilePath) {
      throw new Error('Original record and file path not available in context');
    }

    const record = context.originalRecord;
    const filePath = context.originalFilePath;

    try {
      // Determine archive path
      const parsedPath = parseRecordRelativePath(filePath);
      const archivePath =
        parsedPath.year && parsedPath.type === record.type
          ? path
              .join('archive', record.type, parsedPath.year, `${record.id}.md`)
              .replace(/\\/g, '/')
          : buildArchiveRelativePath(record.type, record.id, record.created_at);

      const sourcePath = path.join(this.dataDir, filePath);
      const targetPath = path.join(this.dataDir, archivePath);

      // Ensure archive directory exists
      ensureDirectoryForRecordPath(this.dataDir, archivePath);

      // Move file
      await fs.rename(sourcePath, targetPath);

      context.archiveFilePath = archivePath;
      this.logStep('complete', context, archivePath);

      return archivePath;
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }

  async compensate(
    context: ArchiveRecordContext,
    result: string
  ): Promise<void> {
    // Move file back to original location
    if (context.originalFilePath && result) {
      try {
        const sourcePath = path.join(this.dataDir, result);
        const targetPath = path.join(this.dataDir, context.originalFilePath);

        // Ensure target directory exists
        ensureDirectoryForRecordPath(this.dataDir, context.originalFilePath);

        // Move file back
        await fs.rename(sourcePath, targetPath).catch(() => {
          // File might not exist, that's okay
        });

        coreDebug(
          `Compensated: Moved file back from ${result} to ${context.originalFilePath}`,
          {
            archivePath: result,
            originalPath: context.originalFilePath,
            correlationId: context.correlationId,
          }
        );
      } catch (error) {
        coreError(
          `Failed to compensate MoveFileToArchive step: ${result}`,
          'SAGA_COMPENSATION_ERROR',
          {
            archivePath: result,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        // Don't throw - file cleanup is best effort
      }
    }
  }
}

/**
 * Step 3: Commit to Git (Authoritative - no rollback)
 */
class CommitToGitStep extends BaseSagaStep<ArchiveRecordContext, string> {
  name = 'CommitToGit';
  isCompensatable = false; // Git commits are never rolled back
  timeout = 30000; // 30 seconds

  constructor(private git: GitEngine) {
    super(30000);
  }

  async execute(context: ArchiveRecordContext): Promise<string> {
    this.logStep('start', context);

    if (!context.originalRecord || !context.archiveFilePath) {
      throw new Error('Record and archive file path not available in context');
    }

    try {
      const record = context.originalRecord;
      const archivePath = context.archiveFilePath;
      const message = `Archive record: ${record.title}`;

      // Commit to Git (both deletion of original and addition of archive)
      const commitHash = await this.git.commit(message, [archivePath]);

      context.commitHash = commitHash;
      this.logStep('complete', context, commitHash);

      return commitHash;
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }
}

/**
 * Step 4: Remove from index (Derived - fire and forget)
 */
class RemoveFromIndexStep extends BaseSagaStep<ArchiveRecordContext, void> {
  name = 'RemoveFromIndex';
  isCompensatable = false; // Derived state
  timeout = 5000; // 5 seconds

  constructor(private db: DatabaseService) {
    super(5000);
  }

  async execute(context: ArchiveRecordContext): Promise<void> {
    this.logStep('start', context);

    if (!context.originalRecord) {
      return;
    }

    try {
      // Remove from search index (fire and forget)
      await this.db.removeRecordFromIndex(
        context.recordId,
        context.originalRecord.type
      );

      this.logStep('complete', context);
    } catch (error) {
      // Don't fail saga for indexing errors
      this.logStep('fail', context, undefined, error as Error);
      // Swallow error - indexing is derived state
      coreDebug(`Index removal failed (will retry): ${context.recordId}`, {
        recordId: context.recordId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Step 5: Emit hooks (Derived - fire and forget)
 */
class EmitHooksStep extends BaseSagaStep<ArchiveRecordContext, boolean> {
  name = 'EmitHooks';
  isCompensatable = false; // Derived state
  timeout = 5000; // 5 seconds

  constructor(private hooks: HookSystem) {
    super(5000);
  }

  async execute(context: ArchiveRecordContext): Promise<boolean> {
    this.logStep('start', context);

    if (!context.originalRecord) {
      throw new Error('Original record not available in context');
    }

    try {
      // Emit hook (fire and forget)
      await this.hooks.emit('record:archived', {
        record: context.originalRecord,
        user: context.user,
        action: 'archive',
      });

      this.logStep('complete', context);
    } catch (error) {
      // Don't fail saga for hook errors
      this.logStep('fail', context, undefined, error as Error);
      // Swallow error - hooks are derived state
      coreDebug(`Hook emission failed (will retry): record:archived`, {
        recordId: context.originalRecord.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Return true (saga result - archive succeeded)
    return true;
  }
}

/**
 * Archive Record Saga
 */
export class ArchiveRecordSaga implements Saga<ArchiveRecordContext, boolean> {
  name = 'ArchiveRecord';
  version = '1.0.0';
  steps: SagaStep<ArchiveRecordContext, any>[];

  constructor(
    db: DatabaseService,
    recordManager: RecordManager,
    git: GitEngine,
    hooks: HookSystem,
    dataDir: string
  ) {
    this.steps = [
      new UpdateStatusToArchivedStep(db, recordManager),
      new MoveFileToArchiveStep(dataDir),
      new CommitToGitStep(git),
      new RemoveFromIndexStep(db),
      new EmitHooksStep(hooks),
    ];
  }

  validateContext(context: ArchiveRecordContext): {
    valid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!context.recordId) {
      errors.push('recordId is required');
    }

    if (!context.user) {
      errors.push('user is required');
    }

    if (!context.correlationId) {
      errors.push('correlationId is required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
