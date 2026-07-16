import { DatabaseService } from '../database/database-service.js';
import type { RecordRow } from '../database/types/row-types.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { WorkflowEngine } from '../workflows/workflow-engine.js';
import { TemplateEngine } from '../utils/template-engine.js';
import { AuthUser } from '../auth/auth-service.js';
import { Logger } from '../utils/logger.js';
import { CreateRecordRequest, UpdateRecordRequest } from '../civic-core.js';
import { AuditChannel } from '../audit/audit-channel.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RecordParser } from './record-parser.js';
import { DocumentNumberGenerator } from '../utils/document-number-generator.js';
import { buildRecordRelativePath } from '../utils/record-paths.js';
import { UnifiedCacheManager } from '../cache/unified-cache-manager.js';
import { RecordSagas } from './record-manager/sagas.js';
// `import type` is erased at compile time so it does not reintroduce the
// runtime circular import these methods originally avoided via `any`.
import type { SagaExecutor } from '../saga/saga-executor.js';
import type { IndexingService } from '../indexing/indexing-service.js';
import type { PublishDraftContext } from '../saga/publish-draft-saga.js';
import { RecordSearch } from './record-manager/search.js';
import { RecordFileOps } from './record-manager/file-ops.js';

const logger = new Logger();

import { Geography } from '../types/geography.js';

export interface RecordData {
  id: string;
  title: string;
  type: string;
  status: string; // Legal status (stored in YAML + DB)
  workflowState?: string; // Internal editorial status (DB-only, never in YAML)
  content?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  geography?: Geography;
  attachedFiles?: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?:
      | string
      | {
          label: string;
          value: string;
          description: string;
        };
  }>;
  linkedRecords?: Array<{
    id: string;
    type: string;
    description: string;
    path?: string;
    category?: string;
  }>;
  linkedGeographyFiles?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  path?: string;

  // Authorship - support both formats
  author: string; // Required: primary author username
  authors?: Array<{
    // Optional: detailed author info
    name: string;
    username: string;
    role?: string;
    email?: string;
  }>;

  // Timestamps - use ISO 8601
  created_at: string; // Internal (database)
  updated_at: string; // Internal (database)
  // Note: Frontmatter uses 'created' and 'updated'

  // Source & Origin - for imported/legacy documents
  source?: {
    reference: string; // Required: Original document identifier/reference
    original_title?: string; // Optional: Original title from source system
    original_filename?: string; // Optional: Original filename from source system
    url?: string; // Optional: Link to original document
    type?: 'legacy' | 'import' | 'external'; // Optional: Source type
    imported_at?: string; // Optional: ISO 8601 import timestamp
    imported_by?: string; // Optional: Username who imported it
  };

  // Commit Linkage - populated during export/archive operations (not during normal operations)
  commit_ref?: string; // Git commit SHA that introduced or last modified this record
  commit_signature?: string; // Cryptographic or GPG signature reference associated with the commit
}

/**
 * RecordManager — thin orchestrator (Phase 2d W2-T6 decomposition).
 *
 * Heavy lifting now lives in four focused collaborators under
 * `./record-manager/`:
 *   - `helpers.ts` — pure functions (markdown serialization, date normalization)
 *   - `sagas.ts` — `RecordSagas` (saga-orchestration entry points)
 *   - `search.ts` — `RecordSearch` (search + suggestions + cache)
 *   - `file-ops.ts` — `RecordFileOps` (filesystem write + git commit + schema-validate-before-save)
 *
 * The orchestrator keeps the original public surface intact so external
 * consumers don't need to change: every method that used to be on
 * `RecordManager` is still on `RecordManager`, with the same signature.
 */
export class RecordManager {
  private db: DatabaseService;
  private git: GitEngine;
  private hooks: HookSystem;
  private workflows: WorkflowEngine;
  private templates: TemplateEngine;
  private dataDir: string;
  private cacheManager?: UnifiedCacheManager;
  private auditChannel?: AuditChannel;

  private sagas: RecordSagas;
  private search: RecordSearch;
  private fileOps: RecordFileOps;

  constructor(
    db: DatabaseService,
    git: GitEngine,
    hooks: HookSystem,
    workflows: WorkflowEngine,
    templates: TemplateEngine,
    dataDir: string,
    cacheManager?: UnifiedCacheManager,
    auditChannel?: AuditChannel
  ) {
    this.db = db;
    this.git = git;
    this.hooks = hooks;
    this.workflows = workflows;
    this.templates = templates;
    this.dataDir = dataDir;
    this.cacheManager = cacheManager;
    this.auditChannel = auditChannel;

    this.sagas = new RecordSagas({
      db: this.db,
      git: this.git,
      hooks: this.hooks,
      workflows: this.workflows,
      templates: this.templates,
      dataDir: this.dataDir,
      auditChannel: this.auditChannel,
      recordManager: this,
      writeAudit: this.writeAudit.bind(this),
    });

    this.search = new RecordSearch({
      db: this.db,
      cacheManager: this.cacheManager,
    });

    this.fileOps = new RecordFileOps({
      git: this.git,
      dataDir: this.dataDir,
    });
  }

  /**
   * Write an audit entry through the unified AuditChannel if available,
   * otherwise fall back to the legacy direct `db.logAuditEvent` call.
   *
   * Phase 2c (Task 9) introduced the channel as the canonical path; the
   * fallback exists only for transitional safety. Once all RecordManager
   * call sites use this helper and the DI container always provides the
   * channel, the fallback can be removed.
   */
  private async writeAudit(event: {
    action: string;
    resourceType: 'record' | 'user' | 'config' | 'system' | string;
    resourceId?: string;
    userId?: number;
    message?: string;
    outcome?: 'success' | 'failure';
  }): Promise<void> {
    if (this.auditChannel) {
      await this.auditChannel.record({
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        userId: event.userId,
        source: 'core',
        outcome: event.outcome ?? 'success',
        message: event.message,
      });
      return;
    }
    await this.db.logAuditEvent({
      userId: event.userId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      details: event.message,
    });
  }

  /**
   * Create a new record
   *
   * Note: For published records (status !== 'draft'), this method uses the saga pattern
   * for better error handling and compensation. Drafts use the legacy flow.
   */
  async createRecord(
    request: CreateRecordRequest,
    user: AuthUser
  ): Promise<RecordData> {
    // Use saga for published records (non-draft) that will create files
    // Drafts don't need saga since they don't commit to Git
    const isPublished = request.status && request.status !== 'draft';
    if (isPublished && !request.skipFileGeneration) {
      return this.createRecordSaga(request, user);
    }

    // Legacy flow for drafts or when file generation is skipped
    const recordId = `record-${Date.now()}`;
    const creationDate = request.createdAt
      ? new Date(request.createdAt)
      : new Date();
    const createdAt =
      !request.createdAt || Number.isNaN(creationDate.getTime())
        ? new Date().toISOString()
        : creationDate.toISOString();
    const updatedAt =
      request.updatedAt && !Number.isNaN(new Date(request.updatedAt).getTime())
        ? new Date(request.updatedAt).toISOString()
        : createdAt;
    const status = request.status || 'draft';
    const workflowState = request.workflowState || 'draft';
    const recordPath = request.relativePath
      ? request.relativePath.replace(/\\/g, '/')
      : buildRecordRelativePath(request.type, recordId, createdAt);
    // Remove any author property from request.metadata to avoid overwriting existing values unintentionally
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
      status, // Legal status (stored in YAML + DB)
      workflowState, // Internal editorial status (DB-only, never in YAML)
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
      author: user.username, // Required: primary author username
      authors: request.authors || [
        // Default to single author from user
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

    // Save to database
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

    // Create file in git repository (unless explicitly skipped)
    if (!request.skipFileGeneration) {
      await this.fileOps.createRecordFile(record);
    }

    // Log audit event (routed through unified AuditChannel — closes core-001)
    await this.writeAudit({
      action: 'create_record',
      resourceType: 'record',
      resourceId: record.id,
      userId: typeof user?.id === 'number' ? user.id : undefined,
      message: `Created record ${record.id} of type ${record.type}`,
    });

    // Trigger hooks
    await this.hooks.emit('record:created', {
      record,
      user: user,
      action: 'create',
    });

    return record;
  }

  /**
   * Create a new record with a specific ID
   */
  async createRecordWithId(
    recordId: string,
    request: CreateRecordRequest,
    user: AuthUser
  ): Promise<RecordData> {
    const creationDate = request.createdAt
      ? new Date(request.createdAt)
      : new Date();
    const createdAt =
      request.createdAt && !Number.isNaN(creationDate.getTime())
        ? creationDate.toISOString()
        : new Date().toISOString();
    const updatedAt =
      request.updatedAt && !Number.isNaN(new Date(request.updatedAt).getTime())
        ? new Date(request.updatedAt).toISOString()
        : createdAt;
    const status = request.status || 'draft';
    // Allow null for workflowState (published records don't need editorial state)
    const workflowState =
      request.workflowState !== undefined ? request.workflowState : 'draft'; // Internal editorial status (DB-only)
    const recordPath = request.relativePath
      ? request.relativePath.replace(/\\/g, '/')
      : buildRecordRelativePath(request.type, recordId, createdAt);

    // Remove any author property from request.metadata to avoid overwriting existing values unintentionally
    const safeMetadata2 = { ...(request.metadata || {}) };

    if (user?.username && safeMetadata2.author === undefined) {
      safeMetadata2.author = user.username;
    }
    if (user?.id && safeMetadata2.authorId === undefined) {
      safeMetadata2.authorId = user.id;
    }
    if (user?.name && safeMetadata2.authorName === undefined) {
      safeMetadata2.authorName = user.name;
    }
    if (user?.email && safeMetadata2.authorEmail === undefined) {
      safeMetadata2.authorEmail = user.email;
    }
    if (safeMetadata2.created === undefined) {
      safeMetadata2.created = createdAt;
    }
    if (safeMetadata2.updated === undefined) {
      safeMetadata2.updated = updatedAt;
    }

    // Create the record object
    const record: RecordData = {
      id: recordId,
      title: request.title,
      type: request.type,
      status, // Legal status (stored in YAML + DB)
      workflowState, // Internal editorial status (DB-only, never in YAML)
      content: request.content,
      geography: request.geography,
      attachedFiles: request.attachedFiles,
      linkedRecords: request.linkedRecords,
      linkedGeographyFiles: request.linkedGeographyFiles,
      metadata: {
        ...safeMetadata2,
      },
      path: recordPath,
      author: user.username, // Always set as string
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

    // Save to database
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

    // Create file in git repository unless explicitly skipped
    if (!request.skipFileGeneration) {
      await this.fileOps.createRecordFile(record);
    }

    // Log audit event (routed through unified AuditChannel — closes core-001)
    await this.writeAudit({
      action: 'create_record',
      resourceType: 'record',
      resourceId: record.id,
      userId: typeof user?.id === 'number' ? user.id : undefined,
      message: `Created record ${record.id} of type ${record.type}`,
    });

    // Trigger hooks
    await this.hooks.emit('record:created', {
      record,
      user: user,
      action: 'create',
    });

    return record;
  }

  /**
   * Get a specific record
   * Reads from markdown file (source of truth) and merges with database record
   */
  async getRecord(id: string): Promise<RecordData | null> {
    const dbRecord = await this.db.getRecord(id);
    if (!dbRecord) {
      return null;
    }

    // Try to read from markdown file (source of truth)
    if (dbRecord.path) {
      try {
        const filePath = path.join(this.dataDir, dbRecord.path);
        const fileContent = await fs.readFile(filePath, 'utf8');

        // Use RecordParser for consistent parsing
        const parsedRecord = RecordParser.parseFromMarkdown(
          fileContent,
          dbRecord.path
        );

        // Merge database record with parsed record
        // Database has latest sync info, parsed record has accurate frontmatter data
        const mergedRecord: RecordData = {
          ...parsedRecord,
          // Keep database fields for internal tracking
          path: dbRecord.path,
          // workflowState is DB-only (never in YAML), so always get it from database
          workflowState: dbRecord.workflow_state || 'draft', // Internal editorial status (DB-only, never in YAML)
          // Ensure timestamps are set (use parsed if available, otherwise database)
          created_at:
            parsedRecord.created_at ||
            dbRecord.created_at ||
            new Date().toISOString(),
          updated_at:
            parsedRecord.updated_at ||
            dbRecord.updated_at ||
            new Date().toISOString(),
        };

        return mergedRecord;
      } catch (error) {
        logger.warn(
          `Failed to read record file for ${id}, falling back to database: ${error}`
        );
        // Fall through to database-only record
      }
    }

    // Fallback to database record if file doesn't exist or can't be read
    // Parse JSON fields from database
    const record: RecordData = {
      id: dbRecord.id,
      title: dbRecord.title,
      type: dbRecord.type,
      status: dbRecord.status || 'draft', // Legal status (stored in YAML + DB)
      workflowState: dbRecord.workflow_state || 'draft', // Internal editorial status (DB-only, never in YAML)
      content: dbRecord.content || '',
      path: dbRecord.path,
      author: dbRecord.author || 'unknown',
      created_at: dbRecord.created_at || new Date().toISOString(),
      updated_at: dbRecord.updated_at || new Date().toISOString(),
    };

    // Parse metadata
    if (dbRecord.metadata) {
      try {
        const parsedMetadata = JSON.parse(dbRecord.metadata);
        record.metadata = parsedMetadata;
        // Extract authors and source from metadata if present
        if (parsedMetadata.authors) {
          record.authors = parsedMetadata.authors;
        }
        if (parsedMetadata.source) {
          // Normalize source: if it's a string (old format), convert to object
          if (typeof parsedMetadata.source === 'string') {
            record.source = {
              reference: parsedMetadata.source,
            };
          } else {
            record.source = parsedMetadata.source;
          }
        }
      } catch (error) {
        logger.warn(`Failed to parse metadata for record ${id}:`, error);
        record.metadata = {};
      }
    }

    // Parse geography
    if (dbRecord.geography) {
      try {
        record.geography = JSON.parse(dbRecord.geography);
      } catch (error) {
        logger.warn(`Failed to parse geography for record ${id}:`, error);
      }
    }

    // Parse attached files
    if (dbRecord.attached_files) {
      try {
        record.attachedFiles = JSON.parse(dbRecord.attached_files);
      } catch (error) {
        logger.warn(`Failed to parse attached files for record ${id}:`, error);
        record.attachedFiles = [];
      }
    } else {
      record.attachedFiles = [];
    }

    // Parse linked records
    if (dbRecord.linked_records) {
      try {
        record.linkedRecords = JSON.parse(dbRecord.linked_records);
      } catch (error) {
        logger.warn(`Failed to parse linked records for record ${id}:`, error);
        record.linkedRecords = [];
      }
    } else {
      record.linkedRecords = [];
    }

    // Parse linked geography files
    if (dbRecord.linked_geography_files) {
      try {
        record.linkedGeographyFiles = JSON.parse(
          dbRecord.linked_geography_files
        );
      } catch (error) {
        logger.warn(
          `Failed to parse linked geography files for record ${id}:`,
          error
        );
        record.linkedGeographyFiles = [];
      }
    } else {
      record.linkedGeographyFiles = [];
    }

    return record;
  }

  /**
   * Update a record using the saga pattern
   * This orchestrates the multi-step process of updating a published record
   */
  async updateRecordSaga(
    ...args: Parameters<RecordSagas['updateRecordSaga']>
  ): Promise<RecordData | null> {
    return this.sagas.updateRecordSaga(...args);
  }

  /**
   * Field-level, concurrency-safe merge into `metadata.capture` (FA-BB-002 E).
   *
   * The capture block has several independent writers (upload finalize, the
   * device manifest, the redaction worker, a manual publish) that each
   * read-merge-write. Two stale snapshots racing shallow-merge would silently
   * drop the other writer's fields — including the security-critical
   * `public_file`/`redaction_status` latch. This method serializes capture
   * writers on a DB-backed `capture:<id>` resource lock so the read and the
   * write are atomic with respect to each other.
   *
   * @param partialCapture  Only these keys are overlaid onto the existing capture.
   * @param options.precondition  Evaluated INSIDE the lock against the current
   *        capture; returning false skips the write (returns null). Use for
   *        idempotency latches ("don't overwrite a completed redaction").
   * @param options.appendAttachedFile  Appended to `attached_files` (if not
   *        already present by id) in the SAME atomic update.
   * @returns the merged capture that was written, or null when the
   *          precondition declined the write.
   * @throws when the record does not exist or the lock cannot be acquired.
   */
  async mergeCapture(
    id: string,
    partialCapture: Record<string, unknown>,
    user: AuthUser,
    options: {
      precondition?: (existingCapture: Record<string, unknown>) => boolean;
      appendAttachedFile?: { id: string } & Record<string, unknown>;
    } = {}
  ): Promise<Record<string, unknown> | null> {
    const { ResourceLockManager } = await import('../saga/resource-lock.js');
    const { SagaLockError } = await import('../saga/errors.js');
    const lockManager = new ResourceLockManager(this.db);
    const lockKey = `capture:${id}`;
    const holderId = `merge-capture-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    // Bounded acquire: capture merges are short (one record update), so a
    // held lock clears quickly; give up loudly rather than write unlocked.
    const maxAttempts = 20;
    for (let attempt = 1; ; attempt++) {
      try {
        await lockManager.acquireLock(lockKey, holderId, 30_000);
        break;
      } catch (error) {
        if (error instanceof SagaLockError && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        throw error;
      }
    }

    try {
      const record = await this.getRecord(id);
      if (!record) {
        throw new Error(`Record not found: ${id}`);
      }
      // Extension fields may surface top-level after parse.
      const existing: Record<string, unknown> =
        (record.metadata?.capture as Record<string, unknown> | undefined) ??
        ((record as unknown as Record<string, unknown>).capture as
          | Record<string, unknown>
          | undefined) ??
        {};

      if (options.precondition && !options.precondition(existing)) {
        return null;
      }

      const merged = { ...existing, ...partialCapture };
      const request: UpdateRecordRequest = {
        metadata: { capture: merged },
      };
      if (options.appendAttachedFile) {
        const attached = record.attachedFiles ?? [];
        if (!attached.some((f) => f?.id === options.appendAttachedFile!.id)) {
          request.attachedFiles = [
            ...attached,
            options.appendAttachedFile,
          ] as RecordData['attachedFiles'];
        }
      }
      await this.updateRecord(id, request, user);
      return merged;
    } finally {
      await lockManager.releaseLock(lockKey, holderId).catch(() => {});
    }
  }

  /**
   * Update a record
   *
   * Note: For published records, this method uses the saga pattern for better
   * error handling and compensation. Drafts use the legacy flow.
   */
  async updateRecord(
    id: string,
    request: UpdateRecordRequest,
    user: AuthUser
  ): Promise<RecordData | null> {
    // Check if record exists and is published
    const existingRecordForCheck = await this.getRecord(id);
    if (!existingRecordForCheck) {
      return null;
    }

    // Use saga for published records (non-draft) unless explicitly skipped
    const isPublished =
      existingRecordForCheck.status &&
      existingRecordForCheck.status !== 'draft';
    if (isPublished && !request.skipSaga) {
      return this.updateRecordSaga(id, request, user);
    }

    // Legacy flow for drafts
    const existingRecord = await this.getRecord(id);
    if (!existingRecord) {
      return null;
    }

    // Update the record
    const updatedRecord: RecordData = {
      ...existingRecord,
      updated_at: new Date().toISOString(),
    };

    // Normalize source field if it's a string (from old database format)
    if (updatedRecord.source && typeof updatedRecord.source === 'string') {
      updatedRecord.source = {
        reference: updatedRecord.source,
      };
    }

    // Update basic fields
    if (request.title !== undefined) updatedRecord.title = request.title;
    if (request.content !== undefined) updatedRecord.content = request.content;
    if (request.status !== undefined) updatedRecord.status = request.status; // Legal status (stored in YAML + DB)
    if (request.workflowState !== undefined)
      updatedRecord.workflowState = request.workflowState; // Internal editorial status (DB-only, never in YAML)
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

    // Normalize source in metadata if it's a string (from old database format)
    if (
      updatedRecord.metadata.source &&
      typeof updatedRecord.metadata.source === 'string'
    ) {
      if (!updatedRecord.source) {
        updatedRecord.source = {
          reference: updatedRecord.metadata.source,
        };
      }
      // Remove source from metadata (it should be top-level)
      delete updatedRecord.metadata.source;
    }

    // Prepare database updates
    const dbUpdates: Record<string, unknown> = {};
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
    await this.db.updateRecord(id, dbUpdates);

    // Update file in git repository (skip during sync operations)
    if (!request.skipFileGeneration) {
      await this.fileOps.updateRecordFile(updatedRecord);
    }

    // Log audit event (skip during sync operations)
    // Routed through unified AuditChannel — closes core-001 (the audit
    // finding named this specific call site as the userId-missing example).
    if (!request.skipAudit) {
      await this.writeAudit({
        action: 'update_record',
        resourceType: 'record',
        resourceId: id,
        userId: typeof user?.id === 'number' ? user.id : undefined,
        message: `Updated record ${id}`,
      });
    }

    // Trigger hooks (skip during sync operations to avoid infinite loops)
    if (!request.skipHooks && !request.skipFileGeneration) {
      await this.hooks.emit('record:updated', {
        record: updatedRecord,
        user: user,
        action: 'update',
      });
    }

    return updatedRecord;
  }

  /**
   * Archive a record using the saga pattern
   * This orchestrates the multi-step process of archiving a record
   */
  async archiveRecordSaga(
    ...args: Parameters<RecordSagas['archiveRecordSaga']>
  ): Promise<boolean> {
    return this.sagas.archiveRecordSaga(...args);
  }

  /**
   * Archive a record (soft delete)
   *
   * Note: This method uses the saga pattern for better error handling and compensation.
   */
  async archiveRecord(
    ...args: Parameters<RecordSagas['archiveRecord']>
  ): Promise<boolean> {
    return this.sagas.archiveRecord(...args);
  }

  /**
   * List records with optional filtering and sorting
   */
  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
      sort?: string;
    } = {}
  ): Promise<{ records: RecordRow[]; total: number }> {
    const result = await this.db.listRecords(options);

    return {
      records: result.records,
      total: result.total,
    };
  }

  /**
   * Search records with pagination, filtering, and sorting
   */
  async searchRecords(
    ...args: Parameters<RecordSearch['searchRecords']>
  ): ReturnType<RecordSearch['searchRecords']> {
    return this.search.searchRecords(...args);
  }

  /**
   * Get search suggestions based on record titles and content
   * Optimized: Uses lightweight query + caching (no full record fetches)
   */
  async getSearchSuggestions(
    ...args: Parameters<RecordSearch['getSearchSuggestions']>
  ): Promise<string[]> {
    return this.search.getSearchSuggestions(...args);
  }


  /**
   * Publish a draft record using the saga pattern
   * This orchestrates the multi-step process of publishing a draft
   */
  async publishDraft(
    draftId: string,
    user: AuthUser,
    targetStatus?: string,
    sagaExecutor?: SagaExecutor,
    indexingService?: IndexingService | null,
    correlationId?: string
  ): Promise<RecordData> {
    // Import saga components dynamically to avoid circular dependencies
    const { PublishDraftSaga } = await import('../saga/publish-draft-saga.js');
    const {
      SagaExecutor,
      SagaStateStore,
      IdempotencyManager,
      ResourceLockManager,
    } = await import('../saga/index.js');

    // Create saga executor if not provided
    let executor = sagaExecutor;
    if (!executor) {
      const stateStore = new SagaStateStore(this.db);
      const idempotencyManager = new IdempotencyManager(stateStore);
      const lockManager = new ResourceLockManager(this.db);
      executor = new SagaExecutor(stateStore, idempotencyManager, lockManager);
    }

    // Create saga instance
    const saga = new PublishDraftSaga(
      this.db,
      this,
      this.git,
      this.hooks,
      indexingService || null, // Will be set if provided
      this.dataDir
    );

    // Create context
    const context = {
      correlationId: correlationId || `publish-${draftId}-${Date.now()}`,
      startedAt: new Date(),
      draftId,
      targetStatus,
      user,
      metadata: {
        recordId: draftId,
        draftId,
      },
    };

    // Execute saga
    const result = await executor.execute<PublishDraftContext, RecordData>(
      saga,
      context
    );

    return result.result;
  }

  /**
   * Create a record using the saga pattern
   * This orchestrates the multi-step process of creating a published record
   */
  async createRecordSaga(
    ...args: Parameters<RecordSagas['createRecordSaga']>
  ): Promise<RecordData> {
    return this.sagas.createRecordSaga(...args);
  }
}
