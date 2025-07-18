import sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface DatabaseAdapter {
  connect(): Promise<void>;
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  close(): Promise<void>;
  initialize(): Promise<void>;
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

  async execute(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(sql, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
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

  async initialize(): Promise<void> {
    // Create tables for performance layer
    const tables = [
      // Users table for API keys and sessions
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        email TEXT,
        name TEXT,
        avatar_url TEXT,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // API keys table
      `CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hash TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Sessions table
      `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Search index table
      `CREATE TABLE IF NOT EXISTS search_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL,
        record_type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        tags TEXT,
        metadata TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Records table
      `CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        content TEXT,
        metadata TEXT,
        path TEXT,
        author TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Audit logs table
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
    ];

    for (const table of tables) {
      await this.execute(table);
    }
  }
}

// Placeholder for PostgreSQL adapter (future implementation)
export class PostgresAdapter implements DatabaseAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async query(_sql: string, _params?: any[]): Promise<any[]> {
    throw new Error(
      'PostgreSQL adapter is not yet implemented. Please use SQLite for now. PostgreSQL support is coming soon.'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// Factory function to create the appropriate adapter
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
