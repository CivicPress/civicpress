import {
  DatabaseAdapter,
  DatabaseConfig,
  createDatabaseAdapter,
} from './database-adapter.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

export class DatabaseService {
  private adapter: DatabaseAdapter;
  private isConnected = false;

  constructor(config: DatabaseConfig) {
    this.adapter = createDatabaseAdapter(config);
  }

  async initialize(): Promise<void> {
    try {
      await this.adapter.connect();
      await this.adapter.initialize();
      this.isConnected = true;
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.isConnected) {
      await this.adapter.close();
      this.isConnected = false;
      logger.info('Database connection closed');
    }
  }

  // User management
  async createUser(userData: {
    username: string;
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
  }): Promise<number> {
    await this.adapter.execute(
      'INSERT INTO users (username, role, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)',
      [
        userData.username,
        userData.role,
        userData.email,
        userData.name,
        userData.avatar_url,
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
      'SELECT ak.*, u.username, u.role FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ?',
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
      'SELECT s.*, u.username, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?',
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
      sql += ' AND record_type = ?';
      params.push(recordType);
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
    path?: string;
    author: string;
  }): Promise<void> {
    await this.adapter.execute(
      'INSERT INTO records (id, title, type, status, content, metadata, path, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        recordData.id,
        recordData.title,
        recordData.type,
        recordData.status || 'draft',
        recordData.content,
        recordData.metadata,
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
      'SELECT * FROM records WHERE id = ?',
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

  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    let sql = 'SELECT * FROM records WHERE 1=1';
    const params = [];

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    // Get total count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countRows = await this.adapter.query(countSql, params);
    const total = countRows[0].count;

    // Get records with pagination
    sql += ' ORDER BY created_at DESC';
    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const records = await this.adapter.query(sql, params);

    return { records, total };
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
  async healthCheck(): Promise<boolean> {
    try {
      await this.adapter.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}
