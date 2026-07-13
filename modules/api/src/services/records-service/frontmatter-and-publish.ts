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
  WorkflowConfigManager,
  userCan,
  DatabaseService,
  Logger,
} from '@civicpress/core';
import type {
  AuthUser,
  Geography,
  TableInfoRow,
} from '@civicpress/core';
import { normalizeDateString } from './helpers.js';
import { HttpError } from '../../utils/http-error.js';

/** Hybrid envelope returned by getDraftOrRecord — covers both draft + record paths. */
interface DraftOrRecord {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  workflowState?: string;
  markdownBody?: string;
  content?: string;
  metadata: Record<string, unknown>;
  geography?: Geography;
  attachedFiles: unknown[];
  linkedRecords: unknown[];
  linkedGeographyFiles: unknown[];
  authors?: RecordData['authors'];
  source?: RecordData['source'];
  author?: string;
  created_by?: string;
  created_at: string | null | undefined;
  updated_at: string | null | undefined;
  last_draft_saved_at?: string | null;
  path?: string;
  commit_ref?: string;
  commit_signature?: string;
  isDraft: boolean;
}

function parseJsonObject(
  value: string | undefined | null
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray<T = unknown>(
  value: string | undefined | null
): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseGeography(
  value: string | undefined | null
): Geography | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Geography;
  } catch {
    return undefined;
  }
}

export interface RecordsFrontmatterAndPublishDeps {
  civicPress: CivicPress;
  recordManager: RecordManager;
  /** Workflow config — enforces the target status at publish (FA-API-008). */
  workflowManager: WorkflowConfigManager;
  db: DatabaseService;
  logger: Logger;
  /**
   * Callback to RecordsCrud.getRecord — required because
   * getDraftOrRecord falls back to the published-record path when no
   * draft is found, and we don't want to thread the entire CRUD collab.
   * Returns the published-record api envelope shape; we re-narrow into
   * DraftOrRecord at the call site since the field set is a superset.
   */
  getRecord: (id: string) => Promise<unknown>;
}

export class RecordsFrontmatterAndPublish {
  constructor(private readonly deps: RecordsFrontmatterAndPublishDeps) {}

  async getFrontmatterYaml(
    id: string,
    user: AuthUser | undefined
  ): Promise<string | null> {
    const recordData = await this.getDraftOrRecord(id, user);
    if (!recordData) {
      return null;
    }

    const record: RecordData = {
      id: recordData.id,
      title: recordData.title || '',
      type: recordData.type || '',
      status: recordData.status || 'draft',
      workflowState: recordData.workflowState,
      content: recordData.markdownBody || recordData.content || '',
      metadata: recordData.metadata || {},
      geography: recordData.geography,
      attachedFiles: recordData.attachedFiles as RecordData['attachedFiles'],
      linkedRecords: recordData.linkedRecords as RecordData['linkedRecords'],
      linkedGeographyFiles:
        recordData.linkedGeographyFiles as RecordData['linkedGeographyFiles'],
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
  async getDraftOrRecord(
    id: string,
    user: AuthUser | undefined
  ): Promise<DraftOrRecord | null> {
    // Anonymous callers can't access drafts; skip the userCan check and
    // fall through to the published-record path.
    const canEdit = user
      ? await userCan(user, 'records:edit', { action: 'edit' })
      : false;

    if (canEdit) {
      const draft = await this.deps.db.getDraft(id);
      if (draft) {
        const dbWorkflowState = draft.workflow_state;

        if (dbWorkflowState === undefined && !('workflow_state' in draft)) {
          this.deps.logger.warn(
            'workflow_state missing from draft, attempting column migration',
            { id: draft.id }
          );
          try {
            const adapter = this.deps.civicPress
              .getDatabaseService()
              .getAdapter();
            const tableInfo = await adapter.query<TableInfoRow>(
              'PRAGMA table_info(record_drafts)'
            );
            const hasColumn = tableInfo.some(
              (col) => col.name === 'workflow_state'
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
            const refreshedDraft = await this.deps.db.getDraft(draft.id);
            if (refreshedDraft && 'workflow_state' in refreshedDraft) {
              const refreshedValue = refreshedDraft.workflow_state || 'draft';
              return {
                id: refreshedDraft.id,
                title: refreshedDraft.title,
                type: refreshedDraft.type,
                status: refreshedDraft.status,
                workflowState: refreshedValue,
                markdownBody: refreshedDraft.markdown_body,
                metadata: parseJsonObject(refreshedDraft.metadata),
                geography: parseGeography(refreshedDraft.geography),
                attachedFiles: parseJsonArray(refreshedDraft.attached_files),
                linkedRecords: parseJsonArray(refreshedDraft.linked_records),
                linkedGeographyFiles: parseJsonArray(
                  refreshedDraft.linked_geography_files
                ),
                author: refreshedDraft.author,
                created_by: refreshedDraft.created_by,
                created_at: normalizeDateString(refreshedDraft.created_at),
                updated_at: normalizeDateString(refreshedDraft.updated_at),
                last_draft_saved_at: normalizeDateString(
                  refreshedDraft.last_draft_saved_at
                ),
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
          metadata: parseJsonObject(draft.metadata),
          geography: parseGeography(draft.geography),
          attachedFiles: parseJsonArray(draft.attached_files),
          linkedRecords: parseJsonArray(draft.linked_records),
          linkedGeographyFiles: parseJsonArray(draft.linked_geography_files),
          author: draft.author,
          created_by: draft.created_by,
          created_at: normalizeDateString(draft.created_at),
          updated_at: normalizeDateString(draft.updated_at),
          last_draft_saved_at: normalizeDateString(draft.last_draft_saved_at),
          isDraft: true,
        };
      }
    }

    const record = (await this.deps.getRecord(id)) as
      | (DraftOrRecord & { workflowState?: string; content?: string })
      | null;
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
    user: AuthUser,
    targetStatus?: string
  ): Promise<{
    id: string;
    title: string;
    type: string;
    status: string;
    workflowState?: string | null;
    content?: string;
    metadata: Record<string, unknown>;
    authors?: RecordData['authors'];
    source?: RecordData['source'];
    geography?: Geography;
    attachedFiles: RecordData['attachedFiles'];
    linkedRecords: RecordData['linkedRecords'];
    linkedGeographyFiles: RecordData['linkedGeographyFiles'];
    path?: string;
    created_at: string | null | undefined;
    updated_at: string | null | undefined;
    author?: string;
    commit_ref?: string;
    commit_signature?: string;
  }> {
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

    // FA-API-008: publishing sets the record's LEGAL status. `records:edit` is
    // authority to publish (draft → published), not to place the record at an
    // arbitrary WORKFLOW-controlled status — otherwise a clerk could
    // draft-then-publish straight to 'approved'/'archived', skipping the
    // review chain. Publishing to a controlled status must be a valid
    // transition from the record's current status (or the initial status for a
    // first publish) for this role; 'published' itself is not a controlled
    // target and stays governed by the publish permission above.
    if (typeof targetStatus === 'string') {
      const controlled = await this.deps.workflowManager.getControlledStatuses();
      if (controlled.has(targetStatus)) {
        const statuses = await this.deps.workflowManager.getAvailableStatuses(
          draft.type
        );
        const initialStatus = statuses[0];
        const published = (await this.deps
          .getRecord(id)
          .catch(() => null)) as { status?: string } | null;
        const fromStatus = published?.status || initialStatus;
        if (fromStatus && targetStatus !== fromStatus) {
          const check = await this.deps.workflowManager.validateTransition(
            fromStatus,
            targetStatus,
            user.role
          );
          if (!check.valid) {
            throw new HttpError(
              403,
              check.reason ||
                `Cannot publish to status '${targetStatus}' from '${fromStatus}' (role '${user.role}')`,
              'INVALID_STATUS_TRANSITION'
            );
          }
        }
      }
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
