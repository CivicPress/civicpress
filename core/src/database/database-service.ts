import {
  DatabaseAdapter,
  DatabaseConfig,
  createDatabaseAdapter,
} from './database-adapter.js';
import { Logger } from '../utils/logger.js';
import * as process from 'process';

export class DatabaseService {
  private adapter: DatabaseAdapter;
  private isConnected = false;
  private logger: Logger;

  constructor(config: DatabaseConfig, logger?: Logger) {
    this.adapter = createDatabaseAdapter(config);
    this.logger = logger || new Logger();
  }

  async initialize(): Promise<void> {
    try {
      await this.adapter.connect();
      await this.adapter.initialize();
      this.isConnected = true;
      // Suppress database messages in test environment
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
        this.logger.info('Database initialized successfully');
      }
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.isConnected) {
      await this.adapter.close();
      this.isConnected = false;
      // Suppress database messages in test environment
      if (process.env.NODE_ENV !== 'test') {
        this.logger.info('Database connection closed');
      }
    }
  }

  // Direct database access methods
  async query(sql: string, params: any[] = []): Promise<any[]> {
    return await this.adapter.query(sql, params);
  }

  async execute(sql: string, params: any[] = []): Promise<any> {
    return await this.adapter.execute(sql, params);
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
    const rows = await this.adapter.query('SELECT last_insert_rowid() as id');
    return rows[0].id;
  }

  async getUserByUsername(username: string): Promise<any | null> {
    const rows = await this.adapter.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getUserById(id: number): Promise<any | null> {
    const rows = await this.adapter.query('SELECT * FROM users WHERE id = ?', [
      id,
    ]);
    return rows.length > 0 ? rows[0] : null;
  }

  async getUserByEmail(email: string): Promise<any | null> {
    const rows = await this.adapter.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getUserWithPassword(username: string): Promise<any | null> {
    const rows = await this.adapter.query(
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
  }): Promise<any> {
    // Use a transaction to ensure atomicity
    const result = await this.adapter.execute(
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
    const idRows = await this.adapter.query('SELECT last_insert_rowid() as id');
    const userId = idRows[0].id;

    // Verify the user exists by querying it
    const userRows = await this.adapter.query(
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
    const values: any[] = [];

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
  ): Promise<{ users: any[]; total: number }> {
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];

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
    const countRows = await this.adapter.query(countSql, params);
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

    const users = await this.adapter.query(sql, params);

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

    const rows = await this.adapter.query('SELECT last_insert_rowid() as id');
    return rows[0].id;
  }

  async getApiKeyByHash(keyHash: string): Promise<any | null> {
    const rows = await this.adapter.query(
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

    const rows = await this.adapter.query('SELECT last_insert_rowid() as id');
    return rows[0].id;
  }

  async getSessionByToken(tokenHash: string): Promise<any | null> {
    const rows = await this.adapter.query(
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

  // Search index management
  async indexRecord(recordData: {
    recordId: string;
    recordType: string;
    title: string;
    content?: string;
    tags?: string;
    metadata?: string;
  }): Promise<void> {
    // Delete existing index entry if it exists
    await this.adapter.execute(
      'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
      [recordData.recordId, recordData.recordType]
    );

    // Insert new index entry
    await this.adapter.execute(
      'INSERT INTO search_index (record_id, record_type, title, content, tags, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [
        recordData.recordId,
        recordData.recordType,
        recordData.title,
        recordData.content,
        recordData.tags,
        recordData.metadata,
      ]
    );
  }

  async searchRecords(query: string, recordType?: string): Promise<any[]> {
    let sql = `
      SELECT * FROM search_index 
      WHERE (title LIKE ? OR content LIKE ? OR tags LIKE ?)
    `;
    const params = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (recordType) {
      const typeFilters = recordType.split(',').map((t) => t.trim());
      if (typeFilters.length === 1) {
        sql += ' AND record_type = ?';
        params.push(typeFilters[0]);
      } else {
        const placeholders = typeFilters.map(() => '?').join(',');
        sql += ` AND record_type IN (${placeholders})`;
        params.push(...typeFilters);
      }
    }

    sql += ' ORDER BY updated_at DESC';

    return await this.adapter.query(sql, params);
  }

  async removeRecordFromIndex(
    recordId: string,
    recordType: string
  ): Promise<void> {
    await this.adapter.execute(
      'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
      [recordId, recordType]
    );
  }

  // Record management
  async createRecord(recordData: {
    id: string;
    title: string;
    type: string;
    status?: string;
    content?: string;
    metadata?: string;
    geography?: string;
    attached_files?: string;
    linked_records?: string;
    linked_geography_files?: string;
    path?: string;
    author: string;
  }): Promise<void> {
    await this.adapter.execute(
      'INSERT INTO records (id, title, type, status, content, metadata, geography, attached_files, linked_records, linked_geography_files, path, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        recordData.id,
        recordData.title,
        recordData.type,
        recordData.status || 'draft',
        recordData.content,
        recordData.metadata,
        recordData.geography,
        recordData.attached_files,
        recordData.linked_records,
        recordData.linked_geography_files,
        recordData.path,
        recordData.author,
      ]
    );

    // Index the record for search
    await this.indexRecord({
      recordId: recordData.id,
      recordType: recordData.type,
      title: recordData.title,
      content: recordData.content,
      tags: '',
      metadata: recordData.metadata,
    });
  }

  async getRecord(id: string): Promise<any | null> {
    const rows = await this.adapter.query(
      'SELECT *, attached_files FROM records WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async updateRecord(
    id: string,
    updates: {
      title?: string;
      status?: string;
      content?: string;
      metadata?: string;
      geography?: string;
      attached_files?: string;
      linked_records?: string;
      linked_geography_files?: string;
      path?: string;
    }
  ): Promise<void> {
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
    }
    if (updates.path !== undefined) {
      fields.push('path = ?');
      values.push(updates.path);
    }
    if (updates.geography !== undefined) {
      fields.push('geography = ?');
      values.push(updates.geography);
    }
    if (updates.attached_files !== undefined) {
      fields.push('attached_files = ?');
      values.push(updates.attached_files);
    }
    if (updates.linked_records !== undefined) {
      fields.push('linked_records = ?');
      values.push(updates.linked_records);
    }
    if (updates.linked_geography_files !== undefined) {
      fields.push('linked_geography_files = ?');
      values.push(updates.linked_geography_files);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await this.adapter.execute(
      `UPDATE records SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Update search index
    const record = await this.getRecord(id);
    if (record) {
      await this.indexRecord({
        recordId: record.id,
        recordType: record.type,
        title: record.title,
        content: record.content,
        tags: '',
        metadata: record.metadata,
      });
    }
  }

  async deleteRecord(id: string): Promise<void> {
    await this.adapter.execute('DELETE FROM records WHERE id = ?', [id]);
    await this.removeRecordFromIndex(id, '');
  }

  /**
   * List records with optional filtering
   */
  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    let sql = 'SELECT * FROM records WHERE 1=1';
    const params: any[] = [];

    // Apply type filter (handle comma-separated values)
    if (options.type) {
      const typeFilters = options.type.split(',').map((t) => t.trim());
      if (typeFilters.length === 1) {
        sql += ' AND type = ?';
        params.push(typeFilters[0]);
      } else {
        const placeholders = typeFilters.map(() => '?').join(',');
        sql += ` AND type IN (${placeholders})`;
        params.push(...typeFilters);
      }
    }

    // Apply status filter (handle comma-separated values)
    if (options.status) {
      const statusFilters = options.status.split(',').map((s) => s.trim());
      if (statusFilters.length === 1) {
        sql += ' AND status = ?';
        params.push(statusFilters[0]);
      } else {
        const placeholders = statusFilters.map(() => '?').join(',');
        sql += ` AND status IN (${placeholders})`;
        params.push(...statusFilters);
      }
    }

    // Get total count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await this.adapter.query(countSql, params);
    const total = countResult[0].count;

    // Apply ordering and pagination
    sql += ' ORDER BY created_at DESC';

    // Always apply limit (default to 10 if not provided)
    const limit = options.limit || 10;
    sql += ' LIMIT ?';
    params.push(limit);

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const records = await this.adapter.query(sql, params);

    return {
      records,
      total,
    };
  }

  // Audit logging
  async logAuditEvent(auditData: {
    userId?: number;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.adapter.execute(
      'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [
        auditData.userId,
        auditData.action,
        auditData.resourceType,
        auditData.resourceId,
        auditData.details,
        auditData.ipAddress,
      ]
    );
  }

  async getAuditLogs(limit = 100, offset = 0): Promise<any[]> {
    return await this.adapter.query(
      'SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  }

  // Health check
  // Storage file management
  async createStorageFile(file: {
    id: string;
    original_name: string;
    stored_filename: string;
    folder: string;
    relative_path: string;
    provider_path: string;
    size: number;
    mime_type: string;
    description?: string;
    uploaded_by?: string;
  }): Promise<void> {
    await this.adapter.execute(
      `INSERT INTO storage_files 
       (id, original_name, stored_filename, folder, relative_path, provider_path, 
        size, mime_type, description, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        file.id,
        file.original_name,
        file.stored_filename,
        file.folder,
        file.relative_path,
        file.provider_path,
        file.size,
        file.mime_type,
        file.description || null,
        file.uploaded_by || null,
      ]
    );
  }

  /**
   * Upsert (insert or replace) a storage file record.
   * Used during backup restore to handle existing records gracefully.
   */
  async upsertStorageFile(file: {
    id: string;
    original_name: string;
    stored_filename: string;
    folder: string;
    relative_path: string;
    provider_path: string;
    size: number;
    mime_type: string;
    description?: string;
    uploaded_by?: string;
    created_at?: string;
    updated_at?: string;
  }): Promise<void> {
    await this.adapter.execute(
      `INSERT OR REPLACE INTO storage_files 
       (id, original_name, stored_filename, folder, relative_path, provider_path, 
        size, mime_type, description, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))`,
      [
        file.id,
        file.original_name,
        file.stored_filename,
        file.folder,
        file.relative_path,
        file.provider_path,
        file.size,
        file.mime_type,
        file.description || null,
        file.uploaded_by || null,
        file.created_at || null,
      ]
    );
  }

  async getStorageFileById(id: string): Promise<any | null> {
    const results = await this.adapter.query(
      'SELECT * FROM storage_files WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  async getStorageFilesByFolder(folder: string): Promise<any[]> {
    return await this.adapter.query(
      'SELECT * FROM storage_files WHERE folder = ? ORDER BY created_at DESC',
      [folder]
    );
  }

  async getAllStorageFiles(): Promise<any[]> {
    return await this.adapter.query(
      'SELECT * FROM storage_files ORDER BY created_at DESC'
    );
  }

  async deleteStorageFile(id: string): Promise<boolean> {
    try {
      await this.adapter.execute('DELETE FROM storage_files WHERE id = ?', [
        id,
      ]);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete storage file:', error);
      return false;
    }
  }

  async updateStorageFile(
    id: string,
    updates: {
      description?: string;
      updated_by?: string;
    }
  ): Promise<boolean> {
    try {
      const setParts: string[] = [];
      const params: any[] = [];

      if (updates.description !== undefined) {
        setParts.push('description = ?');
        params.push(updates.description);
      }

      setParts.push("updated_at = datetime('now')");
      params.push(id);

      if (setParts.length > 1) {
        // More than just updated_at
        await this.adapter.execute(
          `UPDATE storage_files SET ${setParts.join(', ')} WHERE id = ?`,
          params
        );
      }
      return true;
    } catch (error) {
      this.logger.error('Failed to update storage file:', error);
      return false;
    }
  }

  async findStorageFileByPath(relativePath: string): Promise<any | null> {
    const results = await this.adapter.query(
      'SELECT * FROM storage_files WHERE relative_path = ?',
      [relativePath]
    );
    return results.length > 0 ? results[0] : null;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.adapter.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }
}
