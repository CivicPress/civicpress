/**
 * Pure helper functions shared across RecordsService collaborators.
 *
 * Phase 2d W2-T8: extracted verbatim from the prior monolithic
 * `records-service.ts`. No behavior change; bodies match the original.
 */

/**
 * Normalize date string from database format to ISO format with UTC indicator.
 * Converts "YYYY-MM-DD HH:MM:SS" (SQLite format, UTC but no timezone) to
 * "YYYY-MM-DDTHH:MM:SSZ".
 */
export function normalizeDateString(
  dateStr: string | null | undefined
): string | null | undefined {
  if (!dateStr) return dateStr;

  // If already has timezone indicator (Z or +/- offset), return as is (already normalized)
  if (dateStr.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // If has 'T' separator but no timezone, add 'Z' (assume UTC)
  if (dateStr.includes('T')) {
    return dateStr + 'Z';
  }

  // Convert SQLite format "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ"
  // This assumes dates from database are in UTC (which SQLite CURRENT_TIMESTAMP returns)
  return dateStr.replace(' ', 'T') + 'Z';
}

/**
 * Helper function to get kind priority for sorting.
 * Priority: record (no kind) = 1, chapter = 2, root = 3.
 * Lower priority number = appears first in list.
 */
export function getKindPriority(record: any): number {
  // Check both direct and nested metadata paths
  // Some records have kind at metadata.kind, others at metadata.metadata.kind
  const kind = record.metadata?.kind || record.metadata?.metadata?.kind;
  if (kind === 'root') return 3; // Root documents last
  if (kind === 'chapter') return 2; // Chapters in middle
  return 1; // Regular records first
}

/**
 * Build a SQL WHERE clause + bound params for record list/summary filters.
 *
 * Defensively excludes `internal_only` workflow_state rows that shouldn't be
 * in the records table; preserves backwards-compatible (deprecated) `status`
 * filtering.
 */
export function buildFilterClause(
  filters: { type?: string; status?: string } = {}
): { whereClause: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  // Defensive: Filter out internal_only records (shouldn't be in records table, but just in case)
  clauses.push('(workflow_state IS NULL OR workflow_state != ?)');
  params.push('internal_only');

  if (filters.type) {
    const types = filters.type
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (types.length === 1) {
      clauses.push('type = ?');
      params.push(types[0]);
    } else if (types.length > 1) {
      clauses.push(`type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
  }

  // Status filter is deprecated - all records in records table are published by definition
  // Keeping for backward compatibility, but it's ignored for published endpoints
  if (filters.status) {
    const statuses = filters.status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length === 1) {
      clauses.push('status = ?');
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      clauses.push(`status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return { whereClause, params };
}
