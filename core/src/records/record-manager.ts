import { DatabaseService } from '../database/database-service.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { WorkflowEngine } from '../workflows/workflow-engine.js';
import { TemplateEngine } from '../utils/template-engine.js';
import { AuthUser } from '../auth/auth-service.js';
import { Logger } from '../utils/logger.js';
import { CreateRecordRequest, UpdateRecordRequest } from '../civic-core.js';
import { RecordValidationError } from '../errors/domain-errors.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RecordParser } from './record-parser.js';
import { RecordSchemaValidator } from './record-schema-validator.js';
import { DocumentNumberGenerator } from '../utils/document-number-generator.js';
import matter from 'gray-matter';
import {
  buildArchiveRelativePath,
  buildRecordRelativePath,
  ensureDirectoryForRecordPath,
  parseRecordRelativePath,
} from '../utils/record-paths.js';
import type { ICacheStrategy } from '../cache/types.js';
import { UnifiedCacheManager } from '../cache/unified-cache-manager.js';
import { MemoryCache } from '../cache/strategies/memory-cache.js';
import type { CacheConfig } from '../cache/types.js';

const logger = new Logger();

import { Geography } from '../types/geography.js';

export interface RecordData {
  id: string;
  title: string;
  type: string;
  status: string; // Legal status (stored in YAML + DB)
  workflowState?: string; // Internal editorial status (DB-only, never in YAML)
  content?: string;
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

export class RecordManager {
  private db: DatabaseService;
  private git: GitEngine;
  private hooks: HookSystem;
  private workflows: WorkflowEngine;
  private templates: TemplateEngine;
  private dataDir: string;
  private cacheManager?: UnifiedCacheManager;

  constructor(
    db: DatabaseService,
    git: GitEngine,
    hooks: HookSystem,
    workflows: WorkflowEngine,
    templates: TemplateEngine,
    dataDir: string,
    cacheManager?: UnifiedCacheManager
  ) {
    this.db = db;
    this.git = git;
    this.hooks = hooks;
    this.workflows = workflows;
    this.templates = templates;
    this.dataDir = dataDir;
    this.cacheManager = cacheManager;
  }

  /**
   * Get or create suggestions cache (lazy initialization)
   */
  private getSuggestionsCache(): ICacheStrategy<{
    suggestions: string[];
    timestamp: number;
  }> {
    if (!this.suggestionsCache) {
      if (this.cacheManager) {
        this.suggestionsCache = this.cacheManager.getCache<{
          suggestions: string[];
          timestamp: number;
        }>('recordSuggestions');
      } else {
        // Fallback: create MemoryCache directly (for backward compatibility)
        const cacheConfig: CacheConfig = {
          strategy: 'memory',
          enabled: true,
          defaultTTL: 5 * 60 * 1000, // 5 minutes
          maxSize: 1000,
        };
        this.suggestionsCache = new MemoryCache<{
          suggestions: string[];
          timestamp: number;
        }>(cacheConfig, logger);
      }
    }
    return this.suggestionsCache;
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
      await this.createRecordFile(record);
    }

    // Log audit event
    await this.db.logAuditEvent({
      action: 'create_record',
      resourceType: 'record',
      resourceId: record.id,
      details: `Created record ${record.id} of type ${record.type}`,
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
      await this.createRecordFile(record);
    }

    // Log audit event
    await this.db.logAuditEvent({
      action: 'create_record',
      resourceType: 'record',
      resourceId: record.id,
      details: `Created record ${record.id} of type ${record.type}`,
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
    id: string,
    request: UpdateRecordRequest,
    user: AuthUser,
    sagaExecutor?: any, // SagaExecutor - injected to avoid circular dependency
    indexingService?: any, // IndexingService - injected to avoid circular dependency
    correlationId?: string
  ): Promise<RecordData | null> {
    // Import saga components dynamically to avoid circular dependencies
    const { UpdateRecordSaga } = await import('../saga/update-record-saga.js');
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
    const saga = new UpdateRecordSaga(
      this.db,
      this,
      this.git,
      this.hooks,
      indexingService || null,
      this.dataDir
    );

    // Create context
    const context = {
      correlationId: correlationId || `update-${id}-${Date.now()}`,
      startedAt: new Date(),
      recordId: id,
      request,
      user,
      metadata: {
        recordId: id,
      },
    };

    // Execute saga
    const result = await executor.execute(saga, context);

    return result.result;
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
    await this.db.updateRecord(id, dbUpdates);

    // Update file in git repository (skip during sync operations)
    if (!request.skipFileGeneration) {
      await this.updateRecordFile(updatedRecord);
    }

    // Log audit event (skip during sync operations)
    if (!request.skipAudit) {
      await this.db.logAuditEvent({
        action: 'update_record',
        resourceType: 'record',
        resourceId: id,
        details: `Updated record ${id}`,
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
    id: string,
    user: AuthUser,
    sagaExecutor?: any, // SagaExecutor - injected to avoid circular dependency
    correlationId?: string
  ): Promise<boolean> {
    // Import saga components dynamically to avoid circular dependencies
    const { ArchiveRecordSaga } = await import(
      '../saga/archive-record-saga.js'
    );
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
    const saga = new ArchiveRecordSaga(
      this.db,
      this,
      this.git,
      this.hooks,
      this.dataDir
    );

    // Create context
    const context = {
      correlationId: correlationId || `archive-${id}-${Date.now()}`,
      startedAt: new Date(),
      recordId: id,
      user,
      metadata: {
        recordId: id,
      },
    };

    // Execute saga
    const result = await executor.execute(saga, context);

    return result.result;
  }

  /**
   * Archive a record (soft delete)
   *
   * Note: This method uses the saga pattern for better error handling and compensation.
   */
  async archiveRecord(id: string, user: AuthUser): Promise<boolean> {
    // Use saga for all archive operations
    return this.archiveRecordSaga(id, user);
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
  ): Promise<{ records: any[]; total: number }> {
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
    query: string,
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
      sort?: string;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    // Use search service if available (includes pagination and relevance ranking)
    const searchService = this.db.getSearchService();
    if (searchService) {
      try {
        const searchResult = await searchService.search(query, {
          type: options.type,
          status: options.status,
          limit: options.limit || 20,
          offset: options.offset || 0,
          sort: options.sort,
        });

        if (searchResult.results.length === 0) {
          return { records: [], total: searchResult.total };
        }

        // Batch fetch records (no N+1 queries!)
        const recordIds = searchResult.results.map((r) => r.record_id);
        const records = await this.batchGetRecords(recordIds);

        // Map search results to records, preserving relevance scores
        const recordsMap = new Map(records.map((r) => [r.id, r]));
        const resultRecords = searchResult.results
          .map((searchResultItem) => {
            const record = recordsMap.get(searchResultItem.record_id);
            if (!record) return null;

            // Add search metadata (relevance score, excerpt, etc.)
            return {
              ...record,
              _search: {
                relevance_score: searchResultItem.relevance_score,
                excerpt: searchResultItem.excerpt,
                match_highlights: searchResultItem.match_highlights,
              },
            };
          })
          .filter((r) => r !== null);

        return {
          records: resultRecords,
          total: searchResult.total,
        };
      } catch (error) {
        // Fall back to old method if search service fails
        logger.warn('Search service failed, falling back to basic search', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback: Old method (with N+1 fix)
    const searchResults = await this.db.searchRecords(query, {
      type: options.type,
      status: options.status,
      limit: options.limit || 20,
      offset: options.offset || 0,
      sort: options.sort,
    });

    if (searchResults.length === 0) {
      return { records: [], total: 0 };
    }

    // Batch fetch records (no N+1 queries!)
    const recordIds = searchResults.map((r: any) => r.record_id);
    const records = await this.batchGetRecords(recordIds);

    // Map search results to records
    const recordsMap = new Map(records.map((r) => [r.id, r]));
    const resultRecords = searchResults
      .map((searchResult: any) => {
        const record = recordsMap.get(searchResult.record_id);
        if (!record) return null;
        return record;
      })
      .filter((r) => r !== null);

    return {
      records: resultRecords,
      total: resultRecords.length, // Approximate total
    };
  }

  /**
   * Batch fetch records to avoid N+1 query problem
   */
  private async batchGetRecords(recordIds: string[]): Promise<any[]> {
    if (recordIds.length === 0) return [];

    // Handle SQLite IN clause limit (999)
    const BATCH_SIZE = 999;
    const records: any[] = [];

    for (let i = 0; i < recordIds.length; i += BATCH_SIZE) {
      const batch = recordIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      const sql = `SELECT * FROM records WHERE id IN (${placeholders})`;

      const batchRecords = await this.db.query(sql, batch);
      records.push(...batchRecords);
    }

    return records;
  }

  /**
   * Get search suggestions based on record titles and content
   * Optimized: Uses lightweight query + caching (no full record fetches)
   */
  private suggestionsCache?: ICacheStrategy<{
    suggestions: string[];
    timestamp: number;
  }>;

  async getSearchSuggestions(
    query: string,
    options: {
      limit?: number;
    } = {}
  ): Promise<string[]> {
    const limit = options.limit || 10;
    const normalized = query.toLowerCase().trim();

    if (normalized.length < 2) {
      return [];
    }

    // Check cache
    const cached = await this.getSuggestionsCache().get(normalized);
    if (cached) {
      return cached.suggestions.slice(0, limit);
    }

    // Use search service if available (lightweight query with typo tolerance)
    const searchService = this.db.getSearchService();
    if (searchService) {
      try {
        // Enable typo tolerance for better UX
        const suggestions = await searchService.getSuggestions(
          normalized,
          limit,
          true // enableTypoTolerance
        );
        // Return full suggestions with type information
        // The API will handle formatting
        const suggestionTexts = suggestions.map((s) => s.text);

        // Update cache
        await this.getSuggestionsCache().set(normalized, {
          suggestions: suggestionTexts,
          timestamp: Date.now(),
        });

        return suggestionTexts;
      } catch (error) {
        // Fall back to old method if search service fails
        logger.warn(
          'Search service suggestions failed, falling back to basic method',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    // Fallback: Old method (lightweight query - no full record fetches)
    const sql = `
      SELECT DISTINCT si.title as suggestion
      FROM search_index si
      INNER JOIN records r ON si.record_id = r.id
      WHERE (COALESCE(si.title_normalized, LOWER(si.title)) LIKE '%' || ? || '%')
        AND (r.workflow_state IS NULL OR r.workflow_state != 'internal_only')
      ORDER BY si.updated_at DESC
      LIMIT ?
    `;

    const results = await this.db.query(sql, [normalized, limit]);
    const suggestions = results.map((r: any) => r.suggestion);

    // Update cache
    await this.getSuggestionsCache().set(normalized, {
      suggestions,
      timestamp: Date.now(),
    });

    return suggestions;
  }

  /**
   * Create record file in git repository
   */
  private async createRecordFile(record: RecordData): Promise<void> {
    const filePath = record.path;
    if (!filePath) return;

    // Normalize source field before creating markdown (if it's a string, convert to object)
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

    // Validate schema before saving (fail fast)
    const { data: frontmatter } = matter(content);

    // Normalize frontmatter: convert Date objects back to ISO strings (gray-matter parses dates)
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
        `Schema validation failed before saving record ${record.id}: ${errorMessages}`,
        { recordId: record.id, validationErrors: schemaValidation.errors }
      );
    }

    // Ensure directory exists
    ensureDirectoryForRecordPath(this.dataDir, filePath);
    const fullPath = path.join(this.dataDir, filePath);

    // Write file
    await fs.writeFile(fullPath, content, 'utf8');

    // Commit to git
    await this.git.commit(`Create record: ${record.title}`, [filePath]);
  }

  /**
   * Update record file in git repository
   */
  private async updateRecordFile(record: RecordData): Promise<void> {
    const filePath = record.path;
    if (!filePath) return;

    // Normalize source field before creating markdown (if it's a string, convert to object)
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

    // Validate schema before saving (fail fast)
    const { data: frontmatter } = matter(content);

    // Normalize frontmatter: convert Date objects back to ISO strings (gray-matter parses dates)
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
        `Schema validation failed before updating record ${record.id}: ${errorMessages}`,
        { recordId: record.id, validationErrors: schemaValidation.errors }
      );
    }

    // Write file
    ensureDirectoryForRecordPath(this.dataDir, filePath);
    const fullPath = path.join(this.dataDir, filePath);
    await fs.writeFile(fullPath, content, 'utf8');

    // Commit to git
    await this.git.commit(`Update record: ${record.title}`, [filePath]);
  }

  /**
   * Archive record file in git repository
   */
  private async archiveRecordFile(record: RecordData): Promise<void> {
    const filePath = record.path;
    if (!filePath) return;

    // Determine archive path (preserve original year if present)
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

    // Commit to git
    await this.git.commit(`Archive record: ${record.title}`, [archivePath]);
  }

  /**
   * Create markdown content for a record
   * Uses RecordParser for standardized formatting
   */
  private createMarkdownContent(record: RecordData): string {
    return RecordParser.serializeToMarkdown(record);
  }

  /**
   * Normalize frontmatter for validation: convert Date objects to ISO strings
   * gray-matter automatically parses ISO 8601 dates as Date objects, but schema expects strings
   */
  private normalizeFrontmatterForValidation(frontmatter: any): any {
    const normalized = { ...frontmatter };

    // Convert Date objects to ISO strings
    if (normalized.created instanceof Date) {
      normalized.created = normalized.created.toISOString();
    }
    if (normalized.updated instanceof Date) {
      normalized.updated = normalized.updated.toISOString();
    }
    if (normalized.date instanceof Date) {
      normalized.date = normalized.date.toISOString();
    }

    // Normalize source: if it's a string (old format), convert to object
    if (normalized.source) {
      if (typeof normalized.source === 'string') {
        normalized.source = {
          reference: normalized.source,
        };
      } else if (typeof normalized.source === 'object') {
        normalized.source = this.normalizeDatesInObject(normalized.source);
      }
    }

    // Recursively normalize nested objects (e.g., metadata fields)
    if (normalized.metadata && typeof normalized.metadata === 'object') {
      normalized.metadata = this.normalizeDatesInObject(normalized.metadata);
    }

    return normalized;
  }

  /**
   * Recursively convert Date objects to ISO strings in an object
   */
  private normalizeDatesInObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalizeDatesInObject(item));
    }

    if (typeof obj === 'object') {
      const normalized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        normalized[key] = this.normalizeDatesInObject(value);
      }
      return normalized;
    }

    return obj;
  }

  /**
   * Publish a draft record using the saga pattern
   * This orchestrates the multi-step process of publishing a draft
   */
  async publishDraft(
    draftId: string,
    user: AuthUser,
    targetStatus?: string,
    sagaExecutor?: any, // SagaExecutor - injected to avoid circular dependency
    indexingService?: any, // IndexingService - injected to avoid circular dependency
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
    const result = await executor.execute(saga, context);

    return result.result;
  }

  /**
   * Create a record using the saga pattern
   * This orchestrates the multi-step process of creating a published record
   */
  async createRecordSaga(
    request: CreateRecordRequest,
    user: AuthUser,
    recordId?: string,
    sagaExecutor?: any, // SagaExecutor - injected to avoid circular dependency
    indexingService?: any, // IndexingService - injected to avoid circular dependency
    correlationId?: string
  ): Promise<RecordData> {
    // Import saga components dynamically to avoid circular dependencies
    const { CreateRecordSaga } = await import('../saga/create-record-saga.js');
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
    const saga = new CreateRecordSaga(
      this.db,
      this,
      this.git,
      this.hooks,
      indexingService || null, // Will be set if provided
      this.dataDir
    );

    // Create context
    const context = {
      correlationId:
        correlationId || `create-${recordId || 'record'}-${Date.now()}`,
      startedAt: new Date(),
      request,
      user,
      recordId,
      metadata: {
        recordType: request.type,
      },
    };

    // Execute saga
    const result = await executor.execute(saga, context);

    return result.result;
  }
}
