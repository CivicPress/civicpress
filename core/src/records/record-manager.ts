import { DatabaseService } from '../database/database-service.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { WorkflowEngine } from '../workflows/workflow-engine.js';
import { TemplateEngine } from '../utils/template-engine.js';
import { AuthUser } from '../auth/auth-service.js';
import { Logger } from '../utils/logger.js';
import { CreateRecordRequest, UpdateRecordRequest } from '../civic-core.js';
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

  constructor(
    db: DatabaseService,
    git: GitEngine,
    hooks: HookSystem,
    workflows: WorkflowEngine,
    templates: TemplateEngine,
    dataDir: string
  ) {
    this.db = db;
    this.git = git;
    this.hooks = hooks;
    this.workflows = workflows;
    this.templates = templates;
    this.dataDir = dataDir;
  }

  /**
   * Create a new record
   */
  async createRecord(
    request: CreateRecordRequest,
    user: AuthUser
  ): Promise<RecordData> {
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
   * Update a record
   */
  async updateRecord(
    id: string,
    request: UpdateRecordRequest,
    user: AuthUser
  ): Promise<RecordData | null> {
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

    // Update file in git repository
    await this.updateRecordFile(updatedRecord);

    // Log audit event
    await this.db.logAuditEvent({
      action: 'update_record',
      resourceType: 'record',
      resourceId: id,
      details: `Updated record ${id}`,
    });

    // Trigger hooks
    await this.hooks.emit('record:updated', {
      record: updatedRecord,
      user: user,
      action: 'update',
    });

    return updatedRecord;
  }

  /**
   * Archive a record (soft delete)
   */
  async archiveRecord(id: string, user: AuthUser): Promise<boolean> {
    const record = await this.getRecord(id);
    if (!record) {
      return false;
    }

    // Update status to archived
    await this.db.updateRecord(id, {
      status: 'archived',
      metadata: JSON.stringify({
        ...record.metadata,
        archived_by: user.username,
        archived_by_id: user.id,
        archived_by_name: user.name || user.username,
        archived_at: new Date().toISOString(),
      }),
    });

    // Move file to archive
    await this.archiveRecordFile(record);

    // Log audit event
    await this.db.logAuditEvent({
      action: 'archive_record',
      resourceType: 'record',
      resourceId: id,
      details: `Archived record ${id}`,
    });

    // Trigger hooks
    await this.hooks.emit('record:archived', {
      record,
      user: user,
      action: 'archive',
    });

    return true;
  }

  /**
   * List records with optional filtering
   */
  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    const result = await this.db.listRecords(options);

    return {
      records: result.records,
      total: result.total,
    };
  }

  /**
   * Search records with pagination and filtering
   */
  async searchRecords(
    query: string,
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    // Use the recordType parameter for type filtering
    const recordType = options.type;
    const searchResults = await this.db.searchRecords(query, recordType);

    // Get full record details for search results
    const records: any[] = [];
    for (const searchResult of searchResults) {
      const record = await this.getRecord(searchResult.record_id);
      if (record) {
        // Handle comma-separated status filters
        if (options.status) {
          const statusFilters = options.status.split(',').map((s) => s.trim());
          if (!statusFilters.includes(record.status)) {
            continue;
          }
        }
        records.push(record);
      }
    }

    // Apply pagination
    const total = records.length;
    const offset = options.offset || 0;
    const limit = options.limit || 10;
    const paginatedRecords = records.slice(offset, offset + limit);

    return { records: paginatedRecords, total };
  }

  /**
   * Get search suggestions based on record titles and content
   */
  async getSearchSuggestions(
    query: string,
    options: {
      limit?: number;
    } = {}
  ): Promise<string[]> {
    const limit = options.limit || 10;

    // Get search results from database
    const searchResults = await this.db.searchRecords(query);

    // Extract unique suggestions from titles and content
    const suggestions = new Set<string>();

    for (const result of searchResults.slice(0, limit * 2)) {
      // Get more results to filter
      const record = await this.getRecord(result.record_id);
      if (record) {
        // Add title as suggestion
        if (record.title.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(record.title);
        }

        // Extract words from content that match the query
        if (record.content) {
          const words = record.content
            .split(/\s+/)
            .filter(
              (word) =>
                word.length > 2 &&
                word.toLowerCase().includes(query.toLowerCase()) &&
                !suggestions.has(word)
            );

          words.slice(0, 3).forEach((word) => suggestions.add(word));
        }

        // Add record type as suggestion if it matches
        if (record.type.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(record.type);
        }
      }

      // Stop if we have enough suggestions
      if (suggestions.size >= limit) {
        break;
      }
    }

    // Convert to array and limit results
    return Array.from(suggestions).slice(0, limit);
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
      throw new Error(
        `Schema validation failed before saving record ${record.id}: ${errorMessages}`
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
      throw new Error(
        `Schema validation failed before updating record ${record.id}: ${errorMessages}`
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
}
