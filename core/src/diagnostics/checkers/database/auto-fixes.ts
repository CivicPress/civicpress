/**
 * Database auto-fix operations — extracted from database-checker.ts in
 * Phase 2d W2-T2. Covers FTS5 rebuild, fragmentation (VACUUM), index
 * recreation, and missing-column ALTER TABLE.
 *
 * Stateless functions; take databaseService + logger.
 */

import type { DatabaseService } from '../../../database/database-service.js';
import type { Logger } from '../../../utils/logger.js';

/**
 * Rebuild the FTS5 virtual table + its triggers (drops + recreates).
 */
export async function fixFTS5(
  databaseService: DatabaseService,
  logger: Logger
): Promise<void> {
  const adapter = databaseService.getAdapter();

  try {
    await adapter.execute('DROP TABLE IF EXISTS search_index_fts5');
    await adapter.execute('DROP TRIGGER IF EXISTS search_index_fts5_insert');
    await adapter.execute('DROP TRIGGER IF EXISTS search_index_fts5_update');
    await adapter.execute('DROP TRIGGER IF EXISTS search_index_fts5_delete');
  } catch (err: any) {
    logger.warn('Error dropping FTS5 table/triggers', { error: err.message });
  }

  await adapter.execute(`
    CREATE VIRTUAL TABLE search_index_fts5 USING fts5(
      record_id UNINDEXED,
      record_type UNINDEXED,
      title,
      content,
      tags,
      metadata UNINDEXED,
      content='search_index',
      content_rowid='rowid'
    );
  `);

  await adapter.execute(`
    CREATE TRIGGER search_index_fts5_insert
    AFTER INSERT ON search_index
    BEGIN
      INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, metadata)
      VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.metadata);
    END;
  `);

  await adapter.execute(`
    CREATE TRIGGER search_index_fts5_update
    AFTER UPDATE ON search_index
    BEGIN
      INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, metadata)
      VALUES('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.metadata);
      INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, metadata)
      VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.metadata);
    END;
  `);

  await adapter.execute(`
    CREATE TRIGGER search_index_fts5_delete
    AFTER DELETE ON search_index
    BEGIN
      INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, metadata)
      VALUES('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.metadata);
    END;
  `);

  logger.info('FTS5 table and triggers rebuilt');
}

/**
 * Run VACUUM to defragment the database.
 */
export async function fixFragmentation(
  databaseService: DatabaseService,
  logger: Logger
): Promise<void> {
  await databaseService.execute('VACUUM');
  logger.info('Database vacuumed');
}

/**
 * Recreate important indexes (CREATE INDEX IF NOT EXISTS).
 */
export async function fixIndexes(
  databaseService: DatabaseService,
  logger: Logger
): Promise<void> {
  const adapter = databaseService.getAdapter();

  const indexes = [
    {
      name: 'idx_records_updated_at',
      sql: 'CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at)',
    },
    {
      name: 'idx_records_created_at',
      sql: 'CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at)',
    },
    {
      name: 'idx_records_title',
      sql: 'CREATE INDEX IF NOT EXISTS idx_records_title ON records(LOWER(title))',
    },
    {
      name: 'idx_search_index_updated_at',
      sql: 'CREATE INDEX IF NOT EXISTS idx_search_index_updated_at ON search_index(updated_at)',
    },
    {
      name: 'idx_search_index_title',
      sql: 'CREATE INDEX IF NOT EXISTS idx_search_index_title ON search_index(LOWER(title))',
    },
  ];

  for (const index of indexes) {
    try {
      await adapter.execute(index.sql);
    } catch (err: any) {
      logger.warn(`Failed to create index ${index.name}`, {
        error: err.message,
      });
    }
  }

  logger.info('Indexes recreated');
}

/**
 * ALTER TABLE ADD COLUMN for each missing column. Column type inferred
 * from naming convention: title_normalized → TEXT; *_count → INTEGER;
 * *_at/*_date/*_time → DATETIME; else TEXT.
 */
export async function fixMissingColumns(
  databaseService: DatabaseService,
  logger: Logger,
  missingColumns: string[],
  tableName?: string
): Promise<void> {
  const adapter = databaseService.getAdapter();
  const table = tableName || 'search_index';

  for (const column of missingColumns) {
    try {
      let columnType = 'TEXT';
      if (column === 'title_normalized') {
        columnType = 'TEXT';
      } else if (column.includes('count')) {
        columnType = 'INTEGER';
      } else if (
        column.includes('at') ||
        column.includes('date') ||
        column.includes('time')
      ) {
        columnType = 'DATETIME';
      }

      await adapter.execute(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${columnType}`
      );
      logger.info(`Added missing column ${column} to ${table}`);
    } catch (err: any) {
      logger.warn(`Failed to add column ${column} to ${table}`, {
        error: err.message,
      });
    }
  }
}
