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

const logger = new Logger();

export interface RecordData {
  id: string;
  title: string;
  type: string;
  status: string;
  content?: string;
  metadata?: Record<string, any>;
  path?: string;
  author: string;
  created_at: string;
  updated_at: string;
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

    // Create the record object
    const record: RecordData = {
      id: recordId,
      title: request.title,
      type: request.type,
      status: 'draft',
      content: request.content,
      metadata: {
        ...safeMetadata,
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
   */
  async getRecord(id: string): Promise<RecordData | null> {
    const record = await this.db.getRecord(id);
    if (!record) {
      return null;
    }

    // Parse metadata
    if (record.metadata) {
      try {
        record.metadata = JSON.parse(record.metadata);
      } catch (error) {
        logger.warn(`Failed to parse metadata for record ${id}:`, error);
        record.metadata = {};
      }
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
    const updates: any = {};
    if (request.title !== undefined) updates.title = request.title;
    if (request.content !== undefined) updates.content = request.content;
    if (request.status !== undefined) updates.status = request.status;
    if (request.metadata !== undefined) {
      updates.metadata = JSON.stringify({
        ...existingRecord.metadata,
        ...request.metadata,
        updated_by: user.username,
        updated_by_id: user.id,
        updated_by_name: user.name || user.username,
        updated: new Date().toISOString(),
      });
    }

    // Update in database
    await this.db.updateRecord(id, updates);

    // Update file in git repository
    const updatedRecord = await this.getRecord(id);
    if (updatedRecord) {
      await this.updateRecordFile(updatedRecord);
    }

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
   */
  private createMarkdownContent(record: RecordData): string {
    // Extract metadata but exclude author to avoid overwriting the string author
    const otherMetadata = { ...record.metadata };
    delete otherMetadata.author;

    const frontmatter = {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      author: record.author, // Keep the string author from record.author
      created_at: record.created_at,
      updated_at: record.updated_at,
      ...otherMetadata, // Spread other metadata but not author
    };

    const frontmatterYaml = Object.entries(frontmatter)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        // Handle different value types appropriately
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          return `${key}: ${value}`;
        } else if (Array.isArray(value)) {
          return `${key}: ${JSON.stringify(value)}`;
        } else if (typeof value === 'object' && value !== null) {
          // For objects, use JSON.stringify but handle special cases
          if (key === 'author' && typeof value === 'object') {
            // If author is an object, extract the username
            const authorObj = value as any;
            return `${key}: "${authorObj.username || authorObj.name || 'Unknown'}"`;
          }
          return `${key}: ${JSON.stringify(value)}`;
        } else {
          return `${key}: ${JSON.stringify(value)}`;
        }
      })
      .join('\n');

    return `---
${frontmatterYaml}
---

${record.content || ''}
`;
  }
}
