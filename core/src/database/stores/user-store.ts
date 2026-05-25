/**
 * User Store — owns CRUD for `users` plus the tightly-coupled
 * `api_keys` and `sessions` tables (auth surface).
 *
 * Extracted from `database-service.ts` as part of Phase 2d W2-T5
 * decomposition. Method bodies are moved verbatim; only the receiver
 * changes (the store owns its own adapter reference). The orchestrator
 * delegates one-liners to this store so external consumers see no
 * signature change.
 */

import { DatabaseAdapter, SqlParam } from '../database-adapter.js';
import type {
  UserRow,
  ApiKeyWithUserRow,
  SessionWithUserRow,
  LastInsertIdRow,
  CountRow,
} from '../types/row-types.js';

export class UserStore {
  private adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  // User management
  async createUser(userData: {
    username: string;
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    auth_provider?: string;
    email_verified?: boolean;
  }): Promise<number> {
    await this.adapter.execute(
      'INSERT INTO users (username, role, email, name, avatar_url, auth_provider, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        userData.username,
        userData.role,
        userData.email,
        userData.name,
        userData.avatar_url,
        userData.auth_provider || 'password',
        userData.email_verified || false,
      ]
    );

    // Get the inserted ID
    const rows = await this.adapter.query<LastInsertIdRow>(
      'SELECT last_insert_rowid() as id'
    );
    return rows[0].id;
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    const rows = await this.adapter.query<UserRow>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getUserById(id: number): Promise<UserRow | null> {
    const rows = await this.adapter.query<UserRow>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.adapter.query<UserRow>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getUserWithPassword(username: string): Promise<UserRow | null> {
    const rows = await this.adapter.query<UserRow>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async createUserWithPassword(userData: {
    username: string;
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    passwordHash?: string;
    auth_provider?: string;
    email_verified?: boolean;
    pending_email?: string;
    pending_email_token?: string;
    pending_email_expires?: Date;
  }): Promise<number> {
    // Use a transaction to ensure atomicity
    await this.adapter.execute(
      'INSERT INTO users (username, role, email, name, avatar_url, password_hash, auth_provider, email_verified, pending_email, pending_email_token, pending_email_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        userData.username,
        userData.role,
        userData.email,
        userData.name,
        userData.avatar_url,
        userData.passwordHash,
        userData.auth_provider || 'password',
        userData.email_verified || false,
        userData.pending_email || null,
        userData.pending_email_token || null,
        userData.pending_email_expires || null,
      ]
    );

    // Get the inserted ID using last_insert_rowid() - this should work in SQLite
    const idRows = await this.adapter.query<LastInsertIdRow>(
      'SELECT last_insert_rowid() as id'
    );
    const userId = idRows[0].id;

    // Verify the user exists by querying it
    await this.adapter.query<Pick<UserRow, 'id' | 'username'>>(
      'SELECT id, username FROM users WHERE id = ?',
      [userId]
    );

    // Return just the user ID
    return userId;
  }

  async updateUser(
    userId: number,
    userData: {
      email?: string;
      name?: string;
      role?: string;
      passwordHash?: string;
      avatar_url?: string;
      auth_provider?: string;
      email_verified?: boolean;
      pending_email?: string;
      pending_email_token?: string;
      pending_email_expires?: string;
    }
  ): Promise<boolean> {
    const updates: string[] = [];
    const values: SqlParam[] = [];

    if (userData.email !== undefined) {
      updates.push('email = ?');
      values.push(userData.email);
    }
    if (userData.name !== undefined) {
      updates.push('name = ?');
      values.push(userData.name);
    }
    if (userData.role !== undefined) {
      updates.push('role = ?');
      values.push(userData.role);
    }
    if (userData.passwordHash !== undefined) {
      updates.push('password_hash = ?');
      values.push(userData.passwordHash);
    }
    if (userData.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(userData.avatar_url);
    }
    if (userData.auth_provider !== undefined) {
      updates.push('auth_provider = ?');
      values.push(userData.auth_provider);
    }
    if (userData.email_verified !== undefined) {
      updates.push('email_verified = ?');
      values.push(userData.email_verified);
    }
    if (userData.pending_email !== undefined) {
      updates.push('pending_email = ?');
      values.push(userData.pending_email);
    }
    if (userData.pending_email_token !== undefined) {
      updates.push('pending_email_token = ?');
      values.push(userData.pending_email_token);
    }
    if (userData.pending_email_expires !== undefined) {
      updates.push('pending_email_expires = ?');
      values.push(userData.pending_email_expires);
    }

    if (updates.length === 0) {
      return false;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await this.adapter.execute(sql, values);
    return true;
  }

  async deleteUser(userId: number): Promise<void> {
    await this.adapter.execute('DELETE FROM users WHERE id = ?', [userId]);
  }

  async listUsers(
    options: {
      limit?: number;
      offset?: number;
      role?: string;
      search?: string;
    } = {}
  ): Promise<{ users: UserRow[]; total: number }> {
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: SqlParam[] = [];

    if (options.role) {
      sql += ' AND role = ?';
      params.push(options.role);
    }
    if (options.search) {
      sql += ' AND (username LIKE ? OR name LIKE ? OR email LIKE ?)';
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countRows = await this.adapter.query<CountRow>(countSql, params);
    const total = countRows[0].count;

    // Get users with pagination
    sql += ' ORDER BY created_at DESC';
    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const users = await this.adapter.query<UserRow>(sql, params);

    return { users, total };
  }

  // API key management
  async createApiKey(
    userId: number,
    keyHash: string,
    name: string,
    expiresAt?: Date
  ): Promise<number> {
    await this.adapter.execute(
      'INSERT INTO api_keys (user_id, key_hash, name, expires_at) VALUES (?, ?, ?, ?)',
      [userId, keyHash, name, expiresAt?.toISOString()]
    );

    const rows = await this.adapter.query<LastInsertIdRow>(
      'SELECT last_insert_rowid() as id'
    );
    return rows[0].id;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKeyWithUserRow | null> {
    const rows = await this.adapter.query<ApiKeyWithUserRow>(
      'SELECT ak.*, u.username, u.role, u.name as user_name, u.email, u.avatar_url FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ?',
      [keyHash]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async deleteApiKey(id: number): Promise<void> {
    await this.adapter.execute('DELETE FROM api_keys WHERE id = ?', [id]);
  }

  // Session management
  async createSession(
    userId: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<number> {
    await this.adapter.execute(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt.toISOString()]
    );

    const rows = await this.adapter.query<LastInsertIdRow>(
      'SELECT last_insert_rowid() as id'
    );
    return rows[0].id;
  }

  async getSessionByToken(
    tokenHash: string
  ): Promise<SessionWithUserRow | null> {
    const rows = await this.adapter.query<SessionWithUserRow>(
      'SELECT s.*, u.username, u.role, u.name, u.email, u.avatar_url FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?',
      [tokenHash, new Date().toISOString()]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async deleteSession(id: number): Promise<void> {
    await this.adapter.execute('DELETE FROM sessions WHERE id = ?', [id]);
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.adapter.execute('DELETE FROM sessions WHERE expires_at <= ?', [
      new Date().toISOString(),
    ]);
  }
}
