/**
 * Record Store — owns CRUD for `records` plus the search-index glue
 * (`indexRecord` / `searchRecords` / `removeRecordFromIndex`).
 *
 * Extracted from `database-service.ts` as part of Phase 2d W2-T5
 * decomposition. Method bodies are moved verbatim; only the receiver
 * changes (the store owns adapter + optional search-service refs).
 * The orchestrator delegates one-liners to this store so external
 * consumers see no signature change.
 */

import { DatabaseAdapter, SqlParam } from '../database-adapter.js';
import { Logger } from '../../utils/logger.js';
import { SearchService } from '../../search/search-service.js';
import type {
  RecordRow,
  CountRow,
  SearchIndexRow,
} from '../types/row-types.js';

export class RecordStore {
  private adapter: DatabaseAdapter;
  private searchService?: SearchService;
  private logger: Logger;

  constructor(
    adapter: DatabaseAdapter,
    searchService?: SearchService,
    logger?: Logger
  ) {
    this.adapter = adapter;
    this.searchService = searchService;
    this.logger = logger || new Logger();
  }

  // Search index management
  async indexRecord(recordData: {
    recordId: string;
    recordType: string;
    title: string;
    content?: string;
    tags?: string;
    metadata?: string;
  }): Promise<void> {
    // Use search service if available (handles FTS indexing)
    if (this.searchService) {
      try {
        let metadata: Record<string, unknown> | null = null;
        if (recordData.metadata) {
          try {
            metadata = JSON.parse(recordData.metadata) as Record<
              string,
              unknown
            >;
          } catch {
            metadata = null;
          }
        }

        await this.searchService.indexRecord({
          recordId: recordData.recordId,
          recordType: recordData.recordType,
          title: recordData.title,
          content: recordData.content,
          tags: recordData.tags,
          metadata: metadata ?? undefined,
        });
        return;
      } catch (error) {
        // Fall back to old method if search service fails
        this.logger.warn(
          'Search service indexing failed, falling back to basic indexing',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    // Fallback: Basic indexing (no FTS)
    // Delete existing index entry if it exists
    await this.adapter.execute(
      'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
      [recordData.recordId, recordData.recordType]
    );

    // Insert new index entry
    await this.adapter.execute(
      'INSERT INTO search_index (record_id, record_type, title, content, tags, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [
        recordData.recordId,
        recordData.recordType,
        recordData.title,
        recordData.content,
        recordData.tags,
        recordData.metadata,
      ]
    );
  }

  async searchRecords(
    query: string,
    options?: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
      sort?: string;
    }
  ): Promise<Array<{ record_id: string }>> {
    // Use search service if available (FTS search)
    if (this.searchService) {
      try {
        const result = await this.searchService.search(query, {
          type: options?.type,
          status: options?.status,
          limit: options?.limit || 20,
          offset: options?.offset || 0,
          sort: options?.sort,
        });
        return result.results;
      } catch (error) {
        // Fall back to old method if search service fails
        this.logger.warn('Search service failed, falling back to LIKE search', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback: Old LIKE-based search
    const recordType = options?.type;
    let sql = `
      SELECT si.* FROM search_index si
      INNER JOIN records r ON si.record_id = r.id
      WHERE (si.title LIKE ? OR si.content LIKE ? OR si.tags LIKE ?)
      AND (r.workflow_state IS NULL OR r.workflow_state != ?)
    `;
    const params: SqlParam[] = [
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
      'internal_only',
    ];

    if (recordType) {
      const typeFilters = recordType.split(',').map((t) => t.trim());
      if (typeFilters.length === 1) {
        sql += ' AND si.record_type = ?';
        params.push(typeFilters[0]);
      } else {
        const placeholders = typeFilters.map(() => '?').join(',');
        sql += ` AND si.record_type IN (${placeholders})`;
        params.push(...typeFilters);
      }
    }

    if (options?.status) {
      sql += ' AND r.status = ?';
      params.push(options.status);
    }

    // Apply ordering with kind priority and user sort
    const sortOption = options?.sort || 'updated_desc';
    const kindPriority = `CASE
      WHEN json_extract(r.metadata, '$.kind') = 'root' THEN 3
      WHEN json_extract(r.metadata, '$.kind') = 'chapter' THEN 2
      ELSE 1
    END`;
    let userSort = '';
    switch (sortOption) {
      case 'updated_desc':
        userSort = 'si.updated_at DESC';
        break;
      case 'created_desc':
        userSort = 'r.created_at DESC';
        break;
      case 'title_asc':
        userSort = 'LOWER(si.title) ASC, r.created_at DESC';
        break;
      case 'title_desc':
        userSort = 'LOWER(si.title) DESC, r.created_at DESC';
        break;
      default:
        userSort = 'si.updated_at DESC';
    }
    sql += ` ORDER BY ${kindPriority} ASC, ${userSort}`;

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    return await this.adapter.query<SearchIndexRow>(sql, params);
  }

  async removeRecordFromIndex(
    recordId: string,
    recordType: string
  ): Promise<void> {
    // Remove from search service if available (clears FTS5 and cache)
    if (this.searchService) {
      await this.searchService.removeRecord(recordId, recordType);
    }

    // Also remove from search_index table directly (for fallback searches)
    await this.adapter.execute(
      'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
      [recordId, recordType]
    );
  }

  // Record management
  async createRecord(recordData: {
    id: string;
    title: string;
    type: string;
    status?: string;
    workflow_state?: string;
    content?: string;
    metadata?: string;
    geography?: string;
    attached_files?: string;
    linked_records?: string;
    linked_geography_files?: string;
    path?: string;
    author: string;
  }): Promise<void> {
    await this.adapter.execute(
      'INSERT INTO records (id, title, type, status, workflow_state, content, metadata, geography, attached_files, linked_records, linked_geography_files, path, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        recordData.id,
        recordData.title,
        recordData.type,
        recordData.status || 'draft',
        recordData.workflow_state !== undefined
          ? recordData.workflow_state
          : 'draft',
        recordData.content,
        recordData.metadata,
        recordData.geography,
        recordData.attached_files,
        recordData.linked_records,
        recordData.linked_geography_files,
        recordData.path,
        recordData.author,
      ]
    );

    // Extract tags from metadata for indexing
    let tags = '';
    if (recordData.metadata) {
      try {
        const metadata = JSON.parse(recordData.metadata);
        if (metadata.tags) {
          // Handle both array and string formats
          tags = Array.isArray(metadata.tags)
            ? metadata.tags.join(',')
            : typeof metadata.tags === 'string'
              ? metadata.tags
              : '';
        }
      } catch {
        // If metadata parsing fails, tags remain empty
      }
    }

    // Index the record for search
    await this.indexRecord({
      recordId: recordData.id,
      recordType: recordData.type,
      title: recordData.title,
      content: recordData.content,
      tags,
      metadata: recordData.metadata,
    });
  }

  async getRecord(id: string): Promise<RecordRow | null> {
    const rows = await this.adapter.query<RecordRow>(
      'SELECT *, attached_files FROM records WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async updateRecord(
    id: string,
    updates: {
      title?: string;
      status?: string;
      workflow_state?: string;
      content?: string;
      metadata?: string;
      // `null` writes SQL NULL — saga compensation uses it to reset fields
      // that did not exist before a failed update (FA-CORE-009).
      geography?: string | null;
      attached_files?: string | null;
      linked_records?: string | null;
      linked_geography_files?: string | null;
      path?: string;
    }
  ): Promise<void> {
    const fields: string[] = [];
    const values: SqlParam[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.workflow_state !== undefined) {
      fields.push('workflow_state = ?');
      values.push(updates.workflow_state);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
    }
    if (updates.path !== undefined) {
      fields.push('path = ?');
      values.push(updates.path);
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

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await this.adapter.execute(
      `UPDATE records SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Update search index
    const record = await this.getRecord(id);
    if (record) {
      // Extract tags from metadata for indexing
      let tags = '';
      if (record.metadata) {
        try {
          const metadata =
            typeof record.metadata === 'string'
              ? JSON.parse(record.metadata)
              : record.metadata;
          if (metadata.tags) {
            // Handle both array and string formats
            tags = Array.isArray(metadata.tags)
              ? metadata.tags.join(',')
              : typeof metadata.tags === 'string'
                ? metadata.tags
                : '';
          }
        } catch {
          // If metadata parsing fails, tags remain empty
        }
      }

      await this.indexRecord({
        recordId: record.id,
        recordType: record.type,
        title: record.title,
        content: record.content,
        tags,
        metadata:
          typeof record.metadata === 'string'
            ? record.metadata
            : JSON.stringify(record.metadata || {}),
      });
    }
  }

  async deleteRecord(id: string): Promise<void> {
    // record_locks intentionally has no FK/cascade (locks are taken on
    // drafts too, which have no records row) — clean up explicitly.
    await this.adapter.execute(
      'DELETE FROM record_locks WHERE record_id = ?',
      [id]
    );
    await this.adapter.execute('DELETE FROM records WHERE id = ?', [id]);
    await this.removeRecordFromIndex(id, '');
  }

  /**
   * List records with optional filtering
   */
  /**
   * Build ORDER BY clause with kind priority and user sort
   */
  private buildOrderByClause(sort: string = 'created_desc'): string {
    // Kind priority calculation (record=1, chapter=2, root=3)
    const kindPriority = `CASE
      WHEN json_extract(metadata, '$.kind') = 'root' THEN 3
      WHEN json_extract(metadata, '$.kind') = 'chapter' THEN 2
      ELSE 1
    END`;

    // User sort clause
    let userSort = '';
    switch (sort) {
      case 'updated_desc':
        userSort = 'updated_at DESC, created_at DESC';
        break;
      case 'created_desc':
        userSort = 'created_at DESC';
        break;
      case 'title_asc':
        userSort = 'LOWER(title) ASC, created_at DESC';
        break;
      case 'title_desc':
        userSort = 'LOWER(title) DESC, created_at DESC';
        break;
      default:
        userSort = 'created_at DESC';
    }

    return `ORDER BY ${kindPriority} ASC, ${userSort}`;
  }

  async listRecords(
    options: {
      type?: string;
      status?: string; // Deprecated: All records in this table are published by definition
      limit?: number;
      offset?: number;
      sort?: string;
      /**
       * Keep only records that link the given geography file id. Exists so the
       * geography `/linked-records` endpoint can filter + count + page in ONE
       * query instead of scanning the whole corpus in 1000-row batches and
       * matching `linkedGeographyFiles` in JS.
       */
      linkedGeographyId?: string;
    } = {}
  ): Promise<{ records: RecordRow[]; total: number }> {
    let sql = 'SELECT * FROM records WHERE 1=1';
    const params: SqlParam[] = [];

    // Defensive: Filter out internal_only records (shouldn't be in records table, but just in case)
    sql += ' AND (workflow_state IS NULL OR workflow_state != ?)';
    params.push('internal_only');

    // Apply type filter (handle comma-separated values)
    if (options.type) {
      const typeFilters = options.type.split(',').map((t) => t.trim());
      if (typeFilters.length === 1) {
        sql += ' AND type = ?';
        params.push(typeFilters[0]);
      } else {
        const placeholders = typeFilters.map(() => '?').join(',');
        sql += ` AND type IN (${placeholders})`;
        params.push(...typeFilters);
      }
    }

    // Status filter is deprecated - all records in records table are published by definition
    // Keeping for backward compatibility, but it's ignored for published endpoints
    if (options.status) {
      const statusFilters = options.status.split(',').map((s) => s.trim());
      if (statusFilters.length === 1) {
        sql += ' AND status = ?';
        params.push(statusFilters[0]);
      } else {
        const placeholders = statusFilters.map(() => '?').join(',');
        sql += ` AND status IN (${placeholders})`;
        params.push(...statusFilters);
      }
    }

    // Linked-geography filter.
    //
    // `linked_geography_files` holds a JSON array of `{id,name,description}`,
    // so the match has to look INSIDE the document — hence json_each + a
    // json_extract on each element's `$.id`. Matching on the element id (not a
    // LIKE over the raw text) is what makes it exact: a `LIKE '%geo-1%'` would
    // also match `geo-10`, and LIKE's `_` wildcard would make an id containing
    // an underscore match unrelated rows.
    //
    // The two guards are load-bearing, not defensive noise: `json_each()`
    // raises "malformed JSON" and aborts the whole query on any row whose
    // column is not valid JSON, so one bad row would 500 the endpoint for
    // everyone. `json_valid()` (plus the NULL check, since most records link no
    // geography at all) skips those rows the same way the previous JS
    // `parseJsonArray` did.
    if (options.linkedGeographyId) {
      sql +=
        ' AND linked_geography_files IS NOT NULL' +
        ' AND json_valid(linked_geography_files)' +
        ' AND EXISTS (SELECT 1 FROM json_each(records.linked_geography_files)' +
        " WHERE json_extract(json_each.value, '$.id') = ?)";
      params.push(options.linkedGeographyId);
    }

    // Get total count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await this.adapter.query<CountRow>(countSql, params);
    const total = countResult[0].count;

    // Apply ordering and pagination (with kind priority and user sort)
    const sortOption = options.sort || 'created_desc';
    sql += ' ' + this.buildOrderByClause(sortOption);

    // Always apply limit (default to 10 if not provided)
    const limit = options.limit || 10;
    sql += ' LIMIT ?';
    params.push(limit);

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const records = await this.adapter.query<RecordRow>(sql, params);

    return {
      records,
      total,
    };
  }
}
