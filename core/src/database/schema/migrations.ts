/**
 * SQLite schema migrations — extracted from database-adapter.ts in
 * Phase 2d W2-T4. Idempotent migrations applied after CREATE TABLE.
 * Each migration is wrapped in try/catch so "column already exists"
 * outcomes don't fail initialization.
 */

import { coreError, coreInfo, coreDebug } from '../../utils/core-output.js';
import { errorMessage, errorStack, errorCode, errorName } from '../../utils/error-narrow.js';

/**
 * Minimal executor surface used by migrations: query (for column
 * existence checks) + execute (for ALTER TABLE).
 */
export interface DDLExecutor {
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<any>;
}

/**
 * Add columns that the schema evolved to include. Idempotent: ALTER TABLE
 * ADD COLUMN throws on duplicate, which we swallow.
 */
export async function runSimpleColumnMigrations(
  exec: DDLExecutor
): Promise<void> {
  const simpleMigrations = [
    'ALTER TABLE records ADD COLUMN geography TEXT',
    'ALTER TABLE records ADD COLUMN attached_files TEXT',
    'ALTER TABLE records ADD COLUMN linked_records TEXT',
    'ALTER TABLE records ADD COLUMN linked_geography_files TEXT',
  ];

  for (const sql of simpleMigrations) {
    try {
      await exec.execute(sql);
    } catch {
      coreDebug('Column already exists or migration not needed', {
        operation: 'database:initialize',
        sql,
      });
    }
  }
}

/**
 * Add workflow_state column to a target table when missing. Verbose
 * because the migration is double-checked (column existence verified
 * via PRAGMA table_info, then re-verified after the ALTER).
 */
export async function ensureWorkflowStateColumn(
  exec: DDLExecutor,
  tableName: 'records' | 'record_drafts'
): Promise<void> {
  try {
    const tableExists = await exec.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );

    if (tableExists.length === 0) {
      coreDebug(
        `${tableName} table does not exist yet, will be created with workflow_state column`,
        { operation: 'database:initialize' }
      );
      return;
    }

    const tableInfo = await exec.query(`PRAGMA table_info(${tableName})`);
    const columnNames = tableInfo.map((col: any) => col.name);
    const hasWorkflowState = columnNames.includes('workflow_state');

    coreDebug(`Checking workflow_state column in ${tableName}`, {
      operation: 'database:initialize',
      tableExists: true,
      columnNames,
      hasWorkflowState,
    });

    if (hasWorkflowState) {
      coreDebug(`workflow_state column already exists in ${tableName} table`, {
        operation: 'database:initialize',
      });
      return;
    }

    coreInfo(
      `Adding workflow_state column to ${tableName} table via migration`,
      { operation: 'database:initialize' }
    );
    await exec.execute(
      `ALTER TABLE ${tableName} ADD COLUMN workflow_state TEXT DEFAULT 'draft'`
    );

    const verifyInfo = await exec.query(`PRAGMA table_info(${tableName})`);
    const verifyColumns = verifyInfo.map((col: any) => col.name);
    const verifyHasWorkflowState = verifyColumns.includes('workflow_state');

    if (verifyHasWorkflowState) {
      coreInfo(
        `Successfully added workflow_state column to ${tableName} table`,
        { operation: 'database:initialize' }
      );
    } else {
      coreError(
        `Failed to verify workflow_state column was added to ${tableName}`,
        'MIGRATION_VERIFICATION_FAILED',
        { columns: verifyColumns, operation: 'database:initialize' },
        { operation: 'database:initialize' }
      );
    }
  } catch (err: unknown) {
    coreError(
      'Workflow state column migration check failed',
      'MIGRATION_ERROR',
      {
        error: errorMessage(err) || String(err),
        stack: errorStack(err),
        operation: 'database:initialize',
      },
      { operation: 'database:initialize' }
    );
  }
}

const USER_SECURITY_MIGRATIONS = [
  {
    column: 'auth_provider',
    sql: 'ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT "password"',
    description: 'Authentication provider tracking',
  },
  {
    column: 'email_verified',
    sql: 'ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE',
    description: 'Email verification status',
  },
  {
    column: 'pending_email',
    sql: 'ALTER TABLE users ADD COLUMN pending_email TEXT',
    description: 'Pending email change',
  },
  {
    column: 'pending_email_token',
    sql: 'ALTER TABLE users ADD COLUMN pending_email_token TEXT',
    description: 'Email change verification token',
  },
  {
    column: 'pending_email_expires',
    sql: 'ALTER TABLE users ADD COLUMN pending_email_expires DATETIME',
    description: 'Email change token expiration',
  },
];

export async function runUserSecurityMigrations(
  exec: DDLExecutor
): Promise<void> {
  for (const migration of USER_SECURITY_MIGRATIONS) {
    try {
      await exec.execute(migration.sql);
      coreInfo(
        `✓ Added ${migration.column} column for ${migration.description}`,
        { operation: 'database:initialize' }
      );
    } catch {
      coreDebug(
        `${migration.column} column already exists or migration not needed`,
        { operation: 'database:initialize' }
      );
    }
  }

  try {
    await exec.execute(`
      UPDATE users
      SET auth_provider = 'password', email_verified = TRUE
      WHERE password_hash IS NOT NULL AND auth_provider IS NULL
    `);
    coreInfo('Updated existing password users with auth_provider', {
      operation: 'database:initialize',
    });
  } catch {
    coreDebug('Auth provider update not needed or already completed', {
      operation: 'database:initialize',
    });
  }
}

const SEARCH_INDEX_COLUMNS = [
  { name: 'title_normalized', type: 'TEXT' },
  { name: 'content_preview', type: 'TEXT' },
  { name: 'word_count', type: 'INTEGER' },
];

export async function migrateSearchIndexColumns(
  exec: DDLExecutor
): Promise<void> {
  for (const column of SEARCH_INDEX_COLUMNS) {
    try {
      await exec.execute(
        `ALTER TABLE search_index ADD COLUMN ${column.name} ${column.type}`
      );
      coreDebug(`Added column ${column.name} to search_index`);
    } catch (err: unknown) {
      if (
        !errorMessage(err)?.includes('duplicate column') &&
        !errorMessage(err)?.includes('already exists')
      ) {
        coreDebug(`Error adding column ${column.name}:`, errorMessage(err));
      }
    }
  }
}
