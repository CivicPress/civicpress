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

const logger = new Logger();

import { Geography } from '../types/geography.js';

export interface RecordData {
  id: string;
  title: string;
  type: string;
  status: string;
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
    const recordPath = `records/${request.type}/${recordId}.md`;

    // Remove any author property from request.metadata to avoid overwriting
    const safeMetadata = { ...(request.metadata || {}) };
    delete safeMetadata.author;

    // Auto-generate document number for legal record types if not provided
    const legalTypes = ['bylaw', 'ordinance', 'policy', 'proclamation', 'resolution'];
    let documentNumber = safeMetadata.document_number;
    if (!documentNumber && legalTypes.includes(request.type)) {
      const year = new Date().getFullYear();
      const sequence = await DocumentNumberGenerator.getNextSequence(request.type, year);
      documentNumber = DocumentNumberGenerator.generate(request.type, year, sequence);
    }

    // Create the record object
    const record: RecordData = {
      id: recordId,
      title: request.title,
      type: request.type,
      status: 'draft',
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Save to database
    await this.db.createRecord({
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
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

    // Create file in git repository
    await this.createRecordFile(record);

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
    const recordPath = `records/${request.type}/${recordId}.md`;

    // Remove any author property from request.metadata to avoid overwriting
    const safeMetadata2 = { ...(request.metadata || {}) };
    delete safeMetadata2.author;

    // Create the record object
    const record: RecordData = {
      id: recordId,
      title: request.title,
      type: request.type,
      status: 'draft',
      content: request.content,
      geography: request.geography,
      attachedFiles: request.attachedFiles,
      linkedRecords: request.linkedRecords,
      linkedGeographyFiles: request.linkedGeographyFiles,
      metadata: {
        ...safeMetadata2,
        author: user.username, // Always set as string
        authorId: user.id,
        authorName: user.name || user.username,
        authorEmail: user.email,
        created: new Date().toISOString(),
      },
      path: recordPath,
      author: user.username, // Always set as string
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Save to database
    await this.db.createRecord({
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
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

    // Create file in git repository
    await this.createRecordFile(record);

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
        const parsedRecord = RecordParser.parseFromMarkdown(fileContent, dbRecord.path);

        // Merge database record with parsed record
        // Database has latest sync info, parsed record has accurate frontmatter data
        const mergedRecord: RecordData = {
          ...parsedRecord,
          // Keep database fields for internal tracking
          path: dbRecord.path,
          // Ensure timestamps are set (use parsed if available, otherwise database)
          created_at: parsedRecord.created_at || dbRecord.created_at || new Date().toISOString(),
          updated_at: parsedRecord.updated_at || dbRecord.updated_at || new Date().toISOString(),
        };

        return mergedRecord;
      } catch (error) {
        logger.warn(`Failed to read record file for ${id}, falling back to database: ${error}`);
        // Fall through to database-only record
      }
    }

    // Fallback to database record if file doesn't exist or can't be read
    // Parse JSON fields from database
    const record: RecordData = {
      id: dbRecord.id,
      title: dbRecord.title,
      type: dbRecord.type,
      status: dbRecord.status || 'draft',
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
          record.source = parsedMetadata.source;
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
        record.linkedGeographyFiles = JSON.parse(dbRecord.linked_geography_files);
      } catch (error) {
        logger.warn(`Failed to parse linked geography files for record ${id}:`, error);
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

    // Update basic fields
    if (request.title !== undefined) updatedRecord.title = request.title;
    if (request.content !== undefined) updatedRecord.content = request.content;
    if (request.status !== undefined) updatedRecord.status = request.status;
    if (request.geography !== undefined) updatedRecord.geography = request.geography;
    if (request.attachedFiles !== undefined) updatedRecord.attachedFiles = request.attachedFiles;
    if (request.linkedRecords !== undefined) updatedRecord.linkedRecords = request.linkedRecords;
    if (request.linkedGeographyFiles !== undefined)
      updatedRecord.linkedGeographyFiles = request.linkedGeographyFiles;
    
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

    // Prepare database updates
    const dbUpdates: any = {};
    if (request.title !== undefined) dbUpdates.title = request.title;
    if (request.content !== undefined) dbUpdates.content = request.content;
    if (request.status !== undefined) dbUpdates.status = request.status;
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

    // Create markdown content
    const content = this.createMarkdownContent(record);

    // Validate schema before saving (fail fast)
    const { data: frontmatter } = matter(content);
    const schemaValidation = RecordSchemaValidator.validate(
      frontmatter,
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
    const fullPath = path.join(this.dataDir, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

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

    // Create markdown content
    const content = this.createMarkdownContent(record);

    // Validate schema before saving (fail fast)
    const { data: frontmatter } = matter(content);
    const schemaValidation = RecordSchemaValidator.validate(
      frontmatter,
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

    // Move file to archive
    const archivePath = `archive/${record.type}/${record.id}.md`;
    const sourcePath = path.join(this.dataDir, filePath);
    const targetPath = path.join(this.dataDir, archivePath);

    // Ensure archive directory exists
    const archiveDir = path.dirname(targetPath);
    await fs.mkdir(archiveDir, { recursive: true });

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
}
