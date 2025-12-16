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
  pageSize?: number;
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
  if (state.pageSize && state.pageSize !== 50)
    query.pageSize = String(state.pageSize);
  // Only include sort if it's not the default for the context
  // (relevance is default for search, created_desc for records)
  if (state.sort) {
    // For records listing, default is created_desc, so include if different
    // For search, default is relevance, so include if different
    if (state.search) {
      // Search context - include if not relevance
      if (state.sort !== 'relevance') query.sort = state.sort;
    } else {
      // Records context - include if not created_desc
      if (state.sort !== 'created_desc') query.sort = state.sort;
    }
  }

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
  if (q.pageSize) {
    const parsed = Number(q.pageSize);
    if (!Number.isNaN(parsed) && parsed > 0) result.pageSize = parsed;
  }
  if (q.sort && typeof q.sort === 'string') {
    const validSorts: RecordSortOption[] = [
      'relevance',
      'updated_desc',
      'created_desc',
      'title_asc',
      'title_desc',
    ];
    if (validSorts.includes(q.sort as RecordSortOption)) {
      result.sort = q.sort as RecordSortOption;
    }
  }

  return result;
}
