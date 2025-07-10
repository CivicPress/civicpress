import {
  CivicPress,
  CreateRecordRequest,
  UpdateRecordRequest,
  WorkflowConfigManager,
  RecordManager,
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
    // Validate permissions
    const actionValidation = await this.workflowManager.validateAction(
      'create',
      data.type,
      userRole
    );

    if (!actionValidation.valid) {
      throw new Error(`Permission denied: ${actionValidation.reason}`);
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

    // Validate permissions
    const actionValidation = await this.workflowManager.validateAction(
      'edit',
      currentRecord.type,
      userRole
    );

    if (!actionValidation.valid) {
      throw new Error(`Permission denied: ${actionValidation.reason}`);
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

    // Validate permissions
    const actionValidation = await this.workflowManager.validateAction(
      'delete',
      record.type,
      userRole
    );

    if (!actionValidation.valid) {
      throw new Error(`Permission denied: ${actionValidation.reason}`);
    }

    // Archive the record
    return await this.recordManager.archiveRecord(id, userRole);
  }

  /**
   * List records
   */
  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    records: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const result = await this.recordManager.listRecords(options);
    return {
      records: result.records,
      total: result.total,
      page: 1,
      limit: 10,
    };
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
  ): Promise<{
    records: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const result = await this.recordManager.searchRecords(query, options);
    return {
      records: result.records,
      total: result.total,
      page: 1,
      limit: 10,
    };
  }
}
