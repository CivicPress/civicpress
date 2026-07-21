/**
 * Database Adapter — connection lifecycle, query/execute, transactions,
 * and schema initialization for the SQLite backend. Phase 2d W2-T4
 * decomposed the prior 923-LoC monolith: the table DDL, column
 * migrations, index/FTS5 setup now live under `schema/`.
 */

import sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { coreError, coreDebug } from '../utils/core-output.js';
import { CORE_TABLE_STATEMENTS } from './schema/tables.js';
import {
  runSimpleColumnMigrations,
  ensureRecordLocksWithoutFk,
  ensureWorkflowStateColumn,
  runUserSecurityMigrations,
  migrateSearchIndexColumns,
  type DDLExecutor,
} from './schema/migrations.js';
import {
  createSagaIndexes,
  createSortIndexes,
  createFTS5Table,
} from './schema/indexes-and-fts.js';

/**
 * Transaction handle for managing database transactions
 */
export interface Transaction {
  id: string;
  isActive: boolean;
}

export type SqlParam =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | Buffer;
export type SqlRow = Record<string, unknown>;

export interface ExecuteResult {
  lastID?: number;
  changes?: number;
}

/**
 * SQLite driver returns untyped rows; per-callsite generic narrowing via
 * `query<TypedRow>(sql, params)` is the expected pattern (typed Row
 * interfaces live in `./types/row-types.ts`). The default is `unknown`
 * so unparametrized callers must narrow explicitly — the previous `any`
 * default silently leaked untyped values everywhere a query was made.
 */
export interface DatabaseAdapter {
  connect(): Promise<void>;
  query<T = unknown>(sql: string, params?: SqlParam[]): Promise<T[]>;
  execute(sql: string, params?: SqlParam[]): Promise<ExecuteResult>;
  close(): Promise<void>;
  initialize(): Promise<void>;
  beginTransaction(): Promise<Transaction>;
  commitTransaction(transaction: Transaction): Promise<void>;
  rollbackTransaction(transaction: Transaction): Promise<void>;
  /**
   * Return the configuration this adapter was constructed with. Lets
   * diagnostics + health-checks read backend-specific settings (e.g. the
   * SQLite file path) without leaking through `(adapter as any).config`.
   */
  getConfig(): DatabaseConfig;
}

export interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  sqlite?: {
    file: string;
  };
  postgres?: {
    url: string;
  };
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;
  private activeTransactions: Map<string, boolean> = new Map();

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbPath = this.config.sqlite?.file || './civic.db';

      // Ensure directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const sqlite = sqlite3.verbose();
      const db = new sqlite.Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Connection-mode pragmas — sqlite scopes these to the connection
        // (WAL sticks to the file, but a new first writer still has to set
        // it), so they run on EVERY connect:
        //   foreign_keys  — the schema's FK/ON DELETE CASCADE clauses are
        //                   inert without it (orphaned locks/sessions);
        //   journal_mode  — WAL lets the API and background workers hit one
        //                   DB concurrently (readers don't block the writer);
        //   busy_timeout  — a locked DB waits up to 5s instead of failing
        //                   the query with SQLITE_BUSY outright.
        db.exec(
          'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
          (pragmaErr) => {
            if (pragmaErr) {
              reject(pragmaErr);
            } else {
              resolve();
            }
          }
        );
      });
      this.db = db;
    });
  }

  async query<T = unknown>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve((rows as T[]) || []);
        }
      });
    });
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<ExecuteResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Initialize schema: create core tables, run column migrations, create
   * indexes + FTS5. Each step is idempotent so re-running is safe.
   */
  async initialize(): Promise<void> {
    const exec: DDLExecutor = {
      query: (sql, params) => this.query(sql, params),
      execute: (sql, params) => this.execute(sql, params),
    };

    // Step 1: create all core tables
    for (const tableSql of CORE_TABLE_STATEMENTS) {
      try {
        await this.execute(tableSql);
      } catch (err) {
        coreError(
          'Error creating table',
          'TABLE_CREATION_ERROR',
          {
            error: err instanceof Error ? err.message : String(err),
            table: tableSql.substring(0, 100),
          },
          { operation: 'database:initialize' }
        );
        throw err;
      }
    }

    // Step 2: simple ALTER TABLE column migrations (idempotent)
    await runSimpleColumnMigrations(exec);

    // Step 2b: rebuild record_locks without its records(id) FK — draft
    // locking is impossible with it under enforced foreign keys.
    await ensureRecordLocksWithoutFk(exec);

    // Step 3: saga-related indexes (run before workflow_state migrations
    // so the orchestrator's prior behavior is preserved — the original
    // code interleaved these calls)
    await createSagaIndexes(exec);

    // Step 4: verbose workflow_state migrations for records + drafts
    await ensureWorkflowStateColumn(exec, 'records');
    await ensureWorkflowStateColumn(exec, 'record_drafts');

    // Step 5: user security migrations
    await runUserSecurityMigrations(exec);

    // Step 6: search_index column migrations
    await migrateSearchIndexColumns(exec);

    // Step 7: FTS5 virtual table + triggers
    await createFTS5Table(exec);

    // Step 8: sort indexes
    await createSortIndexes(exec);
  }

  async beginTransaction(): Promise<Transaction> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    return new Promise((resolve, reject) => {
      this.db!.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
        } else {
          this.activeTransactions.set(transactionId, true);
          resolve({ id: transactionId, isActive: true });
        }
      });
    });
  }

  async commitTransaction(transaction: Transaction): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (!this.activeTransactions.has(transaction.id)) {
      throw new Error(`Transaction ${transaction.id} is not active`);
    }

    return new Promise((resolve, reject) => {
      this.db!.run('COMMIT', (err) => {
        if (err) {
          reject(err);
        } else {
          this.activeTransactions.delete(transaction.id);
          resolve();
        }
      });
    });
  }

  async rollbackTransaction(transaction: Transaction): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (!this.activeTransactions.has(transaction.id)) {
      coreDebug(
        `Transaction ${transaction.id} is not active, may already be rolled back`,
        { operation: 'database:rollback' }
      );
      return;
    }

    return new Promise((resolve, reject) => {
      this.db!.run('ROLLBACK', (err) => {
        if (err) {
          reject(err);
        } else {
          this.activeTransactions.delete(transaction.id);
          resolve();
        }
      });
    });
  }

  getConfig(): DatabaseConfig {
    return this.config;
  }
}

 
// Placeholder for PostgreSQL adapter (future implementation)
export class PostgresAdapter implements DatabaseAdapter {
  private config: DatabaseConfig;

  constructor(_config: DatabaseConfig) {
    this.config = _config;
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  getConfig(): DatabaseConfig {
    return this.config;
  }

  async connect(): Promise<void> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async query<T = unknown>(_sql: string, _params?: SqlParam[]): Promise<T[]> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async execute(_sql: string, _params?: SqlParam[]): Promise<ExecuteResult> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async close(): Promise<void> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async initialize(): Promise<void> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async beginTransaction(): Promise<Transaction> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async commitTransaction(_transaction: Transaction): Promise<void> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async rollbackTransaction(_transaction: Transaction): Promise<void> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }
}
 

/**
 * Factory: pick the adapter for the configured database type.
 */
export function createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
  switch (config.type) {
    case 'sqlite':
      return new SQLiteAdapter(config);
    case 'postgres':
      return new PostgresAdapter(config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}
