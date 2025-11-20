import {
  CivicPress,
  CreateRecordRequest,
  UpdateRecordRequest,
  WorkflowConfigManager,
  RecordManager,
  userCan,
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

  constructor(
    civicPress: CivicPress,
    recordManager?: RecordManager,
    workflowManager?: WorkflowConfigManager
  ) {
    this.civicPress = civicPress;
    // Get dataDir from CivicPress config
    const dataDir = (civicPress as any).config?.dataDir || './data';
    this.dataDir = dataDir;

    // Use provided dependencies or create new ones
    this.workflowManager =
      workflowManager || new WorkflowConfigManager(dataDir);
    this.recordManager = recordManager || civicPress.getRecordManager();
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
      console.error(`Failed to read raw file for record ${id}:`, error);
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

    // Sort records by creation date (newest first) for consistent cursor behavior
    filteredRecords.sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

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
}
