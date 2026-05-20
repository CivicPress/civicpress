/**
 * Frontmatter + publish helpers for RecordsService.
 *
 * Phase 2d W2-T8: extracted verbatim from the prior monolithic
 * records-service.ts. Method bodies unchanged; `this.foo` rewritten to
 * `this.deps.foo`, `this.normalizeDateString` → module helper,
 * `this.getRecord` → injected callback from the orchestrator.
 */

import {
  CivicPress,
  RecordManager,
  RecordParser,
  RecordData,
  userCan,
  DatabaseService,
  Logger,
} from '@civicpress/core';
import { normalizeDateString } from './helpers.js';

export interface RecordsFrontmatterAndPublishDeps {
  civicPress: CivicPress;
  recordManager: RecordManager;
  db: DatabaseService;
  logger: Logger;
  /**
   * Callback to RecordsCrud.getRecord — required because
   * getDraftOrRecord falls back to the published-record path when no
   * draft is found, and we don't want to thread the entire CRUD collab.
   */
  getRecord: (id: string) => Promise<any | null>;
}

export class RecordsFrontmatterAndPublish {
  constructor(private readonly deps: RecordsFrontmatterAndPublishDeps) {}

  async getFrontmatterYaml(id: string, user: any): Promise<string | null> {
    const recordData = await this.getDraftOrRecord(id, user);
    if (!recordData) {
      return null;
    }

    const record: RecordData = {
      id: recordData.id,
      title: recordData.title,
      type: recordData.type,
      status: recordData.status,
      workflowState: recordData.workflowState,
      content: recordData.markdownBody || recordData.content || '',
      metadata: recordData.metadata || {},
      geography: recordData.geography,
      attachedFiles: recordData.attachedFiles || [],
      linkedRecords: recordData.linkedRecords || [],
      linkedGeographyFiles: recordData.linkedGeographyFiles || [],
      author: recordData.author || recordData.created_by || 'unknown',
      authors: recordData.authors,
      created_at:
        normalizeDateString(recordData.created_at) || new Date().toISOString(),
      updated_at:
        normalizeDateString(
          recordData.updated_at || recordData.last_draft_saved_at
        ) || new Date().toISOString(),
      source: recordData.source,
      commit_ref: recordData.commit_ref,
      commit_signature: recordData.commit_signature,
    };

    const fullMarkdown = RecordParser.serializeToMarkdown(record);
    const frontmatterMatch = fullMarkdown.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch && frontmatterMatch[1]) {
      return frontmatterMatch[1].trim();
    }

    const frontmatter = RecordParser.buildFrontmatter(record);
    const yaml = await import('js-yaml');
    return yaml.dump(frontmatter, { indent: 2, lineWidth: 0 });
  }

  /**
   * Get a draft or published record. Checks drafts first when the user
   * can edit; falls back to the published record path.
   */
  async getDraftOrRecord(id: string, user: any): Promise<any | null> {
    const canEdit = await userCan(user, 'records:edit', { action: 'edit' });

    if (canEdit) {
      const draft = await this.deps.db.getDraft(id);
      if (draft) {
        const dbWorkflowState =
          draft.workflow_state !== undefined
            ? draft.workflow_state
            : (draft as any).workflowState;

        if (dbWorkflowState === undefined && !('workflow_state' in draft)) {
          this.deps.logger.warn(
            'workflow_state missing from draft, attempting column migration',
            { id: draft.id }
          );
          try {
            const dbService = this.deps.civicPress.getDatabaseService();
            const adapter = (dbService as any).adapter;
            if (adapter) {
              const tableInfo = await adapter.query(
                'PRAGMA table_info(record_drafts)'
              );
              const hasColumn = tableInfo.some(
                (col: any) => col.name === 'workflow_state'
              );
              if (!hasColumn) {
                await adapter.execute(
                  "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
                );
                this.deps.logger.info(
                  'Added workflow_state column to record_drafts in getDraftOrRecord',
                  { id: draft.id }
                );
              }
            }
            const refreshedDraft = await this.deps.db.getDraft(draft.id);
            if (refreshedDraft && 'workflow_state' in refreshedDraft) {
              const refreshedValue = refreshedDraft.workflow_state || 'draft';
              return {
                ...draft,
                workflowState: refreshedValue,
                isDraft: true,
              };
            }
          } catch (error) {
            this.deps.logger.error(
              'Failed to add workflow_state column in getDraftOrRecord',
              { id: draft.id, error }
            );
          }
        }

        return {
          id: draft.id,
          title: draft.title,
          type: draft.type,
          status: draft.status,
          workflowState:
            dbWorkflowState !== undefined &&
            dbWorkflowState !== null &&
            dbWorkflowState !== ''
              ? dbWorkflowState
              : 'draft',
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
          isDraft: true,
        };
      }
    }

    const record = await this.deps.getRecord(id);
    if (record) {
      return {
        ...record,
        workflowState: record.workflowState || 'draft',
        isDraft: false,
        markdownBody: record.content,
      };
    }

    return null;
  }

  /**
   * Publish a draft via the saga path. Creates the record file and moves
   * the draft into the records table.
   */
  async publishDraft(
    id: string,
    user: any,
    targetStatus?: string
  ): Promise<any> {
    const draft = await this.deps.db.getDraft(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    const hasPermission = await userCan(user, 'records:edit', {
      recordType: draft.type,
      action: 'edit',
    });

    if (!hasPermission) {
      throw new Error(
        `Permission denied: Cannot publish records of type '${draft.type}'`
      );
    }

    const record = await this.deps.recordManager.publishDraft(
      id,
      user,
      targetStatus,
      undefined,
      this.deps.civicPress.getIndexingService(),
      `publish-${id}-${Date.now()}`
    );

    return {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      workflowState: record.workflowState || null,
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
}
