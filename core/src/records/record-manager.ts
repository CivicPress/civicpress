import { DatabaseService } from '../database/database-service.js';
import { GitEngine } from '../git/git-engine.js';
import { HookSystem } from '../hooks/hook-system.js';
import { WorkflowEngine } from '../workflows/workflow-engine.js';
import { TemplateEngine } from '../utils/template-engine.js';
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
    userRole: string
  ): Promise<RecordData> {
    const recordId = `record-${Date.now()}`;
    const recordPath = `records/${request.type}/${recordId}.md`;

    // Create the record object
    const record: RecordData = {
      id: recordId,
      title: request.title,
      type: request.type,
      status: 'draft',
      content: request.content,
      metadata: {
        ...request.metadata,
        author: userRole,
        created: new Date().toISOString(),
      },
      path: recordPath,
      author: userRole,
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
      user: userRole,
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
    userRole: string
  ): Promise<RecordData> {
    const recordPath = `records/${request.type}/${recordId}.md`;

    // Create the record object
    const record: RecordData = {
      id: recordId,
      title: request.title,
      type: request.type,
      status: 'draft',
      content: request.content,
      metadata: {
        ...request.metadata,
        author: userRole,
        created: new Date().toISOString(),
      },
      path: recordPath,
      author: userRole,
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
      user: userRole,
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
    userRole: string
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
        updated_by: userRole,
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
      user: userRole,
      action: 'update',
    });

    return updatedRecord;
  }

  /**
   * Archive a record (soft delete)
   */
  async archiveRecord(id: string, userRole: string): Promise<boolean> {
    const record = await this.getRecord(id);
    if (!record) {
      return false;
    }

    // Update status to archived
    await this.db.updateRecord(id, {
      status: 'archived',
      metadata: JSON.stringify({
        ...record.metadata,
        archived_by: userRole,
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
      user: userRole,
      action: 'archive',
    });

    return true;
  }

  /**
   * List records with filtering and pagination
   */
  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: RecordData[]; total: number }> {
    const result = await this.db.listRecords(options);

    // Parse metadata for each record
    const records = result.records.map((record) => {
      if (record.metadata) {
        try {
          record.metadata = JSON.parse(record.metadata);
        } catch (error) {
          logger.warn(
            `Failed to parse metadata for record ${record.id}:`,
            error
          );
          record.metadata = {};
        }
      }
      return record;
    });

    return { records, total: result.total };
  }

  /**
   * Search records
   */
  async searchRecords(
    query: string,
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: RecordData[]; total: number }> {
    const searchResults = await this.db.searchRecords(query, options.type);

    // Get full record details for search results
    const records: RecordData[] = [];
    for (const searchResult of searchResults) {
      const record = await this.getRecord(searchResult.record_id);
      if (record && (!options.status || record.status === options.status)) {
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
    const frontmatter = {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      author: record.author,
      created_at: record.created_at,
      updated_at: record.updated_at,
      ...record.metadata,
    };

    const frontmatterYaml = Object.entries(frontmatter)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    return `---
${frontmatterYaml}
---

${record.content || ''}
`;
  }
}
