export type RecordSortOption =
  | 'relevance'
  | 'updated_desc'
  | 'created_desc'
  | 'title_asc'
  | 'title_desc';

export interface RecordQueryState {
  search?: string;
  types?: string[];
  statuses?: string[];
  page?: number;
  sort?: RecordSortOption;
}

/**
 * Build a plain object suitable for use as route query params from state
 */
export function buildQueryFromState(
  state: RecordQueryState
): Record<string, string> {
  const query: Record<string, string> = {};

  if (state.search && state.search.trim()) query.search = state.search.trim();
  if (state.types && state.types.length > 0)
    query.types = state.types.join(',');
  if (state.statuses && state.statuses.length > 0)
    query.statuses = state.statuses.join(',');
  if (state.page && state.page > 1) query.page = String(state.page);
  if (state.sort && state.sort !== 'relevance') query.sort = state.sort;

  return query;
}

/**
 * Parse a route's query params into state
 */
export function parseQueryToState(route: {
  query: Record<string, any>;
}): RecordQueryState {
  const result: RecordQueryState = {};
  const q = route?.query || {};

  if (q.search && typeof q.search === 'string') result.search = q.search;
  if (q.types && typeof q.types === 'string') result.types = q.types.split(',');
  if (q.statuses && typeof q.statuses === 'string')
    result.statuses = q.statuses.split(',');
  if (q.page) {
    const parsed = Number(q.page);
    if (!Number.isNaN(parsed) && parsed > 0) result.page = parsed;
  }
  if (q.sort && typeof q.sort === 'string')
    result.sort = q.sort as RecordSortOption;

  return result;
}
