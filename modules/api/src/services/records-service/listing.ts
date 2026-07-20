import {
  CivicPress,
  UpdateRecordRequest,
  WorkflowConfigManager,
  RecordManager,
  userCan,
  DatabaseService,
  Logger,
} from '@civicpress/core';
import type { AuthUser, RecordRow } from '@civicpress/core';
import { normalizeDateString, buildFilterClause } from './helpers.js';

/**
 * Shape returned by `recordManager.listRecords` / `searchRecords` —
 * mostly `RecordRow` but a few transformed fields the API layer expects.
 */
type ListedRecord = RecordRow & {
  workflowState?: string;
  commit_ref?: string;
  commit_signature?: string;
};

/**
 * Coerce a metadata column (JSON-string from SQLite or an already-parsed
 * object from upstream) into a plain `Record<string, unknown>`. Returns
 * `{}` on parse failure rather than throwing — the api response should
 * surface gracefully even if a row's metadata is malformed.
 */
function parseMetadata(
  value: string | Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Transformed record shape returned by API endpoints. */
interface ApiRecord {
  id: string;
  title: string;
  type: string;
  status?: string;
  workflowState?: string;
  content?: string;
  metadata: Record<string, unknown>;
  path?: string;
  created_at: string | null | undefined;
  updated_at: string | null | undefined;
  author?: string;
  commit_ref?: string;
  commit_signature?: string;
  hasUnpublishedChanges?: boolean;
  /** Tag used by read-handlers to distinguish draft envelopes returned by getDraftOrRecord. */
  isDraft?: boolean;
}

export interface RecordsListingDeps {
  civicPress: CivicPress;
  recordManager: RecordManager;
  workflowManager: WorkflowConfigManager;
  db: DatabaseService;
  logger: Logger;
}

/**
 * RecordsListing — owns list/search/summary endpoints and the workflow-aware
 * status mutation pair (`changeRecordStatus`, `getAllowedTransitions`).
 *
 * Bodies moved verbatim from the prior `RecordsService` monolith; only
 * `this.foo` references were rewritten to `this.deps.foo` (or to the
 * module-level `helpers.ts` exports for the pure helpers).
 */
export class RecordsListing {
  constructor(private readonly deps: RecordsListingDeps) {}

  /**
   * Change record status with workflow validation
   */
  async changeRecordStatus(
    id: string,
    newStatus: string,
    user: AuthUser,
    comment?: string
  ): Promise<{
    success: boolean;
    record?: {
      id: string;
      title: string;
      type: string;
      status: string;
      content?: string;
      metadata: Record<string, unknown>;
      path?: string;
      created: string;
      author?: string;
    };
    error?: string;
  }> {
    // Get the current record to validate permissions
    const record = await this.deps.recordManager.getRecord(id);
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
    const transitionValidation =
      await this.deps.workflowManager.validateTransition(
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
    const updatedRecord = await this.deps.recordManager.updateRecord(
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
  async getAllowedTransitions(id: string, user: AuthUser): Promise<string[]> {
    // Get the current record
    const record = await this.deps.recordManager.getRecord(id);
    if (!record) {
      return [];
    }

    // Compute transitions for the user's role
    const fromStatus = record.status;
    const role = user?.role;
    const allowed = await this.deps.workflowManager.getAvailableTransitions(
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
      page?: number;
      sort?: string;
      /**
       * Keep only records that link this geography file id. Pushed all the way
       * down to the SQL so `/geography/:id/linked-records` gets a filtered,
       * counted, LIMIT/OFFSET page instead of scanning the corpus in JS.
       */
      linkedGeographyId?: string;
    } = {},
    user?: AuthUser
  ): Promise<{
    records: ApiRecord[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
    pageSize: number;
    sort?: string;
  }> {
    const {
      type,
      status,
      limit = 50,
      page = 1,
      sort = 'created_desc',
      linkedGeographyId,
    } = options;

    // Calculate offset from page number (page is 1-based)
    const offset = (page - 1) * limit;

    // Get records from the record manager with pagination and sorting
    // Sort is now handled at database level with kind priority
    const result = await this.deps.recordManager.listRecords({
      type,
      status,
      limit: limit,
      offset: offset,
      sort: sort,
      linkedGeographyId,
    });

    // Records are already sorted by database (kind priority + user sort)
    const records = result.records;

    // Calculate total pages from total count
    const totalCount = result.total;
    const totalPages = Math.ceil(totalCount / limit);

    // Check if user has permission and if there are drafts for these records
    const draftIds = new Set<string>();
    // Only check drafts if user exists and has a non-empty role + username
    const hasValidUser = !!(
      user &&
      user.role &&
      user.role.length > 0 &&
      user.username &&
      user.username.length > 0 &&
      records.length > 0
    );

    if (hasValidUser && user) {
      try {
        const hasPermission = await userCan(user, 'records:edit', {
          action: 'edit',
        });

        if (hasPermission) {
          const recordIds = records.map((r) => r.id);

          if (recordIds.length > 0) {
            // Batch query to check which IDs have drafts (handle SQLite IN limit)
            const BATCH_SIZE = 999;
            for (let i = 0; i < recordIds.length; i += BATCH_SIZE) {
              const batch = recordIds.slice(i, i + BATCH_SIZE);
              const placeholders = batch.map(() => '?').join(',');
              const query = `SELECT id FROM record_drafts WHERE id IN (${placeholders})`;

              const rows = await this.deps.db.query<{ id: string }>(
                query,
                batch
              );
              rows.forEach((row) => draftIds.add(row.id));
            }
          }
        }
      } catch (error) {
        // If permission check fails, skip draft checking silently
        this.deps.logger.warn('Failed to check drafts for unpublished changes', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Transform records for API response
    const transformedRecords = records.map((record): ApiRecord => {
      const r = record as ListedRecord;
      const base: ApiRecord = {
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status, // Legal status (stored in YAML + DB)
        workflowState: r.workflowState, // Internal editorial status (DB-only)
        content: r.content,
        metadata: parseMetadata(r.metadata),
        path: r.path,
        created_at: normalizeDateString(r.created_at),
        updated_at: normalizeDateString(r.updated_at),
        author: r.author,
        commit_ref: r.commit_ref,
        commit_signature: r.commit_signature,
      };

      // Include hasUnpublishedChanges if user has edit permission (was checked)
      if (hasValidUser) {
        return {
          ...base,
          hasUnpublishedChanges: draftIds.has(r.id),
        };
      }

      return base;
    });

    return {
      records: transformedRecords,
      totalCount,
      currentPage: page,
      totalPages,
      pageSize: limit,
      sort: sort,
    };
  }

  /**
   * Search records with page-based pagination
   */
  async searchRecords(
    query: string,
    options: {
      type?: string;
      status?: string;
      limit?: number;
      page?: number;
      sort?: string;
    } = {},
    user?: AuthUser
  ): Promise<{
    records: ApiRecord[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
    pageSize: number;
    sort?: string;
  }> {
    const { type, status, limit = 50, page = 1, sort = 'relevance' } = options;

    // Calculate offset from page number (page is 1-based)
    const offset = (page - 1) * limit;

    // Get search results with proper pagination and sorting
    // Sort is now handled at database level with kind priority
    const result = await this.deps.recordManager.searchRecords(query, {
      type,
      status,
      limit: limit,
      offset: offset,
      sort: sort,
    });

    // Records are already sorted by database (kind priority + user sort)
    const records = result.records;

    // Calculate total pages from total count
    const totalCount = result.total;
    const totalPages = Math.ceil(totalCount / limit);

    // Check if user has permission and if there are drafts for these records
    const draftIds = new Set<string>();
    const hasValidUser = !!(
      user &&
      user.role &&
      user.role.length > 0 &&
      user.username &&
      user.username.length > 0 &&
      records.length > 0
    );

    if (hasValidUser && user) {
      try {
        const hasPermission = await userCan(user, 'records:edit', {
          action: 'edit',
        });

        if (hasPermission) {
          const recordIds = records.map((r) => r.id);

          if (recordIds.length > 0) {
            // Batch query to check which IDs have drafts (handle SQLite IN limit)
            const BATCH_SIZE = 999;
            for (let i = 0; i < recordIds.length; i += BATCH_SIZE) {
              const batch = recordIds.slice(i, i + BATCH_SIZE);
              const placeholders = batch.map(() => '?').join(',');
              const query = `SELECT id FROM record_drafts WHERE id IN (${placeholders})`;

              const rows = await this.deps.db.query<{ id: string }>(
                query,
                batch
              );
              rows.forEach((row) => draftIds.add(row.id));
            }
          }
        }
      } catch (error) {
        // If permission check fails, skip draft checking silently
        this.deps.logger.warn('Failed to check drafts for unpublished changes', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Transform records for API response
    const transformedRecords = records.map((record): ApiRecord => {
      const r = record as ListedRecord;
      const base: ApiRecord = {
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status,
        content: r.content,
        metadata: parseMetadata(r.metadata),
        path: r.path,
        created_at: normalizeDateString(r.created_at),
        updated_at: normalizeDateString(r.updated_at),
        author: r.author,
      };

      // Include hasUnpublishedChanges if user has edit permission (was checked)
      if (hasValidUser) {
        return {
          ...base,
          hasUnpublishedChanges: draftIds.has(r.id),
        };
      }

      return base;
    });

    return {
      records: transformedRecords,
      totalCount,
      currentPage: page,
      totalPages,
      pageSize: limit,
      sort: sort,
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
    const db = this.deps.civicPress.getDatabaseService();
    const { whereClause, params } = buildFilterClause(filters || {});

    const typeRows = await db.query<{ type?: string; count: number }>(
      `SELECT type, COUNT(*) as count FROM records ${whereClause} GROUP BY type`,
      [...params]
    );
    const statusRows = await db.query<{ status?: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM records ${whereClause} GROUP BY status`,
      [...params]
    );
    const totalRows = await db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM records ${whereClause}`,
      [...params]
    );

    const types: Record<string, number> = {};
    typeRows.forEach((row) => {
      if (row.type) {
        types[row.type] = Number(row.count) || 0;
      }
    });

    const statuses: Record<string, number> = {};
    statusRows.forEach((row) => {
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
