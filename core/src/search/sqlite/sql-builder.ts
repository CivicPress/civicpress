/**
 * SQLite search SQL builder — extracted from sqlite-search-service.ts in
 * Phase 2d W2-T3. Builds the main search SELECT (with BM25 + composite
 * relevance scoring), the ORDER BY clause, the row→SearchResult mapping,
 * and the title-normalization helper.
 *
 * Pure functions; no class state.
 */

import type { SearchResult } from '../search-service.js';
import type { parseSearchQuery } from '../query-parser.js';

/**
 * Build the ORDER BY clause for a search query, with record-kind priority
 * (root > chapter > leaf) used as a tiebreaker.
 */
export function buildSearchOrderBy(sort: string = 'relevance'): string {
  const kindPriority = `CASE
    WHEN json_extract(si.metadata, '$.kind') = 'root' THEN 3
    WHEN json_extract(si.metadata, '$.kind') = 'chapter' THEN 2
    ELSE 1
  END`;

  if (sort === 'relevance') {
    return `ORDER BY composite_relevance_score DESC, ${kindPriority} ASC, si.updated_at DESC`;
  }

  let userSort = '';
  switch (sort) {
    case 'updated_desc':
      userSort = 'si.updated_at DESC, r.created_at DESC';
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
      return `ORDER BY composite_relevance_score DESC, ${kindPriority} ASC, si.updated_at DESC`;
  }
  return `ORDER BY ${kindPriority} ASC, ${userSort}`;
}

export interface BuildSearchSQLOptions {
  type?: string;
  status?: string;
  limit: number;
  offset: number;
  sort?: string;
  parsedQuery?: ReturnType<typeof parseSearchQuery>;
  titleBoostTerm?: string;
}

export type SqlParam = string | number | boolean | null | Buffer;

export interface BuiltSearchSQL {
  query: string;
  params: SqlParam[];
  countQuery: string;
  countParams: SqlParam[];
}

/**
 * Build the main search SQL with BM25 + composite relevance scoring,
 * recency boost, type+status priority, and the snippet excerpt.
 */
export function buildSearchSQL(
  ftsQuery: string,
  options: BuildSearchSQLOptions
): BuiltSearchSQL {
  const { type, status, limit, offset, sort = 'relevance' } = options;

  const params: SqlParam[] = [ftsQuery];
  const countParams: SqlParam[] = [ftsQuery];

  let whereClause = `
    search_index_fts5 MATCH ?
    AND (r.workflow_state IS NULL OR r.workflow_state != ?)
  `;
  params.push('internal_only');
  countParams.push('internal_only');

  if (type) {
    const typeFilters = type.split(',').map((t) => t.trim());
    if (typeFilters.length === 1) {
      whereClause += ' AND si.record_type = ?';
      params.push(typeFilters[0]);
      countParams.push(typeFilters[0]);
    } else {
      const placeholders = typeFilters.map(() => '?').join(',');
      whereClause += ` AND si.record_type IN (${placeholders})`;
      params.push(...typeFilters);
      countParams.push(...typeFilters);
    }
  }

  if (status) {
    whereClause += ' AND r.status = ?';
    params.push(status);
    countParams.push(status);
  }

  const query = `
    SELECT
      si.record_id as id,
      si.record_id,
      si.record_type,
      si.title,
      si.content,
      si.tags,
      si.metadata,
      r.status,
      r.created_at,
      r.updated_at,

      bm25(search_index_fts5) as relevance_score,
      0 as field_match_score,

      CASE
        WHEN julianday('now') - julianday(si.updated_at) < 365 THEN
          1.0 - (julianday('now') - julianday(si.updated_at)) / 365.0
        ELSE 0.0
      END as recency_score,

      CASE si.record_type
        WHEN 'bylaw' THEN 10
        WHEN 'article' THEN 8
        WHEN 'chapter' THEN 6
        ELSE 5
      END as type_priority_score,

      CASE COALESCE(r.status, 'published')
        WHEN 'published' THEN 10
        WHEN 'approved' THEN 9
        WHEN 'draft' THEN 5
        WHEN 'archived' THEN 1
        ELSE 5
      END as status_priority_score,

      snippet(
        search_index_fts5,
        2,
        '<mark>',
        '</mark>',
        '...',
        32
      ) as excerpt,

      CASE
        WHEN json_extract(si.metadata, '$.kind') = 'root' THEN 3
        WHEN json_extract(si.metadata, '$.kind') = 'chapter' THEN 2
        ELSE 1
      END as kind_priority,

      (
        bm25(search_index_fts5) * 0.80 +
        CASE
          WHEN julianday('now') - julianday(si.updated_at) < 365 THEN
            (1.0 - (julianday('now') - julianday(si.updated_at)) / 365.0)
          ELSE 0.0
        END * 0.10 +
        CASE si.record_type
          WHEN 'bylaw' THEN 10
          WHEN 'article' THEN 8
          WHEN 'chapter' THEN 6
          ELSE 5
        END * 0.05 +
        CASE COALESCE(r.status, 'published')
          WHEN 'published' THEN 10
          WHEN 'approved' THEN 9
          WHEN 'draft' THEN 5
          WHEN 'archived' THEN 1
          ELSE 5
        END * 0.05
      ) as composite_relevance_score

    FROM search_index_fts5
    INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
    INNER JOIN records r ON si.record_id = r.id
    WHERE ${whereClause}
    ${buildSearchOrderBy(sort)}
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const countQuery = `
    SELECT COUNT(*) as count
    FROM search_index_fts5
    INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
    INNER JOIN records r ON si.record_id = r.id
    WHERE ${whereClause}
  `;

  return { query, params, countQuery, countParams };
}

export type SearchRow = Record<string, unknown>;

/**
 * Map a database row from the search query to a SearchResult.
 */
export function mapRowToSearchResult(row: SearchRow): SearchResult {
  let metadata: Record<string, unknown> | undefined;
  if (typeof row.metadata === 'string' && row.metadata) {
    try {
      const parsed = JSON.parse(row.metadata) as unknown;
      metadata =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : undefined;
    } catch {
      metadata = undefined;
    }
  } else if (
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
  ) {
    metadata = row.metadata as Record<string, unknown>;
  }

  return {
    id: (row.id ?? row.record_id) as string,
    record_id: row.record_id as string,
    record_type: row.record_type as string,
    title: row.title as string,
    content: row.content as string,
    tags: row.tags as string,
    metadata,
    status: row.status as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    relevance_score: (row.relevance_score as number) || 0,
    field_match_score: (row.field_match_score as number) || 0,
    recency_score: (row.recency_score as number) || 0,
    type_priority_score: (row.type_priority_score as number) || 0,
    status_priority_score: (row.status_priority_score as number) || 0,
    excerpt: row.excerpt as string,
  };
}

/**
 * Normalize text for accent-insensitive search: lowercase + decompose
 * accented characters + strip combining diacritics.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD') // decompose accented characters
    .replace(/[̀-ͯ]/g, ''); // strip combining diacritics
}
