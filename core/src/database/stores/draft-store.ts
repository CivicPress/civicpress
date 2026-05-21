/**
 * Draft Store — owns CRUD for `record_drafts`.
 *
 * Extracted from `database-service.ts` as part of Phase 2d W2-T5
 * decomposition. Method bodies are moved verbatim; only the receiver
 * changes (the store owns its own adapter + logger references). The
 * orchestrator (`DatabaseService`) delegates one-liners to this store
 * so external consumers see no signature change.
 */

import { DatabaseAdapter } from '../database-adapter.js';
import { errorMessage, errorStack, errorCode, errorName } from '../../utils/error-narrow.js';
import { Logger } from '../../utils/logger.js';

export class DraftStore {
  private adapter: DatabaseAdapter;
  private logger: Logger;

  constructor(adapter: DatabaseAdapter, logger?: Logger) {
    this.adapter = adapter;
    this.logger = logger || new Logger();
  }

  // Draft management
  async createDraft(draftData: {
    id: string;
    title: string;
    type: string;
    status?: string;
    workflow_state?: string;
    markdown_body?: string | null;
    metadata?: string | null;
    geography?: string | null;
    attached_files?: string | null;
    linked_records?: string | null;
    linked_geography_files?: string | null;
    author: string;
    created_by: string;
  }): Promise<void> {
    // Track if we had to add the column - if so, we may need to UPDATE after INSERT
    let columnAdded = false;

    // Ensure workflow_state column exists before inserting
    // This is critical to prevent silent failures when column doesn't exist
    try {
      // Check if table exists first
      const tableExists = await this.adapter.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='record_drafts'"
      );

      if (tableExists.length > 0) {
        // Table exists, check if column exists
        const tableInfo = await this.adapter.query(
          'PRAGMA table_info(record_drafts)'
        );
        const columnNames = tableInfo.map((col: any) => col.name);
        const hasColumn = columnNames.includes('workflow_state');

        if (!hasColumn) {
          this.logger.info(
            'workflow_state column missing in record_drafts, adding it before insert',
            {
              id: draftData.id,
              existingColumns: columnNames,
            }
          );
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
          // Verify it was added
          const verifyInfo = await this.adapter.query(
            'PRAGMA table_info(record_drafts)'
          );
          const verifyColumns = verifyInfo.map((col: any) => col.name);
          if (!verifyColumns.includes('workflow_state')) {
            throw new Error(
              'Failed to add workflow_state column to record_drafts table'
            );
          }
          this.logger.info(
            'Successfully added workflow_state column to record_drafts',
            { id: draftData.id }
          );
          // Mark that we need to UPDATE after INSERT to ensure the value is set correctly
          // (since ALTER TABLE with DEFAULT might set default value for existing rows)
          columnAdded = true;
        }
      }
      // If table doesn't exist, CREATE TABLE will include the column
    } catch (error: unknown) {
      // Log error but continue - if INSERT fails, we'll get a clear error
      this.logger.error(
        'Error checking/adding workflow_state column before insert',
        {
          id: draftData.id,
          error: errorMessage(error) || String(error),
        }
      );
      // Don't throw - let INSERT attempt proceed, it will fail with clear error if needed
    }

    // Attempt INSERT with workflow_state column
    try {
      await this.adapter.execute(
        'INSERT INTO record_drafts (id, title, type, status, workflow_state, markdown_body, metadata, geography, attached_files, linked_records, linked_geography_files, author, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          draftData.id,
          draftData.title,
          draftData.type,
          draftData.status || 'draft',
          draftData.workflow_state || 'draft',
          draftData.markdown_body || null,
          draftData.metadata || null,
          draftData.geography || null,
          draftData.attached_files || null,
          draftData.linked_records || null,
          draftData.linked_geography_files || null,
          draftData.author,
          draftData.created_by,
        ]
      );
    } catch (error: unknown) {
      // If INSERT fails due to missing column, try to add it and retry
      if (
        errorMessage(error)?.includes('no such column: workflow_state') ||
        errorMessage(error)?.includes('no column named workflow_state')
      ) {
        this.logger.warn(
          'INSERT failed due to missing workflow_state column, adding it and retrying',
          {
            id: draftData.id,
          }
        );
        try {
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
          // Retry INSERT
          await this.adapter.execute(
            'INSERT INTO record_drafts (id, title, type, status, workflow_state, markdown_body, metadata, geography, attached_files, linked_records, linked_geography_files, author, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              draftData.id,
              draftData.title,
              draftData.type,
              draftData.status || 'draft',
              draftData.workflow_state || 'draft',
              draftData.markdown_body || null,
              draftData.metadata || null,
              draftData.geography || null,
              draftData.attached_files || null,
              draftData.linked_records || null,
              draftData.linked_geography_files || null,
              draftData.author,
              draftData.created_by,
            ]
          );
          this.logger.info(
            'Successfully created draft after adding workflow_state column',
            { id: draftData.id }
          );
          columnAdded = true;
        } catch (retryError: unknown) {
          this.logger.error(
            'Failed to create draft even after adding workflow_state column',
            {
              id: draftData.id,
              error: errorMessage(retryError) || String(retryError),
            }
          );
          throw retryError;
        }
      } else {
        // Different error, re-throw
        throw error;
      }
    }

    // Always verify and ensure workflow_state was saved correctly if a specific non-default value was provided
    // This handles edge cases where the column might have been added with a DEFAULT
    // and the value didn't get set correctly during INSERT
    const requestedWorkflowState = draftData.workflow_state;

    // Force verification if we had to add the column OR if a non-default value was requested
    if (
      columnAdded ||
      (requestedWorkflowState && requestedWorkflowState !== 'draft')
    ) {
      try {
        // Verify the value was actually saved correctly
        const verifyRows = await this.adapter.query(
          'SELECT workflow_state FROM record_drafts WHERE id = ?',
          [draftData.id]
        );
        const savedValue = verifyRows[0]?.workflow_state;

        this.logger.debug('Verifying workflow_state after INSERT', {
          id: draftData.id,
          requested: requestedWorkflowState,
          saved: savedValue,
          columnAdded,
          matches: savedValue === requestedWorkflowState,
        });

        // If the saved value doesn't match what we intended, update it
        // This can happen if the column was added with DEFAULT 'draft' and the INSERT used the default
        if (savedValue !== requestedWorkflowState) {
          this.logger.info(
            'workflow_state value mismatch after INSERT, correcting it',
            {
              id: draftData.id,
              expected: requestedWorkflowState,
              actual: savedValue,
              columnAdded,
            }
          );
          await this.adapter.execute(
            'UPDATE record_drafts SET workflow_state = ? WHERE id = ?',
            [requestedWorkflowState, draftData.id]
          );

          // Verify the UPDATE worked
          const verifyAfterUpdate = await this.adapter.query(
            'SELECT workflow_state FROM record_drafts WHERE id = ?',
            [draftData.id]
          );
          const updatedValue = verifyAfterUpdate[0]?.workflow_state;

          if (updatedValue === requestedWorkflowState) {
            this.logger.info('Successfully corrected workflow_state value', {
              id: draftData.id,
              workflow_state: requestedWorkflowState,
            });
          } else {
            this.logger.error('Failed to verify workflow_state UPDATE', {
              id: draftData.id,
              expected: requestedWorkflowState,
              actual: updatedValue,
            });
          }
        } else {
          this.logger.debug(
            'workflow_state value correctly saved during INSERT',
            {
              id: draftData.id,
              workflow_state: savedValue,
            }
          );
        }
      } catch (verifyError: unknown) {
        this.logger.error(
          'Failed to verify/update workflow_state after INSERT',
          {
            id: draftData.id,
            requested: requestedWorkflowState,
            error: errorMessage(verifyError) || String(verifyError),
            stack: errorStack(verifyError),
          }
        );
        // Don't throw - the INSERT succeeded, just the verification/UPDATE failed
      }
    } else {
      this.logger.debug(
        'Skipping workflow_state verification (default value or not provided)',
        {
          id: draftData.id,
          requested: requestedWorkflowState,
        }
      );
    }
  }

  async getDraft(id: string): Promise<any | null> {
    const rows = await this.adapter.query(
      'SELECT * FROM record_drafts WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    const draft = rows[0];

    // Defensive: Ensure workflow_state exists, default to 'draft' if missing
    // This handles edge cases where column might not exist despite migrations
    if (
      !('workflow_state' in draft) ||
      draft.workflow_state === null ||
      draft.workflow_state === undefined
    ) {
      // Check if column actually exists in schema
      try {
        const tableInfo = await this.adapter.query(
          'PRAGMA table_info(record_drafts)'
        );
        const hasColumn = tableInfo.some(
          (col: any) => col.name === 'workflow_state'
        );

        if (!hasColumn) {
          // Column doesn't exist - try to add it
          this.logger.warn(
            'workflow_state column missing from record_drafts, attempting migration',
            { id }
          );
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
          // Re-query to get the draft with the new column
          const updatedRows = await this.adapter.query(
            'SELECT * FROM record_drafts WHERE id = ?',
            [id]
          );
          if (updatedRows.length > 0) {
            return {
              ...updatedRows[0],
              workflow_state: updatedRows[0].workflow_state || 'draft',
            };
          }
        }
      } catch (error) {
        this.logger.error('Failed to verify/add workflow_state column', {
          id,
          error,
        });
      }

      // Return with default if column exists but value is null
      return { ...draft, workflow_state: 'draft' };
    }

    return draft;
  }

  async listDrafts(
    options: {
      type?: string;
      created_by?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ drafts: any[]; total: number }> {
    const clauses: string[] = [];
    const params: any[] = [];

    if (options.type) {
      clauses.push('type = ?');
      params.push(options.type);
    }

    if (options.created_by) {
      clauses.push('created_by = ?');
      params.push(options.created_by);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // Get total count
    const countRows = await this.adapter.query(
      `SELECT COUNT(*) as total FROM record_drafts ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Get drafts with pagination
    let query = `SELECT * FROM record_drafts ${whereClause} ORDER BY last_draft_saved_at DESC`;
    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    const rows = await this.adapter.query(query, params);

    return {
      drafts: rows,
      total,
    };
  }

  async updateDraft(
    id: string,
    updates: {
      title?: string;
      type?: string;
      status?: string;
      workflow_state?: string;
      markdown_body?: string;
      metadata?: string;
      geography?: string;
      attached_files?: string;
      linked_records?: string;
      linked_geography_files?: string;
    }
  ): Promise<void> {
    // Ensure workflow_state column exists before updating
    if (updates.workflow_state !== undefined) {
      try {
        const tableInfo = await this.adapter.query(
          'PRAGMA table_info(record_drafts)'
        );
        const hasColumn = tableInfo.some(
          (col: any) => col.name === 'workflow_state'
        );

        if (!hasColumn) {
          this.logger.warn(
            'workflow_state column missing, adding it before update',
            { id }
          );
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
        }
      } catch (error) {
        this.logger.warn(
          'Could not verify workflow_state column, proceeding with update',
          { id, error }
        );
      }
    }
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.workflow_state !== undefined) {
      fields.push('workflow_state = ?');
      values.push(updates.workflow_state);
    }
    if (updates.markdown_body !== undefined) {
      fields.push('markdown_body = ?');
      values.push(updates.markdown_body);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
    }
    if (updates.geography !== undefined) {
      fields.push('geography = ?');
      values.push(updates.geography);
    }
    if (updates.attached_files !== undefined) {
      fields.push('attached_files = ?');
      values.push(updates.attached_files);
    }
    if (updates.linked_records !== undefined) {
      fields.push('linked_records = ?');
      values.push(updates.linked_records);
    }
    if (updates.linked_geography_files !== undefined) {
      fields.push('linked_geography_files = ?');
      values.push(updates.linked_geography_files);
    }

    if (fields.length === 0) {
      return; // No updates to perform
    }

    // Always update last_draft_saved_at and updated_at
    fields.push('last_draft_saved_at = CURRENT_TIMESTAMP');
    fields.push('updated_at = CURRENT_TIMESTAMP');

    values.push(id);

    const sql = `UPDATE record_drafts SET ${fields.join(', ')} WHERE id = ?`;

    // Debug logging for workflow_state updates
    if (updates.workflow_state !== undefined) {
      console.log('[DatabaseService] Updating workflow_state:', {
        id,
        workflow_state: updates.workflow_state,
        sql,
        fields,
        values: values.map((v, i) => (i === values.length - 1 ? '[id]' : v)),
      });
    }

    await this.adapter.execute(sql, values);
  }

  async deleteDraft(id: string): Promise<void> {
    await this.adapter.execute('DELETE FROM record_drafts WHERE id = ?', [id]);
  }
}
