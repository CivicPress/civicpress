import {
  CivicPress,
  CreateRecordRequest,
  UpdateRecordRequest,
  RecordManager,
  WorkflowConfigManager,
  userCan,
  coreError,
  Logger,
} from '@civicpress/core';
import type { AuthUser, Geography } from '@civicpress/core';
import { HttpError } from '../../utils/http-error.js';
import fs from 'fs';
import path from 'path';
import { normalizeDateString } from './helpers.js';

/**
 * The shape returned by RecordsCrud's create/read/update endpoints —
 * the API record envelope (a transformation of `RecordData` with
 * normalized dates + safe metadata defaults).
 */
interface ApiRecord {
  id: string;
  title: string;
  type: string;
  status?: string;
  // null = cleared editorial state (published records); see RecordData.workflowState.
  workflowState?: string | null;
  content?: string;
  metadata: Record<string, unknown>;
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
  geography?: Geography;
  attachedFiles: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?:
      | string
      | { label: string; value: string; description: string };
  }>;
  linkedRecords: Array<{
    id: string;
    type: string;
    description: string;
    path?: string;
    category?: string;
  }>;
  linkedGeographyFiles: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  path?: string;
  created_at: string | null | undefined;
  updated_at: string | null | undefined;
  author?: string;
  commit_ref?: string;
  commit_signature?: string;
  /** Tag used by callers to distinguish draft envelopes from published-record envelopes. */
  isDraft?: boolean;
  /** Set by listing endpoints to flag records with pending drafts. */
  hasUnpublishedChanges?: boolean;
}

/** Raw-file variant returned by getRawRecord (no list arrays). */
interface RawApiRecord {
  id: string;
  title: string;
  type: string;
  status: string;
  content?: string;
  metadata: Record<string, unknown>;
  path?: string;
  created: string;
  author?: string;
}

export interface RecordsCrudDeps {
  civicPress: CivicPress;
  recordManager: RecordManager;
  /**
   * Workflow config — used to enforce status-transition rules on the generic
   * write paths (create/update), not just POST /:id/status (FA-API-008).
   */
  workflowManager: WorkflowConfigManager;
  logger: Logger;
  /**
   * Resolved data directory used to read raw record files from disk. The
   * orchestrator reads this off the CivicPress instance's config and passes
   * it in (`config.dataDir || './data'`).
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
      metadata?: Record<string, unknown>;
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
    user: AuthUser
  ): Promise<ApiRecord> {
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

    // FA-API-008: a record is BORN at the workflow's initial status. Creating
    // one directly at a workflow-controlled status (e.g. 'approved'/'archived')
    // would skip the review chain, so such a status must be a valid transition
    // FROM the initial status for this role.
    if (typeof data.status === 'string') {
      const controlled = await this.deps.workflowManager.getControlledStatuses();
      if (controlled.has(data.status)) {
        const statuses = await this.deps.workflowManager.getAvailableStatuses(
          data.type
        );
        const initialStatus = statuses[0];
        if (initialStatus && data.status !== initialStatus) {
          const check = await this.deps.workflowManager.validateTransition(
            initialStatus,
            data.status,
            user.role
          );
          if (!check.valid) {
            throw new HttpError(
              403,
              check.reason ||
                `Cannot create a record directly at status '${data.status}' (role '${user.role}')`,
              'INVALID_STATUS_TRANSITION'
            );
          }
        }
      }
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
  async getRecord(id: string): Promise<ApiRecord | null> {
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
  async getRawRecord(id: string): Promise<RawApiRecord | null> {
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
      metadata?: Record<string, unknown>;
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
    user: AuthUser
  ): Promise<ApiRecord | null> {
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

    // FA-API-008: a generic update that moves a record INTO a
    // workflow-controlled status (approved/archived/…) must satisfy the same
    // transition rules as POST /:id/status — else a coarse records:edit role
    // could fabricate an approved/archived record here, bypassing
    // separation-of-duties. Legal statuses outside the transition graph
    // (draft/published) are left to their own flows.
    if (
      typeof data.status === 'string' &&
      data.status !== currentRecord.status
    ) {
      const controlled = await this.deps.workflowManager.getControlledStatuses();
      if (controlled.has(data.status)) {
        const check = await this.deps.workflowManager.validateTransition(
          currentRecord.status,
          data.status,
          user.role
        );
        if (!check.valid) {
          throw new HttpError(
            403,
            check.reason ||
              `Invalid status transition from '${currentRecord.status}' to '${data.status}' for role '${user.role}'`,
            'INVALID_STATUS_TRANSITION'
          );
        }
      }
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
  async deleteRecord(id: string, user: AuthUser): Promise<boolean> {
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
