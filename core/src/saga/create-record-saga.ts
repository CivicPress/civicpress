/**
 * Create Record Saga
 *
 * Orchestrates the multi-step process of creating a published record directly.
 */

import { Saga, SagaContext, SagaStep } from './types.js';
import { BaseSagaStep } from './saga-step.js';
import { DatabaseService } from '../database/database-service.js';
import { RecordManager, RecordData } from '../records/record-manager.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { IndexingService } from '../indexing/indexing-service.js';
import { AuthUser } from '../auth/auth-service.js';
import { CreateRecordRequest } from '../civic-core.js';
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
import { DocumentNumberGenerator } from '../utils/document-number-generator.js';

/**
 * Context for CreateRecord saga
 */
export interface CreateRecordContext extends SagaContext {
  /** Create record request */
  request: CreateRecordRequest;
  /** User creating the record */
  user: AuthUser;
  /** Optional record ID (if not provided, will be generated) */
  recordId?: string;
  /** Record data (created in step 1) */
  record?: RecordData;
  /** File path (created in step 2) */
  filePath?: string;
  /** Git commit hash (from step 3) */
  commitHash?: string;
}

/**
 * Step 1: Create in records table (ACID)
 */
class CreateInRecordsStep extends BaseSagaStep<
  CreateRecordContext,
  RecordData
> {
  name = 'CreateInRecords';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(
    private db: DatabaseService,
    private recordManager: RecordManager,
    private dataDir: string
  ) {
    super(30000);
  }

  async execute(context: CreateRecordContext): Promise<RecordData> {
    this.logStep('start', context);

    try {
      const request = context.request;
      const user = context.user;

      // Generate record ID if not provided
      const recordId = context.recordId || `record-${Date.now()}`;

      // Calculate dates
      const creationDate = request.createdAt
        ? new Date(request.createdAt)
        : new Date();
      const createdAt =
        !request.createdAt || Number.isNaN(creationDate.getTime())
          ? new Date().toISOString()
          : creationDate.toISOString();
      const updatedAt =
        request.updatedAt &&
        !Number.isNaN(new Date(request.updatedAt).getTime())
          ? new Date(request.updatedAt).toISOString()
          : createdAt;

      const status = request.status || 'draft';
      const workflowState = request.workflowState || 'draft';
      const recordPath = request.relativePath
        ? request.relativePath.replace(/\\/g, '/')
        : buildRecordRelativePath(request.type, recordId, createdAt);

      // Prepare metadata
      const safeMetadata = { ...(request.metadata || {}) };

      // Auto-generate document number for legal record types if not provided
      const legalTypes = [
        'bylaw',
        'ordinance',
        'policy',
        'proclamation',
        'resolution',
      ];
      let documentNumber = safeMetadata.document_number;
      if (!documentNumber && legalTypes.includes(request.type)) {
        const documentDate = request.createdAt
          ? new Date(request.createdAt)
          : creationDate;
        const year = Number.isNaN(documentDate.getTime())
          ? new Date().getFullYear()
          : documentDate.getFullYear();
        const sequence = await DocumentNumberGenerator.getNextSequence(
          request.type,
          year
        );
        documentNumber = DocumentNumberGenerator.generate(
          request.type,
          year,
          sequence
        );
      }

      // Ensure metadata defaults
      if (user?.username && safeMetadata.author === undefined) {
        safeMetadata.author = user.username;
      }
      if (user?.id && safeMetadata.authorId === undefined) {
        safeMetadata.authorId = user.id;
      }
      if (user?.name && safeMetadata.authorName === undefined) {
        safeMetadata.authorName = user.name;
      }
      if (user?.email && safeMetadata.authorEmail === undefined) {
        safeMetadata.authorEmail = user.email;
      }
      if (safeMetadata.created === undefined) {
        safeMetadata.created = createdAt;
      }
      if (safeMetadata.updated === undefined) {
        safeMetadata.updated = updatedAt;
      }

      // Create the record object
      const record: RecordData = {
        id: recordId,
        title: request.title,
        type: request.type,
        status,
        workflowState,
        content: request.content,
        geography: request.geography,
        attachedFiles: request.attachedFiles,
        linkedRecords: request.linkedRecords,
        linkedGeographyFiles: request.linkedGeographyFiles,
        metadata: {
          ...safeMetadata,
          ...(documentNumber && { document_number: documentNumber }),
        },
        path: recordPath,
        author: user.username,
        authors: request.authors || [
          {
            name: user.name || user.username,
            username: user.username,
            role: user.role,
            email: user.email,
          },
        ],
        source: request.source,
        created_at: createdAt,
        updated_at: updatedAt,
      };

      // Save to database (without file creation)
      await this.db.createRecord({
        id: record.id,
        title: record.title,
        type: record.type,
        status: record.status,
        workflow_state: record.workflowState,
        content: record.content,
        metadata: JSON.stringify(record.metadata),
        geography: record.geography
          ? JSON.stringify(record.geography)
          : undefined,
        attached_files: record.attachedFiles
          ? JSON.stringify(record.attachedFiles)
          : undefined,
        linked_records: record.linkedRecords
          ? JSON.stringify(record.linkedRecords)
          : undefined,
        linked_geography_files: record.linkedGeographyFiles
          ? JSON.stringify(record.linkedGeographyFiles)
          : undefined,
        path: record.path,
        author: record.author,
      });

      context.record = record;
      this.logStep('complete', context, record);

      return record;
    } catch (error) {
      this.logStep('fail', context, undefined, error as Error);
      throw error;
    }
  }

  async compensate(
    context: CreateRecordContext,
    result: RecordData
  ): Promise<void> {
    // Delete the record from database
    if (result) {
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
          `Failed to compensate CreateInRecords step: ${result.id}`,
          'SAGA_COMPENSATION_ERROR',
          {
            recordId: result.id,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        throw error;
      }
    }
  }
}

/**
 * Step 2: Create file in Git working tree
 */
class CreateFileStep extends BaseSagaStep<CreateRecordContext, string> {
  name = 'CreateFile';
  isCompensatable = true;
  timeout = 30000; // 30 seconds

  constructor(
    private recordManager: RecordManager,
    private dataDir: string
  ) {
    super(30000);
  }

  async execute(context: CreateRecordContext): Promise<string> {
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
    context: CreateRecordContext,
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
          `Failed to compensate CreateFile step: ${result}`,
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
class CommitToGitStep extends BaseSagaStep<CreateRecordContext, string> {
  name = 'CommitToGit';
  isCompensatable = false; // Git commits are never rolled back
  timeout = 30000; // 30 seconds

  constructor(private git: GitEngine) {
    super(30000);
  }

  async execute(context: CreateRecordContext): Promise<string> {
    this.logStep('start', context);

    if (!context.record || !context.filePath) {
      throw new Error('Record and filePath not available in context');
    }

    try {
      const record = context.record;
      const filePath = context.filePath;
      const message = `Create record: ${record.title}`;

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
 * Step 4: Queue indexing (Derived - fire and forget)
 */
class QueueIndexingStep extends BaseSagaStep<CreateRecordContext, void> {
  name = 'QueueIndexing';
  isCompensatable = false; // Derived state
  timeout = 5000; // 5 seconds

  constructor(private indexingService: IndexingService) {
    super(5000);
  }

  async execute(context: CreateRecordContext): Promise<void> {
    this.logStep('start', context);

    if (!context.record) {
      return;
    }

    try {
      // Queue indexing (fire and forget - don't wait)
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
 * Step 5: Emit hooks (Compensatable - emits compensating hook on rollback)
 */
class EmitHooksStep extends BaseSagaStep<CreateRecordContext, RecordData> {
  name = 'EmitHooks';
  isCompensatable = true; // Can emit compensating hook
  timeout = 5000; // 5 seconds

  constructor(private hooks: HookSystem) {
    super(5000);
  }

  async execute(context: CreateRecordContext): Promise<RecordData> {
    this.logStep('start', context);

    if (!context.record) {
      throw new Error('Record not available in context');
    }

    try {
      // Emit hook (fire and forget - hooks handle their own retries)
      await this.hooks.emit('record:created', {
        record: context.record,
        user: context.user,
        action: 'create',
      });

      this.logStep('complete', context);
    } catch (error) {
      // Don't fail saga for hook errors
      this.logStep('fail', context, undefined, error as Error);
      // Swallow error - hooks are derived state
      coreDebug(`Hook emission failed (will retry): record:created`, {
        recordId: context.record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Return the record (saga result)
    return context.record;
  }

  async compensate(
    context: CreateRecordContext,
    result: RecordData
  ): Promise<void> {
    // Emit compensating hook to notify system of rollback
    // Hook handlers can decide how to handle the compensation
    if (result) {
      try {
        await this.hooks.emit('record:created:reverted', {
          record: result,
          user: context.user,
          action: 'create:revert',
          reason: 'saga_compensation',
        });
        coreDebug(
          `Compensated: Emitted record:created:reverted hook for record ${result.id}`,
          {
            recordId: result.id,
            correlationId: context.correlationId,
          }
        );
      } catch (error) {
        // Don't fail compensation for hook errors
        coreDebug(
          `Hook compensation emission failed (non-critical): record:created:reverted`,
          {
            recordId: result.id,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }
  }
}

/**
 * Create Record Saga
 */
export class CreateRecordSaga implements Saga<CreateRecordContext, RecordData> {
  name = 'CreateRecord';
  version = '1.0.0';
  steps: SagaStep<CreateRecordContext, any>[];

  constructor(
    db: DatabaseService,
    recordManager: RecordManager,
    git: GitEngine,
    hooks: HookSystem,
    indexingService: IndexingService,
    dataDir: string
  ) {
    this.steps = [
      new CreateInRecordsStep(db, recordManager, dataDir),
      new CreateFileStep(recordManager, dataDir),
      new CommitToGitStep(git),
      new QueueIndexingStep(indexingService),
      new EmitHooksStep(hooks),
    ];
  }

  validateContext(context: CreateRecordContext): {
    valid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!context.request) {
      errors.push('request is required');
    } else {
      if (!context.request.title) {
        errors.push('request.title is required');
      }
      if (!context.request.type) {
        errors.push('request.type is required');
      }
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
