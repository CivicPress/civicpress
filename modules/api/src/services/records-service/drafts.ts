import {
  CivicPress,
  RecordManager,
  userCan,
  DatabaseService,
  Logger,
} from '@civicpress/core';
import { normalizeDateString } from './helpers.js';

export interface RecordsDraftsDeps {
  civicPress: CivicPress;
  recordManager: RecordManager;
  db: DatabaseService;
  logger: Logger;
}

/**
 * RecordsDrafts — owns the `record_drafts` table lifecycle (create/update/
 * list/delete) plus the `listUnpublishedRecords` view over the published
 * records table filtered by workflow_state.
 *
 * Method bodies moved verbatim; `this.foo` references rewritten to
 * `this.deps.foo`, and `this.normalizeDateString` to the module helper.
 */
export class RecordsDrafts {
  constructor(private readonly deps: RecordsDraftsDeps) {}

  /**
   * Create a new draft (saves to record_drafts table only, no file)
   */
  async createDraft(
    data: {
      title: string;
      type: string;
      status?: string; // Legal status (stored in YAML + DB)
      workflowState?: string; // Internal editorial status (DB-only, never in YAML)
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
    user: any,
    recordId?: string // Optional ID - if not provided, will be generated
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

    // Use provided ID or generate one
    const finalRecordId = recordId || `record-${Date.now()}`;
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
      await this.deps.db.createDraft({
        id: finalRecordId,
        title: data.title,
        type: data.type,
        status: data.status || 'draft',
        // Always use the provided workflowState, default to 'draft' only if not provided
        workflow_state:
          data.workflowState !== undefined &&
          data.workflowState !== null &&
          data.workflowState !== ''
            ? data.workflowState
            : 'draft',
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
      this.deps.logger.error('Failed to create draft', {
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
    const draft = await this.deps.db.getDraft(finalRecordId);

    // workflowState: Prioritize the value we sent if it's non-default, otherwise use DB value
    // This ensures that when we create a draft with a specific workflowState, it's honored
    // even if the DB has a default 'draft' value (which can happen if column was added with DEFAULT)
    const dbWorkflowState =
      draft.workflow_state !== undefined
        ? draft.workflow_state
        : (draft as any).workflowState;

    // Priority: 1) Value we sent (if non-default), 2) DB value, 3) 'draft' default
    const finalWorkflowState =
      data.workflowState !== undefined &&
      data.workflowState !== null &&
      data.workflowState !== '' &&
      data.workflowState !== 'draft'
        ? data.workflowState // If we sent a non-default value, use it (this handles cases where DB has default)
        : dbWorkflowState !== undefined &&
            dbWorkflowState !== null &&
            dbWorkflowState !== ''
          ? dbWorkflowState // Otherwise use DB value
          : 'draft'; // Final fallback to default

    // Log for debugging
    this.deps.logger.debug('Determining workflowState for createDraft response', {
      id: draft.id,
      dbWorkflowState,
      requestedWorkflowState: data.workflowState,
      finalWorkflowState,
      hasWorkflowStateInDraft: 'workflow_state' in draft,
    });

    return {
      id: draft.id,
      title: draft.title,
      type: draft.type,
      status: draft.status, // Legal status (stored in YAML + DB)
      workflowState: finalWorkflowState, // Internal editorial status (DB-only)
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
      created_at: normalizeDateString(draft.created_at),
      updated_at: normalizeDateString(draft.updated_at),
      last_draft_saved_at: normalizeDateString(draft.last_draft_saved_at),
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
      status?: string; // Legal status (stored in YAML + DB)
      workflowState?: string; // Internal editorial status (DB-only, never in YAML)
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
    const draft = await this.deps.db.getDraft(id);
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

    // Get existing draft to preserve workflowState if not being updated
    const existingDraft = await this.deps.db.getDraft(id);
    // Get workflow_state from existing draft - handle both snake_case (DB) and camelCase (API)
    const existingWorkflowState =
      existingDraft?.workflow_state || existingDraft?.workflowState;

    // Log for debugging
    this.deps.logger.info(
      'Reading existing draft for workflowState preservation',
      {
        id,
        existingWorkflowState,
        hasWorkflowState: 'workflow_state' in (existingDraft || {}),
        existingDraftKeys: existingDraft ? Object.keys(existingDraft) : [],
        draftWorkflowState: existingDraft?.workflow_state,
        draftWorkflowStateType: typeof existingDraft?.workflow_state,
      }
    );

    // Update draft
    // Only include workflow_state if it's explicitly provided (not undefined)
    const draftUpdates: any = {
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
    };

    // Only update workflow_state if it's explicitly provided (not undefined/null/empty)
    // Otherwise preserve the existing value
    if (
      data.workflowState !== undefined &&
      data.workflowState !== null &&
      data.workflowState !== ''
    ) {
      draftUpdates.workflow_state = data.workflowState;
      this.deps.logger.info('Including workflow_state in draft update', {
        id,
        workflowState: data.workflowState,
        draftUpdatesKeys: Object.keys(draftUpdates),
      });
    } else if (
      existingWorkflowState !== undefined &&
      existingWorkflowState !== null &&
      existingWorkflowState !== ''
    ) {
      // Preserve existing workflowState if not being updated
      draftUpdates.workflow_state = existingWorkflowState;
      this.deps.logger.info(
        'Preserving existing workflow_state in draft update',
        {
          id,
          workflowState: existingWorkflowState,
        }
      );
    }

    await this.deps.db.updateDraft(id, draftUpdates);

    // Get updated draft
    const updatedDraft = await this.deps.db.getDraft(id);

    // Debug: Log workflow_state value to verify it's being saved
    if (updatedDraft) {
      this.deps.logger.info('Draft workflow_state after update', {
        id,
        workflow_state: updatedDraft.workflow_state,
        workflow_state_type: typeof updatedDraft.workflow_state,
        has_workflow_state: 'workflow_state' in updatedDraft,
        allKeys: Object.keys(updatedDraft),
      });
    }

    // Determine workflowState value with priority:
    // 1. Explicitly provided value (highest priority)
    // 2. Preserved value from existing draft
    // 3. Value from updated draft (DB)
    // 4. Default 'draft' (lowest priority)
    let workflowStateValue = 'draft'; // Default

    // Priority 1: If workflowState was explicitly provided in the update, use it
    if (
      data.workflowState !== undefined &&
      data.workflowState !== null &&
      data.workflowState !== ''
    ) {
      workflowStateValue = data.workflowState;
      this.deps.logger.debug('Using explicit workflowState from update', {
        id,
        workflowStateValue,
      });
    }
    // Priority 2: Use the value we read from existing draft (preserved during update)
    else if (
      existingWorkflowState !== undefined &&
      existingWorkflowState !== null &&
      existingWorkflowState !== ''
    ) {
      workflowStateValue = existingWorkflowState;
      this.deps.logger.debug(
        'Using preserved workflowState from existing draft',
        {
          id,
          workflowStateValue,
        }
      );
    }
    // Priority 3: Fallback to DB value if available
    else if (
      updatedDraft &&
      'workflow_state' in updatedDraft &&
      updatedDraft.workflow_state !== null &&
      updatedDraft.workflow_state !== undefined &&
      updatedDraft.workflow_state !== ''
    ) {
      workflowStateValue = updatedDraft.workflow_state;
      this.deps.logger.debug('Using workflowState from updated draft (DB)', {
        id,
        workflowStateValue,
      });
    }
    // Priority 4: Use default and log warning
    else {
      if (!updatedDraft || !('workflow_state' in updatedDraft)) {
        this.deps.logger.warn(
          'workflow_state column does not exist in database - migration may not have run',
          {
            id,
            availableColumns: updatedDraft ? Object.keys(updatedDraft) : [],
            existingWorkflowState,
            hasExistingValue:
              existingWorkflowState !== undefined &&
              existingWorkflowState !== null,
          }
        );
      } else {
        this.deps.logger.debug('Using default workflowState', {
          id,
          workflowStateValue,
        });
      }
    }

    this.deps.logger.info('Returning workflowState from updateDraft', {
      id,
      workflowStateValue,
      dbValue: updatedDraft.workflow_state,
      hasColumn: 'workflow_state' in updatedDraft,
    });

    return {
      id: updatedDraft.id,
      title: updatedDraft.title,
      type: updatedDraft.type,
      status: updatedDraft.status, // Legal status (stored in YAML + DB)
      workflowState: workflowStateValue, // Internal editorial status (DB-only)
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
      created_at: normalizeDateString(updatedDraft.created_at),
      updated_at: normalizeDateString(updatedDraft.updated_at),
      last_draft_saved_at: normalizeDateString(
        updatedDraft.last_draft_saved_at
      ),
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
  ): Promise<{ drafts: any[]; total: number }> {
    const result = await this.deps.db.listDrafts(options);

    // Transform drafts to match record format
    const drafts = result.drafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      type: draft.type,
      status: draft.status, // Legal status (stored in YAML + DB)
      workflowState:
        draft.workflow_state !== undefined && draft.workflow_state !== null
          ? draft.workflow_state
          : 'draft', // Internal editorial status (DB-only)
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
      created_at: normalizeDateString(draft.created_at),
      updated_at: normalizeDateString(draft.updated_at),
      last_draft_saved_at: normalizeDateString(draft.last_draft_saved_at),
      isDraft: true,
    }));

    return {
      drafts,
      total: result.total,
    };
  }

  /**
   * List unpublished records from records table (filtered by workflowState)
   * Returns records where workflowState indicates draft/unpublished state
   */
  async listUnpublishedRecords(
    options: {
      type?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{
    records: any[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  }> {
    const { type, limit = 20, cursor } = options;

    // Workflow states that indicate draft/unpublished
    const unpublishedWorkflowStates = [
      'draft',
      'under_review',
      'ready_for_publication',
    ];

    // Query records table with workflowState filter
    const db = this.deps.civicPress.getDatabaseService();
    let query = `
      SELECT * FROM records
      WHERE workflow_state IN (${unpublishedWorkflowStates
        .map(() => '?')
        .join(',')})
    `;
    const params: any[] = [...unpublishedWorkflowStates];

    if (type) {
      const types = type.split(',').map((t) => t.trim());
      query += ` AND type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }

    // Order by updated_at descending
    query += ' ORDER BY updated_at DESC';

    const allRecords = await db.query(query, params);

    // Transform records
    let records = allRecords.map((record: any) => ({
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status, // Legal status
      workflowState:
        record.workflow_state !== undefined && record.workflow_state !== null
          ? record.workflow_state
          : null, // Internal editorial status
      content: record.content,
      metadata: record.metadata ? JSON.parse(record.metadata) : {},
      geography: record.geography ? JSON.parse(record.geography) : undefined,
      attachedFiles: record.attached_files
        ? JSON.parse(record.attached_files)
        : [],
      linkedRecords: record.linked_records
        ? JSON.parse(record.linked_records)
        : [],
      linkedGeographyFiles: record.linked_geography_files
        ? JSON.parse(record.linked_geography_files)
        : [],
      author: record.author,
      created_at: normalizeDateString(record.created_at),
      updated_at: normalizeDateString(record.updated_at),
      isUnpublished: true,
    }));

    // Find starting index based on cursor
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = records.findIndex(
        (record: any) => record.id === cursor
      );
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    // Get requested number of records
    const endIndex = startIndex + limit;
    const paginatedRecords = records.slice(startIndex, endIndex);

    // Determine if there are more records
    const hasMore = endIndex < records.length;
    const nextCursor = hasMore
      ? paginatedRecords[paginatedRecords.length - 1]?.id || null
      : null;

    return {
      records: paginatedRecords,
      nextCursor,
      hasMore,
      total: records.length,
    };
  }

  /**
   * Delete a draft
   */
  async deleteDraft(id: string): Promise<void> {
    await this.deps.db.deleteDraft(id);
  }
}
