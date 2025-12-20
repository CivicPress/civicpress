/**
 * Update Record Saga
 *
 * Orchestrates the multi-step process of updating a published record.
 */

import { Saga, SagaContext, SagaStep } from './types.js';
import { BaseSagaStep } from './saga-step.js';
import { DatabaseService } from '../database/database-service.js';
import { RecordManager, RecordData } from '../records/record-manager.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { IndexingService } from '../indexing/indexing-service.js';
import { AuthUser } from '../auth/auth-service.js';
import { UpdateRecordRequest } from '../civic-core.js';
import { coreDebug, coreError } from '../utils/core-output.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RecordParser } from '../records/record-parser.js';
import { RecordSchemaValidator } from '../records/record-schema-validator.js';
import { ensureDirectoryForRecordPath } from '../utils/record-paths.js';
import matter from 'gray-matter';
import { RecordValidationError } from '../errors/domain-errors.js';

/**
 * Context for UpdateRecord saga
 */
export interface UpdateRecordContext extends SagaContext {
  /** Record ID to update */
  recordId: string;
  /** Update request */
  request: UpdateRecordRequest;
  /** User updating the record */
  user: AuthUser;
  /** Original record data (before update) - stored for compensation */
  originalRecord?: RecordData;
  /** Updated record data (after step 1) */
  updatedRecord?: RecordData;
  /** File path (updated in step 2) */
  filePath?: string;
  /** Git commit hash (from step 3) */
  commitHash?: string;
}

/**
 * Step 1: Update in records table (ACID)
 */
class UpdateInRecordsStep extends BaseSagaStep<
  UpdateRecordContext,
  RecordData
> {
  name = 'UpdateInRecords';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(
    private db: DatabaseService,
    private recordManager: RecordManager
  ) {
    super(30000);
  }

  async execute(context: UpdateRecordContext): Promise<RecordData> {
    this.logStep('start', context);

    try {
      // Get existing record
      const existingRecord = await this.recordManager.getRecord(
        context.recordId
      );
      if (!existingRecord) {
        throw new Error(`Record not found: ${context.recordId}`);
      }

      // Store original record for compensation
      context.originalRecord = { ...existingRecord };

      // Update the record
      const updatedRecord: RecordData = {
        ...existingRecord,
        updated_at: new Date().toISOString(),
      };

      // Normalize source field if it's a string
      if (updatedRecord.source && typeof updatedRecord.source === 'string') {
        updatedRecord.source = {
          reference: updatedRecord.source,
        };
      }

      // Update basic fields
      const request = context.request;
      if (request.title !== undefined) updatedRecord.title = request.title;
      if (request.content !== undefined)
        updatedRecord.content = request.content;
      if (request.status !== undefined) updatedRecord.status = request.status;
      if (request.workflowState !== undefined)
        updatedRecord.workflowState = request.workflowState;
      if (request.geography !== undefined)
        updatedRecord.geography = request.geography;
      if (request.attachedFiles !== undefined)
        updatedRecord.attachedFiles = request.attachedFiles;
      if (request.linkedRecords !== undefined)
        updatedRecord.linkedRecords = request.linkedRecords;
      if (request.linkedGeographyFiles !== undefined)
        updatedRecord.linkedGeographyFiles = request.linkedGeographyFiles;
      if (request.relativePath !== undefined) {
        const sanitizedPath = request.relativePath.replace(/\\/g, '/');
        updatedRecord.path = sanitizedPath;
      }

      // Update authors if provided
      if (request.authors !== undefined) {
        updatedRecord.authors = request.authors;
      }

      // Update source if provided
      if (request.source !== undefined) {
        updatedRecord.source = request.source;
      }

      // Update metadata
      updatedRecord.metadata = {
        ...existingRecord.metadata,
        ...(request.metadata || {}),
      };

      // Normalize source in metadata
      if (
        updatedRecord.metadata.source &&
        typeof updatedRecord.metadata.source === 'string'
      ) {
        if (!updatedRecord.source) {
          updatedRecord.source = {
            reference: updatedRecord.metadata.source,
          };
        }
        delete updatedRecord.metadata.source;
      }

      // Prepare database updates
      const dbUpdates: any = {};
      if (request.title !== undefined) dbUpdates.title = request.title;
      if (request.content !== undefined) dbUpdates.content = request.content;
      if (request.status !== undefined) dbUpdates.status = request.status;
      if (request.workflowState !== undefined)
        dbUpdates.workflow_state = request.workflowState;
      if (request.geography !== undefined)
        dbUpdates.geography = JSON.stringify(request.geography);
      if (request.attachedFiles !== undefined)
        dbUpdates.attached_files = JSON.stringify(request.attachedFiles);
      if (request.linkedRecords !== undefined)
        dbUpdates.linked_records = JSON.stringify(request.linkedRecords);
      if (request.linkedGeographyFiles !== undefined)
        dbUpdates.linked_geography_files = JSON.stringify(
          request.linkedGeographyFiles
        );
      if (request.relativePath !== undefined) {
        dbUpdates.path = updatedRecord.path;
      }

      // Include authors and source in metadata JSON for database storage
      dbUpdates.metadata = JSON.stringify({
        ...updatedRecord.metadata,
        ...(updatedRecord.authors && { authors: updatedRecord.authors }),
        ...(updatedRecord.source && { source: updatedRecord.source }),
      });

      // Update in database
      await this.db.updateRecord(context.recordId, dbUpdates);

      context.updatedRecord = updatedRecord;
      this.logStep('complete', context, updatedRecord);

      return updatedRecord;
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }

  async compensate(
    context: UpdateRecordContext,
    result: RecordData
  ): Promise<void> {
    // Restore original record state
    if (context.originalRecord && result) {
      try {
        const original = context.originalRecord;
        const dbUpdates: any = {
          title: original.title,
          content: original.content,
          status: original.status,
          workflow_state: original.workflowState,
          metadata: JSON.stringify({
            ...original.metadata,
            ...(original.authors && { authors: original.authors }),
            ...(original.source && { source: original.source }),
          }),
        };

        if (original.geography) {
          dbUpdates.geography = JSON.stringify(original.geography);
        }
        if (original.attachedFiles) {
          dbUpdates.attached_files = JSON.stringify(original.attachedFiles);
        }
        if (original.linkedRecords) {
          dbUpdates.linked_records = JSON.stringify(original.linkedRecords);
        }
        if (original.linkedGeographyFiles) {
          dbUpdates.linked_geography_files = JSON.stringify(
            original.linkedGeographyFiles
          );
        }
        if (original.path) {
          dbUpdates.path = original.path;
        }

        await this.db.updateRecord(context.recordId, dbUpdates);

        coreDebug(
          `Compensated: Restored record ${context.recordId} to original state`,
          {
            recordId: context.recordId,
            correlationId: context.correlationId,
          }
        );
      } catch (error) {
        coreError(
          `Failed to compensate UpdateInRecords step: ${context.recordId}`,
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
 * Step 2: Update file in Git working tree
 */
class UpdateFileStep extends BaseSagaStep<UpdateRecordContext, string> {
  name = 'UpdateFile';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(
    private recordManager: RecordManager,
    private dataDir: string
  ) {
    super(30000);
  }

  async execute(context: UpdateRecordContext): Promise<string> {
    this.logStep('start', context);

    if (!context.updatedRecord) {
      throw new Error('Updated record not available in context');
    }

    const record = context.updatedRecord;
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
    context: UpdateRecordContext,
    result: string
  ): Promise<void> {
    // Restore original file content
    if (context.originalRecord && result) {
      try {
        const original = context.originalRecord;
        const normalizedRecord = { ...original };
        if (
          normalizedRecord.source &&
          typeof normalizedRecord.source === 'string'
        ) {
          normalizedRecord.source = {
            reference: normalizedRecord.source,
          };
        }

        const content = this.createMarkdownContent(normalizedRecord);
        const fullPath = path.join(this.dataDir, result);
        await fs.writeFile(fullPath, content, 'utf8');

        coreDebug(`Compensated: Restored file ${result} to original content`, {
          filePath: result,
          correlationId: context.correlationId,
        });
      } catch (error) {
        coreError(
          `Failed to compensate UpdateFile step: ${result}`,
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
    return RecordParser.serializeToMarkdown(record);
  }

  private normalizeFrontmatterForValidation(frontmatter: any): any {
    const normalized = { ...frontmatter };
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
class CommitToGitStep extends BaseSagaStep<UpdateRecordContext, string> {
  name = 'CommitToGit';
  isCompensatable = false; // Git commits are never rolled back
  timeout = 30000; // 30 seconds

  constructor(private git: GitEngine) {
    super(30000);
  }

  async execute(context: UpdateRecordContext): Promise<string> {
    this.logStep('start', context);

    if (!context.updatedRecord || !context.filePath) {
      throw new Error('Updated record and filePath not available in context');
    }

    try {
      const record = context.updatedRecord;
      const filePath = context.filePath;
      const message = `Update record: ${record.title}`;

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
 * Step 4: Queue re-indexing (Derived - fire and forget)
 */
class QueueReIndexingStep extends BaseSagaStep<UpdateRecordContext, void> {
  name = 'QueueReIndexing';
  isCompensatable = false; // Derived state
  timeout = 5000; // 5 seconds

  constructor(private indexingService: IndexingService) {
    super(5000);
  }

  async execute(context: UpdateRecordContext): Promise<void> {
    this.logStep('start', context);

    if (!context.updatedRecord) {
      return;
    }

    try {
      // Queue re-indexing (fire and forget)
      this.indexingService
        .generateIndexes({
          types: [context.updatedRecord.type],
          rebuild: false,
        })
        .catch((error) => {
          coreDebug(
            `Re-indexing queued but failed (will retry): ${context.updatedRecord?.id}`,
            {
              recordId: context.updatedRecord?.id,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        });

      this.logStep('complete', context);
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      // Swallow error - indexing is derived state
    }
  }
}

/**
 * Step 5: Emit hooks (Derived - fire and forget)
 */
class EmitHooksStep extends BaseSagaStep<UpdateRecordContext, RecordData> {
  name = 'EmitHooks';
  isCompensatable = false; // Derived state
  timeout = 5000; // 5 seconds

  constructor(private hooks: HookSystem) {
    super(5000);
  }

  async execute(context: UpdateRecordContext): Promise<RecordData> {
    this.logStep('start', context);

    if (!context.updatedRecord) {
      throw new Error('Updated record not available in context');
    }

    try {
      // Emit hook (fire and forget)
      await this.hooks.emit('record:updated', {
        record: context.updatedRecord,
        user: context.user,
        action: 'update',
      });

      this.logStep('complete', context);
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      // Swallow error - hooks are derived state
      coreDebug(`Hook emission failed (will retry): record:updated`, {
        recordId: context.updatedRecord.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Return the updated record (saga result)
    return context.updatedRecord;
  }
}

/**
 * Update Record Saga
 */
export class UpdateRecordSaga implements Saga<UpdateRecordContext, RecordData> {
  name = 'UpdateRecord';
  version = '1.0.0';
  steps: SagaStep<UpdateRecordContext, any>[];

  constructor(
    db: DatabaseService,
    recordManager: RecordManager,
    git: GitEngine,
    hooks: HookSystem,
    indexingService: IndexingService,
    dataDir: string
  ) {
    this.steps = [
      new UpdateInRecordsStep(db, recordManager),
      new UpdateFileStep(recordManager, dataDir),
      new CommitToGitStep(git),
      new QueueReIndexingStep(indexingService),
      new EmitHooksStep(hooks),
    ];
  }

  validateContext(context: UpdateRecordContext): {
    valid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!context.recordId) {
      errors.push('recordId is required');
    }

    if (!context.request) {
      errors.push('request is required');
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
