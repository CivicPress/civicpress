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

export interface DatabaseAdapter {
  connect(): Promise<void>;
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<any>;
  close(): Promise<void>;
  initialize(): Promise<void>;
  beginTransaction(): Promise<Transaction>;
  commitTransaction(transaction: Transaction): Promise<void>;
  rollbackTransaction(transaction: Transaction): Promise<void>;
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
      this.db = new sqlite.Database(dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async execute(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
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
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// Placeholder for PostgreSQL adapter (future implementation)
export class PostgresAdapter implements DatabaseAdapter {
  constructor(_config: DatabaseConfig) {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async connect(): Promise<void> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async query(_sql: string, _params?: any[]): Promise<any[]> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  async execute(_sql: string, _params?: any[]): Promise<void> {
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
/* eslint-enable @typescript-eslint/no-unused-vars */

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
