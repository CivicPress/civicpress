/**
 * SQLite index + FTS5 DDL — extracted from database-adapter.ts in
 * Phase 2d W2-T4. Idempotent: each CREATE INDEX/TABLE/TRIGGER uses
 * IF NOT EXISTS or is wrapped in try/catch.
 */

import { coreDebug, coreError } from '../../utils/core-output.js';
import { errorMessage, errorStack, errorCode, errorName, toError } from '../../utils/error-narrow.js';
import type { DDLExecutor } from './migrations.js';

const SAGA_INDEXES = [
  {
    name: 'idx_saga_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_saga_status ON saga_states(status)',
    description: 'Index for saga status queries',
  },
  {
    name: 'idx_saga_type',
    sql: 'CREATE INDEX IF NOT EXISTS idx_saga_type ON saga_states(saga_type)',
    description: 'Index for saga type queries',
  },
  {
    name: 'idx_idempotency_key',
    sql: 'CREATE INDEX IF NOT EXISTS idx_idempotency_key ON saga_states(idempotency_key)',
    description: 'Index for idempotency key lookups',
  },
  {
    name: 'idx_correlation_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_correlation_id ON saga_states(correlation_id)',
    description: 'Index for correlation ID lookups',
  },
  {
    name: 'idx_saga_started_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_saga_started_at ON saga_states(started_at)',
    description: 'Index for time-range queries',
  },
  {
    name: 'idx_saga_resource_locks_saga',
    sql: 'CREATE INDEX IF NOT EXISTS idx_saga_resource_locks_saga ON saga_resource_locks(saga_id)',
    description: 'Index for saga resource lock lookups',
  },
  {
    name: 'idx_saga_resource_locks_expires',
    sql: 'CREATE INDEX IF NOT EXISTS idx_saga_resource_locks_expires ON saga_resource_locks(expires_at)',
    description: 'Index for expired resource locks',
  },
];

const SORT_INDEXES = [
  {
    name: 'idx_records_updated_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at DESC)',
    description: 'Index for updated_desc sort',
  },
  {
    name: 'idx_records_created_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC)',
    description: 'Index for created_desc sort',
  },
  {
    name: 'idx_records_title',
    sql: 'CREATE INDEX IF NOT EXISTS idx_records_title ON records(title COLLATE NOCASE)',
    description: 'Index for title_asc/title_desc sort',
  },
  {
    name: 'idx_search_index_updated_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_search_index_updated_at ON search_index(updated_at DESC)',
    description: 'Index for search updated_desc sort',
  },
  {
    name: 'idx_search_index_title',
    sql: 'CREATE INDEX IF NOT EXISTS idx_search_index_title ON search_index(title COLLATE NOCASE)',
    description: 'Index for search title sort',
  },
];

async function applyIndexBatch(
  exec: DDLExecutor,
  batch: Array<{ name: string; sql: string; description: string }>
): Promise<void> {
  for (const index of batch) {
    try {
      await exec.execute(index.sql);
      coreDebug(`Created index ${index.name} for ${index.description}`, {
        operation: 'database:initialize',
      });
    } catch (err: unknown) {
      coreDebug(
        `Index ${index.name} already exists or creation failed: ${errorMessage(err)}`,
        { operation: 'database:initialize' }
      );
    }
  }
}

export async function createSagaIndexes(exec: DDLExecutor): Promise<void> {
  await applyIndexBatch(exec, SAGA_INDEXES);
}

export async function createSortIndexes(exec: DDLExecutor): Promise<void> {
  await applyIndexBatch(exec, SORT_INDEXES);
}

/**
 * Create the FTS5 virtual table + the 3 sync triggers (insert/update/
 * delete) against search_index. Idempotent: drops existing triggers
 * first so re-running picks up trigger changes.
 */
export async function createFTS5Table(exec: DDLExecutor): Promise<void> {
  try {
    await exec.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index_fts5 USING fts5(
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
    coreDebug('Created FTS5 virtual table');

    try {
      await exec.execute('DROP TRIGGER IF EXISTS search_index_fts5_insert');
      await exec.execute('DROP TRIGGER IF EXISTS search_index_fts5_update');
      await exec.execute('DROP TRIGGER IF EXISTS search_index_fts5_delete');
    } catch {
      /* triggers might not exist yet */
    }

    await exec.execute(`
      CREATE TRIGGER search_index_fts5_insert
      AFTER INSERT ON search_index
      BEGIN
        INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, metadata)
        VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.metadata);
      END;
    `);

    await exec.execute(`
      CREATE TRIGGER search_index_fts5_update
      AFTER UPDATE ON search_index
      BEGIN
        INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, metadata)
        VALUES('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.metadata);
        INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, metadata)
        VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.metadata);
      END;
    `);

    await exec.execute(`
      CREATE TRIGGER search_index_fts5_delete
      AFTER DELETE ON search_index
      BEGIN
        INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, metadata)
        VALUES('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.metadata);
      END;
    `);

    coreDebug('Created FTS5 triggers');
  } catch (err: unknown) {
    coreError('Error creating FTS5 table or triggers:', errorMessage(err));
    // Don't throw — FTS5 might not be available in some SQLite builds.
  }
}
