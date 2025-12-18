/**
 * Publish Draft Saga
 *
 * Orchestrates the multi-step process of publishing a draft record.
 */

import { Saga, SagaContext, SagaStep } from './types.js';
import { BaseSagaStep } from './saga-step.js';
import { DatabaseService } from '../database/database-service.js';
import { RecordManager, RecordData } from '../records/record-manager.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { IndexingService } from '../indexing/indexing-service.js';
import { AuthUser } from '../auth/auth-service.js';
import { CreateRecordRequest, UpdateRecordRequest } from '../civic-core.js';
import { coreDebug, coreError } from '../utils/core-output.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RecordParser } from '../records/record-parser.js';
import { RecordSchemaValidator } from '../records/record-schema-validator.js';
import {
  buildRecordRelativePath,
  ensureDirectoryForRecordPath,
} from '../utils/record-paths.js';
import matter from 'gray-matter';
import { RecordValidationError } from '../errors/domain-errors.js';

/**
 * Context for PublishDraft saga
 */
export interface PublishDraftContext extends SagaContext {
  /** Draft ID to publish */
  draftId: string;
  /** Target status for published record */
  targetStatus?: string;
  /** User performing the publish (overrides SagaContext user with AuthUser) */
  user: AuthUser;
  /** Draft data (loaded in step 1) */
  draft?: any;
  /** Record data (created/updated in step 1) */
  record?: RecordData;
  /** File path (created in step 2) */
  filePath?: string;
  /** Git commit hash (from step 3) */
  commitHash?: string;
  /** Whether record already existed (for compensation logic) */
  recordExisted?: boolean;
}

/**
 * Step 1: Move from record_drafts to records table (ACID)
 */
class MoveToRecordsStep extends BaseSagaStep<PublishDraftContext, RecordData> {
  name = 'MoveToRecords';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(
    private db: DatabaseService,
    private recordManager: RecordManager
  ) {
    super(30000);
  }

  async execute(context: PublishDraftContext): Promise<RecordData> {
    this.logStep('start', context);

    try {
      // Get draft
      const draft = await this.db.getDraft(context.draftId);
      if (!draft) {
        throw new Error(`Draft not found: ${context.draftId}`);
      }

      context.draft = draft;

      // Use target status or draft's current status
      const finalStatus = context.targetStatus || draft.status;

      // Check if record already exists
      const existingRecord = await this.db.getRecord(context.draftId);
      context.recordExisted = !!existingRecord;

      let record: RecordData;

      if (existingRecord) {
        // Record exists: UPDATE it
        // We need to update the DB without calling updateRecordFile (saga handles file separately)
        // So we'll update the DB directly
        const updatedRecord: RecordData = {
          ...existingRecord,
          title: draft.title,
          content: draft.markdown_body,
          status: finalStatus,
          workflowState: undefined, // Clear editorial state
          updated_at: new Date().toISOString(),
          metadata: draft.metadata ? JSON.parse(draft.metadata) : {},
          geography: draft.geography ? JSON.parse(draft.geography) : undefined,
          attachedFiles: draft.attached_files
            ? JSON.parse(draft.attached_files)
            : undefined,
          linkedRecords: draft.linked_records
            ? JSON.parse(draft.linked_records)
            : undefined,
          linkedGeographyFiles: draft.linked_geography_files
            ? JSON.parse(draft.linked_geography_files)
            : undefined,
        };

        // Ensure path is set (use existing path or generate new one)
        if (!updatedRecord.path) {
          const { buildRecordRelativePath } = await import(
            '../utils/record-paths.js'
          );
          updatedRecord.path = buildRecordRelativePath(
            updatedRecord.type,
            updatedRecord.id,
            updatedRecord.created_at
          );
        }

        // Update in database directly (without file operations)
        const dbUpdates: any = {
          title: updatedRecord.title,
          content: updatedRecord.content,
          status: updatedRecord.status,
          workflow_state: null, // Clear editorial state
          updated_at: updatedRecord.updated_at,
          geography: updatedRecord.geography
            ? JSON.stringify(updatedRecord.geography)
            : undefined,
          attached_files: updatedRecord.attachedFiles
            ? JSON.stringify(updatedRecord.attachedFiles)
            : undefined,
          linked_records: updatedRecord.linkedRecords
            ? JSON.stringify(updatedRecord.linkedRecords)
            : undefined,
          linked_geography_files: updatedRecord.linkedGeographyFiles
            ? JSON.stringify(updatedRecord.linkedGeographyFiles)
            : undefined,
          metadata: JSON.stringify({
            ...updatedRecord.metadata,
            ...(updatedRecord.authors && { authors: updatedRecord.authors }),
            ...(updatedRecord.source && { source: updatedRecord.source }),
          }),
        };

        await this.db.updateRecord(context.draftId, dbUpdates);

        record = updatedRecord;
      } else {
        // Record doesn't exist: CREATE it
        const createRequest: CreateRecordRequest = {
          title: draft.title,
          type: draft.type,
          content: draft.markdown_body,
          metadata: draft.metadata ? JSON.parse(draft.metadata) : {},
          geography: draft.geography ? JSON.parse(draft.geography) : undefined,
          attachedFiles: draft.attached_files
            ? JSON.parse(draft.attached_files)
            : undefined,
          linkedRecords: draft.linked_records
            ? JSON.parse(draft.linked_records)
            : undefined,
          linkedGeographyFiles: draft.linked_geography_files
            ? JSON.parse(draft.linked_geography_files)
            : undefined,
          status: finalStatus,
          workflowState: undefined, // Clear editorial state
          createdAt: draft.created_at,
          updatedAt: new Date().toISOString(),
          skipFileGeneration: true, // Saga will handle file creation separately
        };

        record = await this.recordManager.createRecordWithId(
          context.draftId,
          createRequest,
          context.user
        );
      }

      context.record = record;
      this.logStep('complete', context, record);

      return record;
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }

  async compensate(
    context: PublishDraftContext,
    result: RecordData
  ): Promise<void> {
    // If record was created (didn't exist before), delete it
    if (!context.recordExisted && result) {
      try {
        await this.db
          .getAdapter()
          .execute('DELETE FROM records WHERE id = ?', [result.id]);
        coreDebug(
          `Compensated: Deleted record ${result.id} from records table`,
          {
            recordId: result.id,
            correlationId: context.correlationId,
          }
        );
      } catch (error) {
        coreError(
          `Failed to compensate MoveToRecords step: ${result.id}`,
          'SAGA_COMPENSATION_ERROR',
          {
            recordId: result.id,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        throw error;
      }
    }
    // If record was updated, we can't easily rollback without storing previous state
    // This is a limitation - in production, we might want to store previous state
  }
}

/**
 * Step 2: Create/update file in Git working tree
 */
class CreateOrUpdateFileStep extends BaseSagaStep<PublishDraftContext, string> {
  name = 'CreateOrUpdateFile';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(
    private recordManager: RecordManager,
    private dataDir: string
  ) {
    super(30000);
  }

  async execute(context: PublishDraftContext): Promise<string> {
    this.logStep('start', context);

    if (!context.record) {
      throw new Error('Record not available in context');
    }

    const record = context.record;
    const filePath = record.path;
    if (!filePath) {
      throw new Error(`Record ${record.id} has no path`);
    }

    try {
      // Normalize source field
      const normalizedRecord = { ...record };
      if (
        normalizedRecord.source &&
        typeof normalizedRecord.source === 'string'
      ) {
        normalizedRecord.source = {
          reference: normalizedRecord.source,
        };
      }

      // Create markdown content
      const content = this.createMarkdownContent(normalizedRecord);

      // Validate schema
      const { data: frontmatter } = matter(content);
      const normalizedFrontmatter =
        this.normalizeFrontmatterForValidation(frontmatter);

      const schemaValidation = RecordSchemaValidator.validate(
        normalizedFrontmatter,
        record.type,
        {
          includeModuleExtensions: true,
          includeTypeExtensions: true,
          strict: false,
        }
      );

      if (!schemaValidation.isValid && schemaValidation.errors.length > 0) {
        const errorMessages = schemaValidation.errors
          .map((err) => `${err.field}: ${err.message}`)
          .join('; ');
        throw new RecordValidationError(
          `Schema validation failed: ${errorMessages}`,
          { recordId: record.id, validationErrors: schemaValidation.errors }
        );
      }

      // Ensure directory exists
      ensureDirectoryForRecordPath(this.dataDir, filePath);
      const fullPath = path.join(this.dataDir, filePath);

      // Write file (without committing)
      await fs.writeFile(fullPath, content, 'utf8');

      context.filePath = filePath;
      this.logStep('complete', context, filePath);

      return filePath;
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }

  async compensate(
    context: PublishDraftContext,
    result: string
  ): Promise<void> {
    // Delete the file if it was created
    if (result) {
      try {
        const fullPath = path.join(this.dataDir, result);
        await fs.unlink(fullPath).catch(() => {
          // File might not exist, that's okay
        });
        coreDebug(`Compensated: Deleted file ${result}`, {
          filePath: result,
          correlationId: context.correlationId,
        });
      } catch (error) {
        coreError(
          `Failed to compensate CreateOrUpdateFile step: ${result}`,
          'SAGA_COMPENSATION_ERROR',
          {
            filePath: result,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        // Don't throw - file cleanup is best effort
      }
    }
  }

  private createMarkdownContent(record: RecordData): string {
    // Use RecordParser to serialize record to markdown
    return RecordParser.serializeToMarkdown(record);
  }

  private normalizeFrontmatterForValidation(frontmatter: any): any {
    const normalized = { ...frontmatter };
    // Convert Date objects to ISO strings
    if (normalized.created && normalized.created instanceof Date) {
      normalized.created = normalized.created.toISOString();
    }
    if (normalized.updated && normalized.updated instanceof Date) {
      normalized.updated = normalized.updated.toISOString();
    }
    return normalized;
  }
}

/**
 * Step 3: Commit to Git (Authoritative - no rollback)
 */
class CommitToGitStep extends BaseSagaStep<PublishDraftContext, string> {
  name = 'CommitToGit';
  isCompensatable = false; // Git commits are never rolled back
  timeout = 30000; // 30 seconds

  constructor(private git: GitEngine) {
    super(30000);
  }

  async execute(context: PublishDraftContext): Promise<string> {
    this.logStep('start', context);

    if (!context.record || !context.filePath) {
      throw new Error('Record and filePath not available in context');
    }

    try {
      const record = context.record;
      const filePath = context.filePath;
      const message = context.recordExisted
        ? `Update record: ${record.title}`
        : `Create record: ${record.title}`;

      // Commit to Git
      const commitHash = await this.git.commit(message, [filePath]);

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
 * Step 4: Delete from record_drafts (ACID)
 */
class DeleteDraftStep extends BaseSagaStep<PublishDraftContext, void> {
  name = 'DeleteDraft';
  isCompensatable = true;
  timeout = 10000; // 10 seconds

  constructor(private db: DatabaseService) {
    super(10000);
  }

  async execute(context: PublishDraftContext): Promise<void> {
    this.logStep('start', context);

    try {
      await this.db.deleteDraft(context.draftId);
      this.logStep('complete', context);
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }

  async compensate(context: PublishDraftContext): Promise<void> {
    // If draft was deleted but saga failed, we can't easily restore it
    // This is a limitation - in production, we might want to store draft backup
    // For now, log a warning
    coreDebug(
      `Draft ${context.draftId} was deleted but saga failed - manual intervention may be needed`,
      {
        draftId: context.draftId,
        correlationId: context.correlationId,
      }
    );
  }
}

/**
 * Step 5: Queue indexing (Derived - fire and forget)
 */
class QueueIndexingStep extends BaseSagaStep<PublishDraftContext, void> {
  name = 'QueueIndexing';
  isCompensatable = false; // Derived state
  timeout = 5000; // 5 seconds

  constructor(private indexingService: IndexingService) {
    super(5000);
  }

  async execute(context: PublishDraftContext): Promise<void> {
    this.logStep('start', context);

    if (!context.record) {
      // No record, nothing to index
      return;
    }

    try {
      // Queue indexing (fire and forget - don't wait)
      // Indexing service will handle retries
      this.indexingService
        .generateIndexes({
          types: [context.record.type],
          rebuild: false,
        })
        .catch((error) => {
          // Log but don't fail - indexing is derived state
          coreDebug(
            `Indexing queued but failed (will retry): ${context.record?.id}`,
            {
              recordId: context.record?.id,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        });

      this.logStep('complete', context);
    } catch (error) {
      // Don't fail saga for indexing errors
      this.logStep('fail', context, undefined, error as Error);
      // Swallow error - indexing is derived state
    }
  }
}

/**
 * Step 6: Emit hooks (Derived - fire and forget)
 */
class EmitHooksStep extends BaseSagaStep<PublishDraftContext, RecordData> {
  name = 'EmitHooks';
  isCompensatable = false; // Derived state
  timeout = 5000; // 5 seconds

  constructor(private hooks: HookSystem) {
    super(5000);
  }

  async execute(context: PublishDraftContext): Promise<RecordData> {
    this.logStep('start', context);

    if (!context.record) {
      throw new Error('Record not available in context');
    }

    try {
      // Emit hook (fire and forget - hooks handle their own retries)
      await this.hooks.emit('record:published', {
        record: context.record,
        user: context.user,
        action: 'publish',
      });

      this.logStep('complete', context);
    } catch (error) {
      // Don't fail saga for hook errors
      this.logStep('fail', context, undefined, error as Error);
      // Swallow error - hooks are derived state
      coreDebug(`Hook emission failed (will retry): record:published`, {
        recordId: context.record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Return the record (saga result)
    return context.record;
  }
}

/**
 * Publish Draft Saga
 */
export class PublishDraftSaga implements Saga<PublishDraftContext, RecordData> {
  name = 'PublishDraft';
  version = '1.0.0';
  steps: SagaStep<PublishDraftContext, any>[];

  constructor(
    db: DatabaseService,
    recordManager: RecordManager,
    git: GitEngine,
    hooks: HookSystem,
    indexingService: IndexingService,
    dataDir: string
  ) {
    this.steps = [
      new MoveToRecordsStep(db, recordManager),
      new CreateOrUpdateFileStep(recordManager, dataDir),
      new CommitToGitStep(git),
      new DeleteDraftStep(db),
      new QueueIndexingStep(indexingService),
      new EmitHooksStep(hooks),
    ];
  }

  validateContext(context: PublishDraftContext): {
    valid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!context.draftId) {
      errors.push('draftId is required');
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
