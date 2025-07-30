import {
  CivicPress,
  CreateRecordRequest,
  UpdateRecordRequest,
  WorkflowConfigManager,
  RecordManager,
  userCan,
} from '@civicpress/core';

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

  constructor(
    civicPress: CivicPress,
    recordManager?: RecordManager,
    workflowManager?: WorkflowConfigManager
  ) {
    this.civicPress = civicPress;
    // Get dataDir from CivicPress config
    this.dataDir = (civicPress as any).config?.dataDir || './data';

    // Use provided dependencies or create new ones
    this.workflowManager =
      workflowManager || new WorkflowConfigManager(this.dataDir!);
    this.recordManager = recordManager || civicPress.getRecordManager();
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
    },
    userRole: string = 'unknown'
  ): Promise<any> {
    // Create a mock user object for permission checking
    const mockUser = {
      id: 1,
      username: 'api-user',
      role: userRole,
      email: 'api@example.com',
      name: 'API User',
    };

    // Validate permissions using the same system as API middleware
    const hasPermission = await userCan(mockUser, 'records:create', {
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
      role: userRole,
    };

    // Create the record using CivicCore
    const record = await this.recordManager.createRecord(request, userRole);

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
      path: record.path,
      created: record.created_at,
      author: record.author,
    };
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
    },
    userRole: string = 'unknown'
  ): Promise<any | null> {
    // Get the current record to validate permissions
    const currentRecord = await this.recordManager.getRecord(id);
    if (!currentRecord) {
      return null;
    }

    // Create a mock user object for permission checking
    const mockUser = {
      id: 1,
      username: 'api-user',
      role: userRole,
      email: 'api@example.com',
      name: 'API User',
    };

    // Validate permissions using the same system as API middleware
    const hasPermission = await userCan(mockUser, 'records:edit', {
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
    };

    // Update the record using CivicCore
    const updatedRecord = await this.recordManager.updateRecord(
      id,
      request,
      userRole
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
      path: updatedRecord.path,
      created: updatedRecord.created_at,
      author: updatedRecord.author,
    };
  }

  /**
   * Delete (archive) a record
   */
  async deleteRecord(
    id: string,
    userRole: string = 'unknown'
  ): Promise<boolean> {
    // Get the current record to validate permissions
    const record = await this.recordManager.getRecord(id);
    if (!record) {
      return false;
    }

    // Create a mock user object for permission checking
    const mockUser = {
      id: 1,
      username: 'api-user',
      role: userRole,
      email: 'api@example.com',
      name: 'API User',
    };

    // Validate permissions using the same system as API middleware
    const hasPermission = await userCan(mockUser, 'records:delete', {
      recordType: record.type,
      action: 'delete',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot delete records of type '${record.type}'`
      );
    }

    // Archive the record
    return await this.recordManager.archiveRecord(id, userRole);
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
}
