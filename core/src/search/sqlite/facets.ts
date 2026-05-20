/**
 * SQLite search facets — extracted from sqlite-search-service.ts in
 * Phase 2d W2-T3. Returns aggregated type+status counts for a query,
 * respecting the same workflow-state filter as the main search.
 */

import type { DatabaseAdapter } from '../../database/database-adapter.js';
import type {
  SearchOptions,
  SearchFacets,
} from '../search-service.js';
import { parseSearchQuery, buildFTS5Query } from '../query-parser.js';

export async function getFacets(
  adapter: DatabaseAdapter,
  query: string,
  options: Omit<SearchOptions, 'limit' | 'offset'> = {}
): Promise<SearchFacets> {
  const parsedQuery = parseSearchQuery(query);
  const ftsQuery = buildFTS5Query(parsedQuery);

  if (!ftsQuery) {
    return { types: [], statuses: [] };
  }

  const { type, status } = options;
  const params: any[] = [ftsQuery, 'internal_only'];

  let baseWhereClause = `
    search_index_fts5 MATCH ?
    AND (r.workflow_state IS NULL OR r.workflow_state != ?)
  `;

  if (type) {
    const typeFilters = type.split(',').map((t) => t.trim());
    if (typeFilters.length === 1) {
      baseWhereClause += ' AND si.record_type = ?';
      params.push(typeFilters[0]);
    } else {
      const placeholders = typeFilters.map(() => '?').join(',');
      baseWhereClause += ` AND si.record_type IN (${placeholders})`;
      params.push(...typeFilters);
    }
  }

  if (status) {
    baseWhereClause += ' AND r.status = ?';
    params.push(status);
  }

  const typeQuery = `
    SELECT
      si.record_type as value,
      COUNT(*) as count
    FROM search_index_fts5
    INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
    INNER JOIN records r ON si.record_id = r.id
    WHERE ${baseWhereClause}
    GROUP BY si.record_type
    ORDER BY count DESC, si.record_type
  `;

  const typeResults = await adapter.query(typeQuery, params);

  const statusQuery = `
    SELECT
      COALESCE(r.status, 'published') as value,
      COUNT(*) as count
    FROM search_index_fts5
    INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
    INNER JOIN records r ON si.record_id = r.id
    WHERE ${baseWhereClause}
    GROUP BY r.status
    ORDER BY count DESC, r.status
  `;

  const statusResults = await adapter.query(statusQuery, params);

  return {
    types: typeResults.map((row: any) => ({
      value: row.value,
      count: parseInt(row.count, 10),
    })),
    statuses: statusResults.map((row: any) => ({
      value: row.value,
      count: parseInt(row.count, 10),
    })),
  };
}
