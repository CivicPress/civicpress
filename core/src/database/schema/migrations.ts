/**
 * SQLite schema migrations — extracted from database-adapter.ts in
 * Phase 2d W2-T4. Idempotent migrations applied after CREATE TABLE.
 *
 * Idempotency is established by CHECKING THE SCHEMA, never by catching the
 * error that a re-run would raise. Every migration here used to be wrapped in
 * a bare `try { ... } catch { debug('already exists or not needed') }`, which
 * cannot tell "this column is already present" apart from a locked database, a
 * missing table, or a typo in the DDL. All three were swallowed at debug level
 * and initialization carried on against a schema that did not match what the
 * code above it assumed — the failure surfacing much later, somewhere else, as
 * a query against a column that was never added.
 *
 * So: ask whether the change is already in place; if it is not, apply it and
 * let any error propagate. Every outcome is written to the `schema_migrations`
 * ledger, so what a database actually ran is a fact on disk rather than an
 * inference from its shape.
 */

import { coreInfo, coreDebug } from '../../utils/core-output.js';
import { errorMessage } from '../../utils/error-narrow.js';
import type { SqlParam, ExecuteResult } from '../database-adapter.js';

/**
 * Minimal executor surface used by migrations: query (for column
 * existence checks) + execute (for ALTER TABLE).
 */
export interface DDLExecutor {
  query<T = unknown>(sql: string, params?: SqlParam[]): Promise<T[]>;
  execute(sql: string, params?: SqlParam[]): Promise<ExecuteResult>;
}

/** Ledger table name — created in CORE_TABLE_STATEMENTS, ahead of Step 2. */
export const MIGRATION_LEDGER_TABLE = 'schema_migrations';

/**
 * - `applied`: this database executed the DDL.
 * - `adopted`: the change was already present when the ledger was introduced
 *   (or the table was created with its final shape), so nothing was executed.
 */
export type MigrationOutcome = 'applied' | 'adopted';

/**
 * Tables these migrations may touch. Table names cannot be bound as SQL
 * parameters — `PRAGMA table_info(?)` is not valid — so they are interpolated,
 * and this list is what keeps that interpolation to a closed set of literals
 * rather than anything a caller could influence.
 */
type MigratableTable = 'records' | 'record_drafts' | 'users' | 'search_index';

async function recordMigration(
  exec: DDLExecutor,
  id: string,
  outcome: MigrationOutcome
): Promise<void> {
  await exec.execute(
    `INSERT OR IGNORE INTO ${MIGRATION_LEDGER_TABLE} (id, outcome) VALUES (?, ?)`,
    [id, outcome]
  );
}

/** Has this migration id already been recorded? */
async function hasRun(exec: DDLExecutor, id: string): Promise<boolean> {
  const rows = await exec.query(
    `SELECT id FROM ${MIGRATION_LEDGER_TABLE} WHERE id = ?`,
    [id]
  );
  return rows.length > 0;
}

async function columnExists(
  exec: DDLExecutor,
  table: MigratableTable,
  column: string
): Promise<boolean> {
  const info = await exec.query<{ name: string }>(
    `PRAGMA table_info(${table})`
  );
  return info.some((col) => col.name === column);
}

async function tableExists(
  exec: DDLExecutor,
  table: MigratableTable
): Promise<boolean> {
  const rows = await exec.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [table]
  );
  return rows.length > 0;
}

interface ColumnMigration {
  /** Stable ledger id, e.g. `records.geography`. */
  id: string;
  table: MigratableTable;
  column: string;
  ddl: string;
  description?: string;
}

/**
 * Add a column unless it is already there, then prove it landed.
 *
 * This is the single implementation of what were four separate hand-rolled
 * loops, only one of which (workflow_state) bothered to re-read the schema
 * afterwards to confirm the ALTER had actually taken effect. Everything routed
 * through here now gets that verification.
 */
async function ensureColumn(
  exec: DDLExecutor,
  migration: ColumnMigration
): Promise<MigrationOutcome> {
  const { id, table, column, ddl } = migration;

  if (!(await tableExists(exec, table))) {
    // Step 1 of initialize() creates every table these migrations target and
    // throws if it cannot, so reaching here means the schema is not in the
    // state the rest of initialization is about to assume. Refuse rather than
    // skip: a skipped migration is invisible, and the column's absence would
    // resurface later as a failing query with no trace back to this point.
    throw new Error(
      `Migration ${id}: table "${table}" does not exist. Core tables are ` +
        `created before migrations run, so this indicates a failed or ` +
        `out-of-order initialization.`
    );
  }

  if (await columnExists(exec, table, column)) {
    await recordMigration(exec, id, 'adopted');
    return 'adopted';
  }

  coreInfo(`Applying migration ${id}`, {
    operation: 'database:initialize',
    description: migration.description,
  });

  // No catch. A duplicate column cannot reach this line, so anything thrown
  // here is a genuine failure and must stop initialization.
  await exec.execute(ddl);

  if (!(await columnExists(exec, table, column))) {
    throw new Error(
      `Migration ${id}: executed "${ddl}" without error, but column ` +
        `"${column}" is still absent from "${table}".`
    );
  }

  await recordMigration(exec, id, 'applied');
  return 'applied';
}

/** Apply a list of column migrations in order. */
async function ensureColumns(
  exec: DDLExecutor,
  migrations: ColumnMigration[]
): Promise<void> {
  for (const migration of migrations) {
    await ensureColumn(exec, migration);
  }
}

const RECORD_COLUMN_MIGRATIONS: ColumnMigration[] = [
  {
    id: 'records.geography',
    table: 'records',
    column: 'geography',
    ddl: 'ALTER TABLE records ADD COLUMN geography TEXT',
  },
  {
    id: 'records.attached_files',
    table: 'records',
    column: 'attached_files',
    ddl: 'ALTER TABLE records ADD COLUMN attached_files TEXT',
  },
  {
    id: 'records.linked_records',
    table: 'records',
    column: 'linked_records',
    ddl: 'ALTER TABLE records ADD COLUMN linked_records TEXT',
  },
  {
    id: 'records.linked_geography_files',
    table: 'records',
    column: 'linked_geography_files',
    ddl: 'ALTER TABLE records ADD COLUMN linked_geography_files TEXT',
  },
];

/**
 * Add columns that the schema evolved to include.
 */
export async function runSimpleColumnMigrations(
  exec: DDLExecutor
): Promise<void> {
  await ensureColumns(exec, RECORD_COLUMN_MIGRATIONS);
}

/**
 * Rebuild record_locks without its FK to records(id). Editing locks are
 * taken on DRAFTS — the id exists only in record_drafts until publish — so
 * once PRAGMA foreign_keys=ON is enforced (post-audit hardening batch 2)
 * the declared FK made draft locking fail outright. The table is ephemeral
 * (locks expire and deleteRecord cleans up explicitly), so drop/recreate is
 * safe; losing live editor locks during the one-time rebuild is acceptable.
 * Idempotent: only fires while the old FK-carrying shape exists.
 */
export async function ensureRecordLocksWithoutFk(
  exec: DDLExecutor
): Promise<void> {
  const id = 'record_locks.drop_records_fk';

  // This one has always propagated its failures; it keeps that behaviour and
  // gains only the ledger entry.
  const fks = await exec.query<{ table: string }>(
    'PRAGMA foreign_key_list(record_locks)'
  );
  if (fks.length === 0) {
    await recordMigration(exec, id, 'adopted');
    return;
  }

  await exec.execute('DROP TABLE IF EXISTS record_locks');
  await exec.execute(
    `CREATE TABLE record_locks (
        record_id TEXT PRIMARY KEY,
        locked_by TEXT NOT NULL,
        locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )`
  );
  coreInfo('Rebuilt record_locks without records(id) FK (draft locking)', {
    operation: 'database:initialize',
  });
  await recordMigration(exec, id, 'applied');
}

/**
 * Add workflow_state to a target table when missing.
 *
 * Previously this caught its own errors, logged them, and RETURNED — so a
 * failure to add the column left initialization reporting success while every
 * later workflow_state query ran against a table that did not have it. Its
 * post-ALTER verification had the same shape: it logged
 * MIGRATION_VERIFICATION_FAILED and carried on. Both now throw, via the shared
 * ensureColumn path.
 */
const workflowStateMigration = (
  tableName: 'records' | 'record_drafts'
): ColumnMigration => ({
  id: `${tableName}.workflow_state`,
  table: tableName,
  column: 'workflow_state',
  ddl: `ALTER TABLE ${tableName} ADD COLUMN workflow_state TEXT DEFAULT 'draft'`,
  description: 'Workflow state tracking',
});

export async function ensureWorkflowStateColumn(
  exec: DDLExecutor,
  tableName: 'records' | 'record_drafts'
): Promise<void> {
  await ensureColumn(exec, workflowStateMigration(tableName));
}

const USER_SECURITY_MIGRATIONS: ColumnMigration[] = [
  {
    id: 'users.auth_provider',
    table: 'users',
    column: 'auth_provider',
    ddl: 'ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT "password"',
    description: 'Authentication provider tracking',
  },
  {
    id: 'users.provider_user_id',
    table: 'users',
    column: 'provider_user_id',
    ddl: 'ALTER TABLE users ADD COLUMN provider_user_id TEXT',
    description:
      'Stable OAuth provider identity — account linking must match (auth_provider, provider_user_id), never username',
  },
  {
    id: 'users.email_verified',
    table: 'users',
    column: 'email_verified',
    ddl: 'ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE',
    description: 'Email verification status',
  },
  {
    id: 'users.pending_email',
    table: 'users',
    column: 'pending_email',
    ddl: 'ALTER TABLE users ADD COLUMN pending_email TEXT',
    description: 'Pending email change',
  },
  {
    id: 'users.pending_email_token',
    table: 'users',
    column: 'pending_email_token',
    ddl: 'ALTER TABLE users ADD COLUMN pending_email_token TEXT',
    description: 'Email change verification token',
  },
  {
    id: 'users.pending_email_expires',
    table: 'users',
    column: 'pending_email_expires',
    ddl: 'ALTER TABLE users ADD COLUMN pending_email_expires DATETIME',
    description: 'Email change token expiration',
  },
];

const BACKFILL_AUTH_PROVIDER_ID = 'users.backfill_auth_provider';
const PROVIDER_IDENTITY_INDEX_ID = 'users.idx_provider_identity';

export async function runUserSecurityMigrations(
  exec: DDLExecutor
): Promise<void> {
  await ensureColumns(exec, USER_SECURITY_MIGRATIONS);

  // A data backfill leaves no trace in the schema, so unlike the column
  // migrations above there is nothing to re-derive its state from. This is the
  // case the ledger GATES rather than merely records: a legacy database gets no
  // row on its first run after the ledger landed, so the backfill runs once and
  // is recorded; every run after that skips it.
  if (!(await hasRun(exec, BACKFILL_AUTH_PROVIDER_ID))) {
    await exec.execute(`
      UPDATE users
      SET auth_provider = 'password', email_verified = TRUE
      WHERE password_hash IS NOT NULL AND auth_provider IS NULL
    `);
    coreInfo('Updated existing password users with auth_provider', {
      operation: 'database:initialize',
    });
    await recordMigration(exec, BACKFILL_AUTH_PROVIDER_ID, 'applied');
  }

  // One provider identity maps to at most one account. Partial index so the
  // NULLs of local/password users (and legacy OAuth rows awaiting adoption)
  // don't collide.
  //
  // `IF NOT EXISTS` already makes this idempotent, so the catch this used to
  // sit behind could only ever hide a real failure — and the only realistic
  // real failure is that the data ALREADY violates the constraint. That is not
  // a condition to log at debug and continue past: this index is the control
  // that stops one OAuth identity from being linked to two accounts, so
  // starting up without it is starting up without the guarantee the auth code
  // believes it has. Fail closed, and name the duplicates so it is fixable.
  try {
    await exec.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity
      ON users(auth_provider, provider_user_id)
      WHERE provider_user_id IS NOT NULL
    `);
  } catch (err: unknown) {
    const duplicates = await exec
      .query<{ auth_provider: string; provider_user_id: string; n: number }>(
        `SELECT auth_provider, provider_user_id, COUNT(*) as n
         FROM users
         WHERE provider_user_id IS NOT NULL
         GROUP BY auth_provider, provider_user_id
         HAVING n > 1`
      )
      .catch(() => []);
    const detail = duplicates.length
      ? ` Duplicate provider identities: ${duplicates
          .map((d) => `${d.auth_provider}/${d.provider_user_id} (x${d.n})`)
          .join(', ')}.`
      : '';
    throw new Error(
      `Migration ${PROVIDER_IDENTITY_INDEX_ID}: could not create the unique ` +
        `provider-identity index, so one OAuth identity could be linked to ` +
        `more than one account. Refusing to start.${detail} ` +
        `Underlying error: ${errorMessage(err)}`
    );
  }
  await recordMigration(exec, PROVIDER_IDENTITY_INDEX_ID, 'applied');
}

const SEARCH_INDEX_MIGRATIONS: ColumnMigration[] = [
  {
    id: 'search_index.title_normalized',
    table: 'search_index',
    column: 'title_normalized',
    ddl: 'ALTER TABLE search_index ADD COLUMN title_normalized TEXT',
  },
  {
    id: 'search_index.content_preview',
    table: 'search_index',
    column: 'content_preview',
    ddl: 'ALTER TABLE search_index ADD COLUMN content_preview TEXT',
  },
  {
    id: 'search_index.word_count',
    table: 'search_index',
    column: 'word_count',
    ddl: 'ALTER TABLE search_index ADD COLUMN word_count INTEGER',
  },
];

export async function migrateSearchIndexColumns(
  exec: DDLExecutor
): Promise<void> {
  await ensureColumns(exec, SEARCH_INDEX_MIGRATIONS);
}

/**
 * Ledger ids of every migration that adds a COLUMN — as opposed to the data
 * backfill and the index, which have no schema state to re-derive and so
 * legitimately report `applied` on a database that has only just been created.
 *
 * Exported for the drift guard in the tests: `schema/tables.ts` must declare
 * every column named here, so a brand-new database should never actually have
 * to run one of these. See the invariant documented at the top of that file.
 */
export const COLUMN_MIGRATION_IDS: readonly string[] = [
  ...RECORD_COLUMN_MIGRATIONS,
  ...USER_SECURITY_MIGRATIONS,
  ...SEARCH_INDEX_MIGRATIONS,
  workflowStateMigration('records'),
  workflowStateMigration('record_drafts'),
].map((migration) => migration.id);

/**
 * The ledger, newest first. Exposed for operators and tests: "what did this
 * database actually run?" should be answerable without inspecting its shape.
 */
export async function listAppliedMigrations(
  exec: DDLExecutor
): Promise<
  Array<{ id: string; outcome: MigrationOutcome; applied_at: string }>
> {
  const rows = await exec.query<{
    id: string;
    outcome: MigrationOutcome;
    applied_at: string;
  }>(
    `SELECT id, outcome, applied_at FROM ${MIGRATION_LEDGER_TABLE} ORDER BY applied_at DESC, id ASC`
  );
  coreDebug(`Migration ledger holds ${rows.length} entries`, {
    operation: 'database:initialize',
  });
  return rows;
}
