import sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface DatabaseAdapter {
  connect(): Promise<void>;
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<any>;
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
        auth_provider TEXT DEFAULT 'password',
        email_verified BOOLEAN DEFAULT FALSE,
        pending_email TEXT,
        pending_email_token TEXT,
        pending_email_expires DATETIME,
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
        geography TEXT,
        attached_files TEXT,
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

      // Storage files table for UUID-based file tracking
      `CREATE TABLE IF NOT EXISTS storage_files (
        id TEXT PRIMARY KEY, -- UUID
        original_name TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        folder TEXT NOT NULL,
        relative_path TEXT NOT NULL, -- folder/stored_filename
        provider_path TEXT NOT NULL, -- full path in storage provider
        size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        description TEXT,
        uploaded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Email verification tokens table
      `CREATE TABLE IF NOT EXISTS email_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('initial', 'change')),
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,
    ];

    for (const table of tables) {
      try {
        await this.execute(table);
      } catch (error) {
        console.error('Error creating table:', error);
        console.error('Table SQL:', table);
        throw error;
      }
    }

    // Add geography column to existing records table if it doesn't exist
    try {
      await this.execute('ALTER TABLE records ADD COLUMN geography TEXT');
    } catch (error) {
      // Column already exists, ignore error
      console.log('Geography column already exists or migration not needed');
    }

    // Add attached_files column to existing records table if it doesn't exist
    try {
      await this.execute('ALTER TABLE records ADD COLUMN attached_files TEXT');
    } catch (error) {
      // Column already exists, ignore error
      console.log(
        'Attached files column already exists or migration not needed'
      );
    }

    // Security Enhancement Migrations - Add new user security fields
    const userSecurityMigrations = [
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

    for (const migration of userSecurityMigrations) {
      try {
        await this.execute(migration.sql);
        console.log(
          `✓ Added ${migration.column} column for ${migration.description}`
        );
      } catch (error) {
        // Column already exists, ignore error
        console.log(
          `${migration.column} column already exists or migration not needed`
        );
      }
    }

    // Set default auth_provider for existing users with password_hash
    try {
      await this.execute(`
        UPDATE users 
        SET auth_provider = 'password', email_verified = TRUE 
        WHERE password_hash IS NOT NULL AND auth_provider IS NULL
      `);
      console.log('✓ Updated existing password users with auth_provider');
    } catch (error) {
      console.log('Auth provider update not needed or already completed');
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
