import {
  CivicPress,
  CreateRecordRequest,
  UpdateRecordRequest,
  RecordManager,
  userCan,
  coreError,
  Logger,
} from '@civicpress/core';
import fs from 'fs';
import path from 'path';
import { normalizeDateString } from './helpers.js';

export interface RecordsCrudDeps {
  civicPress: CivicPress;
  recordManager: RecordManager;
  logger: Logger;
  /**
   * Resolved data directory used to read raw record files from disk. Sourced
   * from `(civicPress as any).config?.dataDir || './data'` in the orchestrator.
   */
  dataDir: string | null;
}

/**
 * RecordsCrud — owns the create/read/update/delete operations previously
 * inlined on `RecordsService`. Bodies moved verbatim; `this.civicPress`,
 * `this.recordManager`, etc. become `this.deps.civicPress` and friends.
 * `this.normalizeDateString` becomes the module-level helper.
 */
export class RecordsCrud {
  constructor(private readonly deps: RecordsCrudDeps) {}

  /**
   * Create a new record
   */
  async createRecord(
    data: {
      title: string;
      type: string;
      content?: string;
      status?: string; // Legal status (stored in YAML + DB)
      workflowState?: string; // Internal editorial status (DB-only, never in YAML)
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
      status: data.status,
      workflowState: data.workflowState,
      metadata: data.metadata,
      geography: data.geography,
      attachedFiles: data.attachedFiles,
      linkedRecords: data.linkedRecords,
      linkedGeographyFiles: data.linkedGeographyFiles,
      authors: data.authors,
      source: data.source,
    };

    // Create the record using CivicCore
    const record = await this.deps.recordManager.createRecord(request, user);

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
      created_at: normalizeDateString(record.created_at),
      updated_at: normalizeDateString(record.updated_at),
      author: record.author,
      commit_ref: record.commit_ref,
      commit_signature: record.commit_signature,
    };
  }

  /**
   * Get a specific record
   */
  async getRecord(id: string): Promise<any | null> {
    const record = await this.deps.recordManager.getRecord(id);
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status, // Legal status (stored in YAML + DB)
      workflowState: record.workflowState, // Internal editorial status (DB-only)
      content: record.content,
      metadata: record.metadata || {},
      authors: record.authors,
      source: record.source,
      geography: record.geography,
      attachedFiles: record.attachedFiles || [],
      linkedRecords: record.linkedRecords || [],
      linkedGeographyFiles: record.linkedGeographyFiles || [],
      path: record.path,
      created_at: normalizeDateString(record.created_at),
      updated_at: normalizeDateString(record.updated_at),
      author: record.author,
      commit_ref: record.commit_ref,
      commit_signature: record.commit_signature,
    };
  }

  /**
   * Get raw file content for a record (including frontmatter)
   */
  async getRawRecord(id: string): Promise<any | null> {
    const record = await this.deps.recordManager.getRecord(id);
    if (!record) {
      return null;
    }

    // Read the raw file content from the filesystem
    // fs and path are already imported at the top of the file

    try {
      // The record.path already includes 'records/', so we need to construct the path correctly
      if (!this.deps.dataDir) {
        throw new Error('Data directory not set');
      }
      if (!record.path) {
        throw new Error('Record path not available');
      }
      const filePath = path.join(this.deps.dataDir, record.path);

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
      status?: string; // Legal status (stored in YAML + DB)
      workflowState?: string; // Internal editorial status (DB-only, never in YAML)
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
    const currentRecord = await this.deps.recordManager.getRecord(id);
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
      workflowState: data.workflowState,
      metadata: data.metadata,
      geography: data.geography,
      attachedFiles: data.attachedFiles,
      linkedRecords: data.linkedRecords,
      linkedGeographyFiles: data.linkedGeographyFiles,
      authors: data.authors,
      source: data.source,
    };

    // Update the record using CivicCore
    const updatedRecord = await this.deps.recordManager.updateRecord(
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
      status: updatedRecord.status, // Legal status (stored in YAML + DB)
      workflowState: updatedRecord.workflowState, // Internal editorial status (DB-only)
      content: updatedRecord.content,
      metadata: updatedRecord.metadata || {},
      authors: updatedRecord.authors,
      source: updatedRecord.source,
      geography: updatedRecord.geography,
      attachedFiles: updatedRecord.attachedFiles || [],
      linkedRecords: updatedRecord.linkedRecords || [],
      linkedGeographyFiles: updatedRecord.linkedGeographyFiles || [],
      path: updatedRecord.path,
      created_at: normalizeDateString(updatedRecord.created_at),
      updated_at: normalizeDateString(updatedRecord.updated_at),
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
    const record = await this.deps.recordManager.getRecord(id);
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
    return await this.deps.recordManager.archiveRecord(id, user);
  }
}
