/**
 * Database schema checks — extracted from database-checker.ts in
 * Phase 2d W2-T2. Covers required tables, required columns, indexes,
 * and FTS5 (table + triggers).
 *
 * Stateless functions; take databaseService as their only dependency.
 */

import type { DatabaseService } from '../../../database/database-service.js';
import type { CheckResult } from '../../types.js';
import { pass, warning, error } from './result-builders.js';

const REQUIRED_TABLES = [
  'users',
  'api_keys',
  'sessions',
  'search_index',
  'records',
  'record_drafts',
];

const REQUIRED_SEARCH_INDEX_COLUMNS = [
  'record_id',
  'record_type',
  'title',
  'title_normalized',
];

const IMPORTANT_INDEXES = [
  'idx_records_updated_at',
  'idx_records_created_at',
  'idx_records_title',
  'idx_search_index_updated_at',
  'idx_search_index_title',
];

const REQUIRED_FTS5_TRIGGERS = [
  'search_index_fts5_insert',
  'search_index_fts5_update',
  'search_index_fts5_delete',
];

/**
 * Verify all required tables exist; then drill into column check.
 */
export async function checkSchema(
  databaseService: DatabaseService
): Promise<CheckResult> {
  try {
    const existingTables = await databaseService.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const tableNames = existingTables.map((t: any) => t.name);

    const missingTables = REQUIRED_TABLES.filter((t) => !tableNames.includes(t));
    const extraTables = tableNames.filter(
      (t: string) =>
        !REQUIRED_TABLES.includes(t) && !t.startsWith('search_index_fts5')
    );

    if (missingTables.length > 0) {
      return error('Missing required tables', undefined, {
        missing: missingTables,
        existing: tableNames,
      });
    }

    if (extraTables.length > 0) {
      // Informational only — don't flag as an issue.
      return pass('Schema validation passed', {
        extra: extraTables,
        note: 'Extra tables found (informational only)',
      });
    }

    const columnCheck = await checkTableColumns(databaseService);
    if (columnCheck.status !== 'pass') {
      return columnCheck;
    }

    return pass('Schema validation passed', { tables: tableNames.length });
  } catch (err: any) {
    return error('Failed to check schema', err);
  }
}

/**
 * Verify required columns in the search_index table.
 */
export async function checkTableColumns(
  databaseService: DatabaseService
): Promise<CheckResult> {
  try {
    const searchIndexInfo = await databaseService.query(
      'PRAGMA table_info(search_index)'
    );
    const searchIndexColumns = searchIndexInfo.map((c: any) => c.name);

    const missingColumns = REQUIRED_SEARCH_INDEX_COLUMNS.filter(
      (c) => !searchIndexColumns.includes(c)
    );

    if (missingColumns.length > 0) {
      return warning('Missing columns in search_index', {
        missing: missingColumns,
        table: 'search_index',
      });
    }

    return pass('Table columns validated');
  } catch (err: any) {
    return error('Failed to check table columns', err);
  }
}

/**
 * Verify important indexes are present (loose substring match).
 */
export async function checkIndexes(
  databaseService: DatabaseService
): Promise<CheckResult> {
  try {
    const indexes = await databaseService.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    );
    const indexNames = indexes.map((i: any) => i.name);

    const missingIndexes = IMPORTANT_INDEXES.filter(
      (idx) =>
        !indexNames.some((name: string) =>
          name.includes(idx.split('_').slice(1).join('_'))
        )
    );

    if (missingIndexes.length > 0) {
      return warning('Some indexes are missing', {
        missing: missingIndexes,
        existing: indexNames,
      });
    }

    return pass('Index validation passed', { indexes: indexNames.length });
  } catch (err: any) {
    return error('Failed to check indexes', err);
  }
}

/**
 * Verify FTS5 virtual table + required triggers.
 */
export async function checkFTS5(
  databaseService: DatabaseService
): Promise<CheckResult> {
  try {
    const fts5Tables = await databaseService.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='search_index_fts5'"
    );

    if (fts5Tables.length === 0) {
      return error('FTS5 table does not exist', undefined, {
        table: 'search_index_fts5',
      });
    }

    try {
      await databaseService.query('SELECT * FROM search_index_fts5 LIMIT 1');
    } catch (err: any) {
      if (err.message?.includes('no such table')) {
        return error('FTS5 table exists but is not accessible', err);
      }
      // Other errors (e.g. empty-table edge case) are OK.
    }

    const triggers = await databaseService.query(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_index_fts5_%'"
    );
    const triggerNames = triggers.map((t: any) => t.name);

    const missingTriggers = REQUIRED_FTS5_TRIGGERS.filter(
      (t) => !triggerNames.includes(t)
    );

    if (missingTriggers.length > 0) {
      return error('FTS5 triggers are missing', undefined, {
        missing: missingTriggers,
        existing: triggerNames,
      });
    }

    return pass('FTS5 table and triggers validated', {
      triggers: triggerNames.length,
    });
  } catch (err: any) {
    return error('Failed to check FTS5', err);
  }
}
