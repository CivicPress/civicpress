import {
  CivicPress,
  CreateRecordRequest,
  UpdateRecordRequest,
  WorkflowConfigManager,
  RecordManager,
  RecordParser,
  RecordData,
  userCan,
  coreError,
  DatabaseService,
  Logger,
} from '@civicpress/core';
import fs from 'fs';
import path from 'path';

/**
 * RecordsService - API Record Management
 *
 * Handles all record operations through CivicCore's RecordManager
 * to ensure proper hooks, workflows, and Git integration.
 */
export class RecordsService {
  private civicPress: CivicPress;
  private recordManager: RecordManager;
  private logger: Logger;

  /**
   * Helper function to get kind priority for sorting
   * Priority: record (no kind) = 1, chapter = 2, root = 3
   * Lower priority number = appears first in list
   */
  private getKindPriority(record: any): number {
    // Check both direct and nested metadata paths
    // Some records have kind at metadata.kind, others at metadata.metadata.kind
    const kind = record.metadata?.kind || record.metadata?.metadata?.kind;
    if (kind === 'root') return 3; // Root documents last
    if (kind === 'chapter') return 2; // Chapters in middle
    return 1; // Regular records first
  }
  private workflowManager: WorkflowConfigManager;
  private dataDir: string | null = null;

  private buildFilterClause(filters: { type?: string; status?: string } = {}) {
    const clauses: string[] = [];
    const params: any[] = [];

    if (filters.type) {
      const types = filters.type
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.length === 1) {
        clauses.push('type = ?');
        params.push(types[0]);
      } else if (types.length > 1) {
        clauses.push(`type IN (${types.map(() => '?').join(',')})`);
        params.push(...types);
      }
    }

    if (filters.status) {
      const statuses = filters.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        clauses.push('status = ?');
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        clauses.push(`status IN (${statuses.map(() => '?').join(',')})`);
        params.push(...statuses);
      }
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return { whereClause, params };
  }

  private db: DatabaseService;

  constructor(
    civicPress: CivicPress,
    recordManager?: RecordManager,
    workflowManager?: WorkflowConfigManager,
    db?: DatabaseService
  ) {
    this.civicPress = civicPress;
    // Get dataDir from CivicPress config
    const dataDir = (civicPress as any).config?.dataDir || './data';
    this.dataDir = dataDir;

    // Use provided dependencies or create new ones
    this.workflowManager =
      workflowManager || new WorkflowConfigManager(dataDir);
    this.recordManager = recordManager || civicPress.getRecordManager();
    this.db = db || civicPress.getDatabaseService();
    this.logger = new Logger();
  }

  /**
   * Get the CivicPress instance
   */
  getCivicPress(): CivicPress {
    return this.civicPress;
  }

  /**
   * Create a new record
   */
  async createRecord(
    data: {
      title: string;
      type: string;
      content?: string;
      metadata?: Record<string, any>;
      geography?: any;
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
      authors?: Array<{
        name: string;
        username: string;
        role?: string;
        email?: string;
      }>;
      source?: {
        reference: string;
        original_title?: string;
        original_filename?: string;
        url?: string;
        type?: 'legacy' | 'import' | 'external';
        imported_at?: string;
        imported_by?: string;
      };
    },
    user: any
  ): Promise<any> {
    // Validate permissions using the same system as API middleware
    const hasPermission = await userCan(user, 'records:create', {
      recordType: data.type,
      action: 'create',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot create records of type '${data.type}'`
      );
    }

    // Create record request
    const request: CreateRecordRequest = {
      title: data.title,
      type: data.type,
      content: data.content,
      metadata: data.metadata,
      geography: data.geography,
      attachedFiles: data.attachedFiles,
      linkedRecords: data.linkedRecords,
      linkedGeographyFiles: data.linkedGeographyFiles,
      authors: data.authors,
      source: data.source,
    };

    // Create the record using CivicCore
    const record = await this.recordManager.createRecord(request, user);

    return {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      content: record.content,
      metadata: record.metadata || {},
      authors: record.authors,
      source: record.source,
      geography: record.geography,
      attachedFiles: record.attachedFiles || [],
      linkedRecords: record.linkedRecords || [],
      linkedGeographyFiles: record.linkedGeographyFiles || [],
      path: record.path,
      created_at: record.created_at,
      updated_at: record.updated_at,
      author: record.author,
      commit_ref: record.commit_ref,
      commit_signature: record.commit_signature,
    };
  }

  /**
   * Get a specific record
   */
  async getRecord(id: string): Promise<any | null> {
    const record = await this.recordManager.getRecord(id);
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      content: record.content,
      metadata: record.metadata || {},
      authors: record.authors,
      source: record.source,
      geography: record.geography,
      attachedFiles: record.attachedFiles || [],
      linkedRecords: record.linkedRecords || [],
      linkedGeographyFiles: record.linkedGeographyFiles || [],
      path: record.path,
      created_at: record.created_at,
      updated_at: record.updated_at,
      author: record.author,
      commit_ref: record.commit_ref,
      commit_signature: record.commit_signature,
    };
  }

  /**
   * Get raw file content for a record (including frontmatter)
   */
  async getRawRecord(id: string): Promise<any | null> {
    const record = await this.recordManager.getRecord(id);
    if (!record) {
      return null;
    }

    // Read the raw file content from the filesystem
    // fs and path are already imported at the top of the file

    try {
      // The record.path already includes 'records/', so we need to construct the path correctly
      if (!this.dataDir) {
        throw new Error('Data directory not set');
      }
      if (!record.path) {
        throw new Error('Record path not available');
      }
      const filePath = path.join(this.dataDir, record.path);

      const rawContent = fs.readFileSync(filePath, 'utf8');

      return {
        id: record.id,
        title: record.title,
        type: record.type,
        status: record.status,
        content: rawContent, // Return the complete file content including frontmatter
        metadata: record.metadata || {},
        path: record.path,
        created: record.created_at,
        author: record.author,
      };
    } catch (error) {
      coreError(
        `Failed to read raw file for record ${id}`,
        'RECORD_FILE_READ_ERROR',
        {
          recordId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'records:getRaw' }
      );
      // Fall back to database content if file read fails
      return {
        id: record.id,
        title: record.title,
        type: record.type,
        status: record.status,
        content: record.content,
        metadata: record.metadata || {},
        path: record.path,
        created: record.created_at,
        author: record.author,
      };
    }
  }

  /**
   * Update a record
   */
  async updateRecord(
    id: string,
    data: {
      title?: string;
      content?: string;
      status?: string;
      metadata?: Record<string, any>;
      geography?: any;
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
      authors?: Array<{
        name: string;
        username: string;
        role?: string;
        email?: string;
      }>;
      source?: {
        reference: string;
        original_title?: string;
        original_filename?: string;
        url?: string;
        type?: 'legacy' | 'import' | 'external';
        imported_at?: string;
        imported_by?: string;
      };
    },
    user: any
  ): Promise<any | null> {
    // Get the current record to validate permissions
    const currentRecord = await this.recordManager.getRecord(id);
    if (!currentRecord) {
      return null;
    }

    // Validate permissions using the same system as API middleware
    const hasPermission = await userCan(user, 'records:edit', {
      recordType: currentRecord.type,
      action: 'edit',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot edit records of type '${currentRecord.type}'`
      );
    }

    // Update record request
    const request: UpdateRecordRequest = {
      title: data.title,
      content: data.content,
      status: data.status,
      metadata: data.metadata,
      geography: data.geography,
      attachedFiles: data.attachedFiles,
      linkedRecords: data.linkedRecords,
      linkedGeographyFiles: data.linkedGeographyFiles,
      authors: data.authors,
      source: data.source,
    };

    // Update the record using CivicCore
    const updatedRecord = await this.recordManager.updateRecord(
      id,
      request,
      user
    );

    if (!updatedRecord) {
      return null;
    }

    return {
      id: updatedRecord.id,
      title: updatedRecord.title,
      type: updatedRecord.type,
      status: updatedRecord.status,
      content: updatedRecord.content,
      metadata: updatedRecord.metadata || {},
      authors: updatedRecord.authors,
      source: updatedRecord.source,
      geography: updatedRecord.geography,
      attachedFiles: updatedRecord.attachedFiles || [],
      linkedRecords: updatedRecord.linkedRecords || [],
      linkedGeographyFiles: updatedRecord.linkedGeographyFiles || [],
      path: updatedRecord.path,
      created_at: updatedRecord.created_at,
      updated_at: updatedRecord.updated_at,
      author: updatedRecord.author,
      commit_ref: updatedRecord.commit_ref,
      commit_signature: updatedRecord.commit_signature,
    };
  }

  /**
   * Delete (archive) a record
   */
  async deleteRecord(id: string, user: any): Promise<boolean> {
    // Get the current record to validate permissions
    const record = await this.recordManager.getRecord(id);
    if (!record) {
      return false;
    }

    // Validate permissions using the same system as API middleware
    const hasPermission = await userCan(user, 'records:delete', {
      recordType: record.type,
      action: 'delete',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot delete records of type '${record.type}'`
      );
    }

    // Archive the record
    return await this.recordManager.archiveRecord(id, user);
  }

  /**
   * Change record status with workflow validation
   */
  async changeRecordStatus(
    id: string,
    newStatus: string,
    user: any,
    comment?: string
  ): Promise<{ success: boolean; record?: any; error?: string }> {
    // Get the current record to validate permissions
    const record = await this.recordManager.getRecord(id);
    if (!record) {
      return { success: false, error: 'Record not found' };
    }

    // Validate permissions using the same system as API middleware
    const hasPermission = await userCan(user, 'records:edit', {
      recordType: record.type,
      action: 'edit',
    });

    if (!hasPermission) {
      return {
        success: false,
        error: `Permission denied: Cannot edit records of type '${record.type}'`,
      };
    }

    // Validate status transition using workflow engine
    const currentStatus = record.status;
    const transitionValidation = await this.workflowManager.validateTransition(
      currentStatus,
      newStatus,
      user.role
    );

    if (!transitionValidation.valid) {
      return {
        success: false,
        error:
          transitionValidation.reason ||
          `Invalid status transition from '${currentStatus}' to '${newStatus}' for role '${user.role}'`,
      };
    }

    // Update record with new status
    const request: UpdateRecordRequest = {
      status: newStatus,
      metadata: {
        ...record.metadata,
        statusChangedBy: user.username,
        statusChangedAt: new Date().toISOString(),
        statusChangeComment: comment,
        previousStatus: currentStatus,
      },
    };

    // Update the record using CivicCore
    const updatedRecord = await this.recordManager.updateRecord(
      id,
      request,
      user
    );

    if (!updatedRecord) {
      return { success: false, error: 'Failed to update record' };
    }

    return {
      success: true,
      record: {
        id: updatedRecord.id,
        title: updatedRecord.title,
        type: updatedRecord.type,
        status: updatedRecord.status,
        content: updatedRecord.content,
        metadata: updatedRecord.metadata || {},
        path: updatedRecord.path,
        created: updatedRecord.created_at,
        author: updatedRecord.author,
      },
    };
  }

  /**
   * Get allowed transitions for a record based on current status and user role
   */
  async getAllowedTransitions(id: string, user: any): Promise<string[]> {
    // Get the current record
    const record = await this.recordManager.getRecord(id);
    if (!record) {
      return [];
    }

    // Compute transitions for the user's role
    const fromStatus = record.status;
    const role = user?.role;
    const allowed = await this.workflowManager.getAvailableTransitions(
      fromStatus,
      role
    );
    return allowed || [];
  }

  /**
   * List records with cursor-based pagination
   */
  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{
    records: any[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  }> {
    const { type, status, limit = 20, cursor } = options;

    // Get all records from the record manager
    const result = await this.recordManager.listRecords({
      type,
      status,
      limit: 1000, // Get a large number of records for cursor-based pagination
      offset: undefined,
    });

    // Apply filters to the records array
    let filteredRecords = result.records;

    if (type) {
      const types = type.split(',').map((t) => t.trim());
      filteredRecords = filteredRecords.filter((record: any) =>
        types.includes(record.type)
      );
    }

    if (status) {
      const statuses = status.split(',').map((s) => s.trim());
      filteredRecords = filteredRecords.filter((record: any) =>
        statuses.includes(record.status)
      );
    }

    // Sort records by kind priority first (record -> chapter -> root)
    // Then by creation date (newest first) for consistent cursor behavior
    filteredRecords.sort((a: any, b: any) => {
      // First sort by kind priority
      const priorityA = this.getKindPriority(a);
      const priorityB = this.getKindPriority(b);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // If same priority, sort by creation date (newest first)
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    // Find the starting index based on cursor
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = filteredRecords.findIndex(
        (record: any) => record.id === cursor
      );
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1; // Start after the cursor
      }
    }

    // Get the requested number of records
    const endIndex = startIndex + limit;
    const records = filteredRecords.slice(startIndex, endIndex);

    // Determine if there are more records
    const hasMore = endIndex < filteredRecords.length;
    const nextCursor = hasMore ? records[records.length - 1]?.id || null : null;

    // Transform records for API response
    const transformedRecords = records.map((record: any) => ({
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      content: record.content,
      metadata: record.metadata || {},
      path: record.path,
      created_at: record.created_at,
      updated_at: record.updated_at,
      author: record.author,
      commit_ref: record.commit_ref,
      commit_signature: record.commit_signature,
    }));

    return {
      records: transformedRecords,
      nextCursor,
      hasMore,
      total: filteredRecords.length,
    };
  }

  /**
   * Search records with offset-based pagination (more efficient than cursor-based for search)
   */
  async searchRecords(
    query: string,
    options: {
      type?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{
    records: any[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const { type, status, limit = 20, cursor } = options;

    // Convert cursor to offset for simpler pagination
    let offset = 0;
    if (cursor) {
      // For now, we'll use a simple approach: assume cursor is the last record ID
      // In a real implementation, you'd store cursor->offset mapping or use a different approach
      offset = parseInt(cursor) || 0;
    }

    // Get search results with proper pagination
    const result = await this.recordManager.searchRecords(query, {
      type,
      status,
      limit: limit + 1, // Get one extra to determine if there are more results
      offset,
    });

    // Sort search results by kind priority (record -> chapter -> root)
    // Then by creation date as secondary sort
    result.records.sort((a: any, b: any) => {
      const priorityA = this.getKindPriority(a);
      const priorityB = this.getKindPriority(b);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // If same priority, sort by creation date (newest first)
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    // Determine if there are more records
    const hasMore = result.records.length > limit;
    const records = hasMore ? result.records.slice(0, limit) : result.records;
    const nextCursor = hasMore ? (offset + limit).toString() : null;

    // Transform records for API response
    const transformedRecords = records.map((record: any) => ({
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      content: record.content,
      metadata: record.metadata || {},
      path: record.path,
      created_at: record.created_at,
      updated_at: record.updated_at,
      author: record.author,
    }));

    return {
      records: transformedRecords,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get aggregate record summary
   */
  async getRecordSummary(filters: { type?: string; status?: string }): Promise<{
    total: number;
    types: Record<string, number>;
    statuses: Record<string, number>;
  }> {
    const db = this.civicPress.getDatabaseService();
    const { whereClause, params } = this.buildFilterClause(filters || {});

    const typeRows = await db.query(
      `SELECT type, COUNT(*) as count FROM records ${whereClause} GROUP BY type`,
      [...params]
    );
    const statusRows = await db.query(
      `SELECT status, COUNT(*) as count FROM records ${whereClause} GROUP BY status`,
      [...params]
    );
    const totalRows = await db.query(
      `SELECT COUNT(*) as count FROM records ${whereClause}`,
      [...params]
    );

    const types: Record<string, number> = {};
    typeRows.forEach((row: any) => {
      if (row.type) {
        types[row.type] = Number(row.count) || 0;
      }
    });

    const statuses: Record<string, number> = {};
    statusRows.forEach((row: any) => {
      if (row.status) {
        statuses[row.status] = Number(row.count) || 0;
      }
    });

    return {
      total: totalRows?.[0]?.count ? Number(totalRows[0].count) : 0,
      types,
      statuses,
    };
  }

  /**
   * Create a new draft (saves to record_drafts table only, no file)
   */
  async createDraft(
    data: {
      title: string;
      type: string;
      status?: string;
      markdownBody?: string;
      metadata?: Record<string, any>;
      geography?: any;
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
    },
    user: any
  ): Promise<any> {
    // Validate permissions
    const hasPermission = await userCan(user, 'records:create', {
      recordType: data.type,
      action: 'create',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot create records of type '${data.type}'`
      );
    }

    // Generate record ID
    const recordId = `record-${Date.now()}`;
    const createdAt = new Date().toISOString();

    // Extract username safely
    let username = 'unknown';
    if (typeof user.username === 'string') {
      username = user.username;
    } else if (user.name && typeof user.name === 'string') {
      username = user.name;
    } else if (user.id) {
      username = user.id.toString();
    }

    // Extract user ID safely
    let userId = username;
    if (user.id) {
      userId = user.id.toString();
    } else if (typeof user.username === 'string') {
      userId = user.username;
    }

    // Save to draft table
    try {
      await this.db.createDraft({
        id: recordId,
        title: data.title,
        type: data.type,
        status: data.status || 'draft',
        markdown_body: data.markdownBody || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        geography: data.geography ? JSON.stringify(data.geography) : null,
        attached_files:
          data.attachedFiles && data.attachedFiles.length > 0
            ? JSON.stringify(data.attachedFiles)
            : null,
        linked_records:
          data.linkedRecords && data.linkedRecords.length > 0
            ? JSON.stringify(data.linkedRecords)
            : null,
        linked_geography_files:
          data.linkedGeographyFiles && data.linkedGeographyFiles.length > 0
            ? JSON.stringify(data.linkedGeographyFiles)
            : null,
        author: username,
        created_by: userId,
      });
    } catch (error: any) {
      // Log the error for debugging
      this.logger.error('Failed to create draft', {
        error: error.message,
        stack: error.stack,
        recordId,
        title: data.title,
        type: data.type,
        username,
        userId,
        markdownBodyLength: data.markdownBody?.length || 0,
      });
      throw error;
    }

    // Get the created draft
    const draft = await this.db.getDraft(recordId);

    return {
      id: draft.id,
      title: draft.title,
      type: draft.type,
      status: draft.status,
      markdownBody: draft.markdown_body,
      metadata: draft.metadata ? JSON.parse(draft.metadata) : {},
      geography: draft.geography ? JSON.parse(draft.geography) : undefined,
      attachedFiles: draft.attached_files
        ? JSON.parse(draft.attached_files)
        : [],
      linkedRecords: draft.linked_records
        ? JSON.parse(draft.linked_records)
        : [],
      linkedGeographyFiles: draft.linked_geography_files
        ? JSON.parse(draft.linked_geography_files)
        : [],
      author: draft.author,
      created_by: draft.created_by,
      created_at: draft.created_at,
      updated_at: draft.updated_at,
      last_draft_saved_at: draft.last_draft_saved_at,
    };
  }

  /**
   * Update a draft
   */
  async updateDraft(
    id: string,
    data: {
      title?: string;
      type?: string;
      status?: string;
      markdownBody?: string;
      metadata?: Record<string, any>;
      geography?: any;
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
    },
    user: any
  ): Promise<any> {
    // Check if draft exists
    const draft = await this.db.getDraft(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    // Use new type if provided, otherwise use existing type for permission check
    const recordType = data.type || draft.type;

    // Validate permissions - check both old and new type if type is being changed
    const hasPermission = await userCan(user, 'records:edit', {
      recordType: recordType,
      action: 'edit',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot edit records of type '${recordType}'`
      );
    }

    // If type is being changed, also check permission for the new type
    if (data.type && data.type !== draft.type) {
      const hasNewTypePermission = await userCan(user, 'records:edit', {
        recordType: data.type,
        action: 'edit',
      });

      if (!hasNewTypePermission) {
        throw new Error(
          `Permission denied: Cannot change record type to '${data.type}'`
        );
      }
    }

    // Update draft
    await this.db.updateDraft(id, {
      title: data.title,
      type: data.type,
      status: data.status,
      markdown_body: data.markdownBody,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      geography: data.geography ? JSON.stringify(data.geography) : undefined,
      attached_files: data.attachedFiles
        ? JSON.stringify(data.attachedFiles)
        : undefined,
      linked_records: data.linkedRecords
        ? JSON.stringify(data.linkedRecords)
        : undefined,
      linked_geography_files: data.linkedGeographyFiles
        ? JSON.stringify(data.linkedGeographyFiles)
        : undefined,
    });

    // Get updated draft
    const updatedDraft = await this.db.getDraft(id);

    return {
      id: updatedDraft.id,
      title: updatedDraft.title,
      type: updatedDraft.type,
      status: updatedDraft.status,
      markdownBody: updatedDraft.markdown_body,
      metadata: updatedDraft.metadata ? JSON.parse(updatedDraft.metadata) : {},
      geography: updatedDraft.geography
        ? JSON.parse(updatedDraft.geography)
        : undefined,
      attachedFiles: updatedDraft.attached_files
        ? JSON.parse(updatedDraft.attached_files)
        : [],
      linkedRecords: updatedDraft.linked_records
        ? JSON.parse(updatedDraft.linked_records)
        : [],
      linkedGeographyFiles: updatedDraft.linked_geography_files
        ? JSON.parse(updatedDraft.linked_geography_files)
        : [],
      author: updatedDraft.author,
      created_by: updatedDraft.created_by,
      created_at: updatedDraft.created_at,
      updated_at: updatedDraft.updated_at,
      last_draft_saved_at: updatedDraft.last_draft_saved_at,
    };
  }

  /**
   * List drafts from the record_drafts table
   */
  async listDrafts(
    options: {
      type?: string;
      created_by?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    const result = await this.db.listDrafts(options);

    // Transform drafts to match record format
    const records = result.drafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      type: draft.type,
      status: draft.status,
      markdownBody: draft.markdown_body,
      content: draft.markdown_body, // Alias for compatibility
      metadata: draft.metadata ? JSON.parse(draft.metadata) : {},
      geography: draft.geography ? JSON.parse(draft.geography) : undefined,
      attachedFiles: draft.attached_files
        ? JSON.parse(draft.attached_files)
        : [],
      linkedRecords: draft.linked_records
        ? JSON.parse(draft.linked_records)
        : [],
      linkedGeographyFiles: draft.linked_geography_files
        ? JSON.parse(draft.linked_geography_files)
        : [],
      author: draft.author,
      created_by: draft.created_by,
      created_at: draft.created_at,
      updated_at: draft.updated_at,
      last_draft_saved_at: draft.last_draft_saved_at,
      isDraft: true,
    }));

    return {
      records,
      total: result.total,
    };
  }

  /**
   * Delete a draft
   */
  async deleteDraft(id: string): Promise<void> {
    await this.db.deleteDraft(id);
  }

  /**
   * Get frontmatter YAML for a record or draft
   * Uses RecordParser to ensure proper format matching the schema
   */
  async getFrontmatterYaml(id: string, user: any): Promise<string | null> {
    // Get the record or draft
    const recordData = await this.getDraftOrRecord(id, user);
    if (!recordData) {
      return null;
    }

    // Convert to RecordData format
    const record: RecordData = {
      id: recordData.id,
      title: recordData.title,
      type: recordData.type,
      status: recordData.status,
      content: recordData.markdownBody || recordData.content || '',
      metadata: recordData.metadata || {},
      geography: recordData.geography,
      attachedFiles: recordData.attachedFiles || [],
      linkedRecords: recordData.linkedRecords || [],
      linkedGeographyFiles: recordData.linkedGeographyFiles || [],
      author: recordData.author || recordData.created_by || 'unknown',
      authors: recordData.authors,
      created_at: recordData.created_at || new Date().toISOString(),
      updated_at:
        recordData.updated_at ||
        recordData.last_draft_saved_at ||
        new Date().toISOString(),
      source: recordData.source,
      commit_ref: recordData.commit_ref,
      commit_signature: recordData.commit_signature,
    };

    // Use RecordParser to generate the properly formatted markdown
    const fullMarkdown = RecordParser.serializeToMarkdown(record);

    // Extract just the frontmatter YAML (between the --- delimiters)
    const frontmatterMatch = fullMarkdown.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch && frontmatterMatch[1]) {
      return frontmatterMatch[1].trim();
    }

    // Fallback: if extraction fails, build frontmatter and format manually
    const frontmatter = RecordParser.buildFrontmatter(record);
    // Use js-yaml library (available in API module) to format (though we lose the ordering from generateOrderedYaml)
    const yaml = await import('js-yaml');
    return yaml.dump(frontmatter, { indent: 2, lineWidth: 0 });
  }

  /**
   * Get a draft or published record
   * Checks drafts first (if user can edit), then published records
   */
  async getDraftOrRecord(id: string, user: any): Promise<any | null> {
    // Check if user can edit (if so, check drafts first)
    const canEdit = await userCan(user, 'records:edit', {
      action: 'edit',
    });

    if (canEdit) {
      // Check drafts first
      const draft = await this.db.getDraft(id);
      if (draft) {
        return {
          id: draft.id,
          title: draft.title,
          type: draft.type,
          status: draft.status,
          markdownBody: draft.markdown_body,
          metadata: draft.metadata ? JSON.parse(draft.metadata) : {},
          geography: draft.geography ? JSON.parse(draft.geography) : undefined,
          attachedFiles: draft.attached_files
            ? JSON.parse(draft.attached_files)
            : [],
          linkedRecords: draft.linked_records
            ? JSON.parse(draft.linked_records)
            : [],
          linkedGeographyFiles: draft.linked_geography_files
            ? JSON.parse(draft.linked_geography_files)
            : [],
          author: draft.author,
          created_by: draft.created_by,
          created_at: draft.created_at,
          updated_at: draft.updated_at,
          last_draft_saved_at: draft.last_draft_saved_at,
          isDraft: true,
        };
      }
    }

    // Fall back to published record
    const record = await this.getRecord(id);
    if (record) {
      return {
        ...record,
        isDraft: false,
      };
    }

    return null;
  }

  /**
   * Publish a draft (creates record file and moves to records table)
   */
  async publishDraft(
    id: string,
    user: any,
    targetStatus?: string
  ): Promise<any> {
    // Get draft
    const draft = await this.db.getDraft(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    // Validate permissions (publishing requires edit permission)
    const hasPermission = await userCan(user, 'records:edit', {
      recordType: draft.type,
      action: 'edit',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot publish records of type '${draft.type}'`
      );
    }

    // Use target status or draft's current status
    const finalStatus = targetStatus || draft.status;

    // Create record request
    const request: CreateRecordRequest = {
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
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
    };

    // Create record using RecordManager (this will create file and save to records table)
    const record = await this.recordManager.createRecordWithId(
      id,
      request,
      user
    );

    // Delete draft
    await this.db.deleteDraft(id);

    return {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      content: record.content,
      metadata: record.metadata || {},
      authors: record.authors,
      source: record.source,
      geography: record.geography,
      attachedFiles: record.attachedFiles || [],
      linkedRecords: record.linkedRecords || [],
      linkedGeographyFiles: record.linkedGeographyFiles || [],
      path: record.path,
      created_at: record.created_at,
      updated_at: record.updated_at,
      author: record.author,
      commit_ref: record.commit_ref,
      commit_signature: record.commit_signature,
    };
  }

  /**
   * Lock management
   */
  async acquireLock(
    recordId: string,
    user: any,
    lockDurationMinutes = 30
  ): Promise<boolean> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + lockDurationMinutes);
    const lockedBy = user.id?.toString() || user.username;

    return await this.db.acquireLock(recordId, lockedBy, expiresAt);
  }

  async releaseLock(recordId: string, user: any): Promise<boolean> {
    const lockedBy = user.id?.toString() || user.username;
    return await this.db.releaseLock(recordId, lockedBy);
  }

  async getLock(recordId: string): Promise<any | null> {
    return await this.db.getLock(recordId);
  }

  async refreshLock(
    recordId: string,
    user: any,
    lockDurationMinutes = 30
  ): Promise<boolean> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + lockDurationMinutes);
    const lockedBy = user.id?.toString() || user.username;

    return await this.db.refreshLock(recordId, lockedBy, expiresAt);
  }
}
