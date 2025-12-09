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
    // Query search_index and join with records table to ensure we only return published records
    // This ensures search_index doesn't contain stale or internal records
    let sql = `
      SELECT si.* FROM search_index si
      INNER JOIN records r ON si.record_id = r.id
      WHERE (si.title LIKE ? OR si.content LIKE ? OR si.tags LIKE ?)
      AND (r.workflow_state IS NULL OR r.workflow_state != ?)
    `;
    const params = [`%${query}%`, `%${query}%`, `%${query}%`, 'internal_only'];

    if (recordType) {
      const typeFilters = recordType.split(',').map((t) => t.trim());
      if (typeFilters.length === 1) {
        sql += ' AND si.record_type = ?';
        params.push(typeFilters[0]);
      } else {
        const placeholders = typeFilters.map(() => '?').join(',');
        sql += ` AND si.record_type IN (${placeholders})`;
        params.push(...typeFilters);
      }
    }

    sql += ' ORDER BY si.updated_at DESC';

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
    workflow_state?: string;
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
      'INSERT INTO records (id, title, type, status, workflow_state, content, metadata, geography, attached_files, linked_records, linked_geography_files, path, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        recordData.id,
        recordData.title,
        recordData.type,
        recordData.status || 'draft',
        recordData.workflow_state !== undefined
          ? recordData.workflow_state
          : 'draft',
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

  // Draft management
  async createDraft(draftData: {
    id: string;
    title: string;
    type: string;
    status?: string;
    workflow_state?: string;
    markdown_body?: string | null;
    metadata?: string | null;
    geography?: string | null;
    attached_files?: string | null;
    linked_records?: string | null;
    linked_geography_files?: string | null;
    author: string;
    created_by: string;
  }): Promise<void> {
    // Track if we had to add the column - if so, we may need to UPDATE after INSERT
    let columnAdded = false;

    // Ensure workflow_state column exists before inserting
    // This is critical to prevent silent failures when column doesn't exist
    try {
      // Check if table exists first
      const tableExists = await this.adapter.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='record_drafts'"
      );

      if (tableExists.length > 0) {
        // Table exists, check if column exists
        const tableInfo = await this.adapter.query(
          'PRAGMA table_info(record_drafts)'
        );
        const columnNames = tableInfo.map((col: any) => col.name);
        const hasColumn = columnNames.includes('workflow_state');

        if (!hasColumn) {
          this.logger.info(
            'workflow_state column missing in record_drafts, adding it before insert',
            {
              id: draftData.id,
              existingColumns: columnNames,
            }
          );
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
          // Verify it was added
          const verifyInfo = await this.adapter.query(
            'PRAGMA table_info(record_drafts)'
          );
          const verifyColumns = verifyInfo.map((col: any) => col.name);
          if (!verifyColumns.includes('workflow_state')) {
            throw new Error(
              'Failed to add workflow_state column to record_drafts table'
            );
          }
          this.logger.info(
            'Successfully added workflow_state column to record_drafts',
            { id: draftData.id }
          );
          // Mark that we need to UPDATE after INSERT to ensure the value is set correctly
          // (since ALTER TABLE with DEFAULT might set default value for existing rows)
          columnAdded = true;
        }
      }
      // If table doesn't exist, CREATE TABLE will include the column
    } catch (error: any) {
      // Log error but continue - if INSERT fails, we'll get a clear error
      this.logger.error(
        'Error checking/adding workflow_state column before insert',
        {
          id: draftData.id,
          error: error?.message || String(error),
        }
      );
      // Don't throw - let INSERT attempt proceed, it will fail with clear error if needed
    }

    // Attempt INSERT with workflow_state column
    try {
      await this.adapter.execute(
        'INSERT INTO record_drafts (id, title, type, status, workflow_state, markdown_body, metadata, geography, attached_files, linked_records, linked_geography_files, author, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          draftData.id,
          draftData.title,
          draftData.type,
          draftData.status || 'draft',
          draftData.workflow_state || 'draft',
          draftData.markdown_body || null,
          draftData.metadata || null,
          draftData.geography || null,
          draftData.attached_files || null,
          draftData.linked_records || null,
          draftData.linked_geography_files || null,
          draftData.author,
          draftData.created_by,
        ]
      );
    } catch (error: any) {
      // If INSERT fails due to missing column, try to add it and retry
      if (
        error?.message?.includes('no such column: workflow_state') ||
        error?.message?.includes('no column named workflow_state')
      ) {
        this.logger.warn(
          'INSERT failed due to missing workflow_state column, adding it and retrying',
          {
            id: draftData.id,
          }
        );
        try {
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
          // Retry INSERT
          await this.adapter.execute(
            'INSERT INTO record_drafts (id, title, type, status, workflow_state, markdown_body, metadata, geography, attached_files, linked_records, linked_geography_files, author, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              draftData.id,
              draftData.title,
              draftData.type,
              draftData.status || 'draft',
              draftData.workflow_state || 'draft',
              draftData.markdown_body || null,
              draftData.metadata || null,
              draftData.geography || null,
              draftData.attached_files || null,
              draftData.linked_records || null,
              draftData.linked_geography_files || null,
              draftData.author,
              draftData.created_by,
            ]
          );
          this.logger.info(
            'Successfully created draft after adding workflow_state column',
            { id: draftData.id }
          );
          columnAdded = true;
        } catch (retryError: any) {
          this.logger.error(
            'Failed to create draft even after adding workflow_state column',
            {
              id: draftData.id,
              error: retryError?.message || String(retryError),
            }
          );
          throw retryError;
        }
      } else {
        // Different error, re-throw
        throw error;
      }
    }

    // Always verify and ensure workflow_state was saved correctly if a specific non-default value was provided
    // This handles edge cases where the column might have been added with a DEFAULT
    // and the value didn't get set correctly during INSERT
    const requestedWorkflowState = draftData.workflow_state;

    // Force verification if we had to add the column OR if a non-default value was requested
    if (
      columnAdded ||
      (requestedWorkflowState && requestedWorkflowState !== 'draft')
    ) {
      try {
        // Verify the value was actually saved correctly
        const verifyRows = await this.adapter.query(
          'SELECT workflow_state FROM record_drafts WHERE id = ?',
          [draftData.id]
        );
        const savedValue = verifyRows[0]?.workflow_state;

        this.logger.debug('Verifying workflow_state after INSERT', {
          id: draftData.id,
          requested: requestedWorkflowState,
          saved: savedValue,
          columnAdded,
          matches: savedValue === requestedWorkflowState,
        });

        // If the saved value doesn't match what we intended, update it
        // This can happen if the column was added with DEFAULT 'draft' and the INSERT used the default
        if (savedValue !== requestedWorkflowState) {
          this.logger.info(
            'workflow_state value mismatch after INSERT, correcting it',
            {
              id: draftData.id,
              expected: requestedWorkflowState,
              actual: savedValue,
              columnAdded,
            }
          );
          await this.adapter.execute(
            'UPDATE record_drafts SET workflow_state = ? WHERE id = ?',
            [requestedWorkflowState, draftData.id]
          );

          // Verify the UPDATE worked
          const verifyAfterUpdate = await this.adapter.query(
            'SELECT workflow_state FROM record_drafts WHERE id = ?',
            [draftData.id]
          );
          const updatedValue = verifyAfterUpdate[0]?.workflow_state;

          if (updatedValue === requestedWorkflowState) {
            this.logger.info('Successfully corrected workflow_state value', {
              id: draftData.id,
              workflow_state: requestedWorkflowState,
            });
          } else {
            this.logger.error('Failed to verify workflow_state UPDATE', {
              id: draftData.id,
              expected: requestedWorkflowState,
              actual: updatedValue,
            });
          }
        } else {
          this.logger.debug(
            'workflow_state value correctly saved during INSERT',
            {
              id: draftData.id,
              workflow_state: savedValue,
            }
          );
        }
      } catch (verifyError: any) {
        this.logger.error(
          'Failed to verify/update workflow_state after INSERT',
          {
            id: draftData.id,
            requested: requestedWorkflowState,
            error: verifyError?.message || String(verifyError),
            stack: verifyError?.stack,
          }
        );
        // Don't throw - the INSERT succeeded, just the verification/UPDATE failed
      }
    } else {
      this.logger.debug(
        'Skipping workflow_state verification (default value or not provided)',
        {
          id: draftData.id,
          requested: requestedWorkflowState,
        }
      );
    }
  }

  async getDraft(id: string): Promise<any | null> {
    const rows = await this.adapter.query(
      'SELECT * FROM record_drafts WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    const draft = rows[0];

    // Defensive: Ensure workflow_state exists, default to 'draft' if missing
    // This handles edge cases where column might not exist despite migrations
    if (
      !('workflow_state' in draft) ||
      draft.workflow_state === null ||
      draft.workflow_state === undefined
    ) {
      // Check if column actually exists in schema
      try {
        const tableInfo = await this.adapter.query(
          'PRAGMA table_info(record_drafts)'
        );
        const hasColumn = tableInfo.some(
          (col: any) => col.name === 'workflow_state'
        );

        if (!hasColumn) {
          // Column doesn't exist - try to add it
          this.logger.warn(
            'workflow_state column missing from record_drafts, attempting migration',
            { id }
          );
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
          // Re-query to get the draft with the new column
          const updatedRows = await this.adapter.query(
            'SELECT * FROM record_drafts WHERE id = ?',
            [id]
          );
          if (updatedRows.length > 0) {
            return {
              ...updatedRows[0],
              workflow_state: updatedRows[0].workflow_state || 'draft',
            };
          }
        }
      } catch (error) {
        this.logger.error('Failed to verify/add workflow_state column', {
          id,
          error,
        });
      }

      // Return with default if column exists but value is null
      return { ...draft, workflow_state: 'draft' };
    }

    return draft;
  }

  async listDrafts(
    options: {
      type?: string;
      created_by?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ drafts: any[]; total: number }> {
    const clauses: string[] = [];
    const params: any[] = [];

    if (options.type) {
      clauses.push('type = ?');
      params.push(options.type);
    }

    if (options.created_by) {
      clauses.push('created_by = ?');
      params.push(options.created_by);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // Get total count
    const countRows = await this.adapter.query(
      `SELECT COUNT(*) as total FROM record_drafts ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Get drafts with pagination
    let query = `SELECT * FROM record_drafts ${whereClause} ORDER BY last_draft_saved_at DESC`;
    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    const rows = await this.adapter.query(query, params);

    return {
      drafts: rows,
      total,
    };
  }

  async updateDraft(
    id: string,
    updates: {
      title?: string;
      type?: string;
      status?: string;
      workflow_state?: string;
      markdown_body?: string;
      metadata?: string;
      geography?: string;
      attached_files?: string;
      linked_records?: string;
      linked_geography_files?: string;
    }
  ): Promise<void> {
    // Ensure workflow_state column exists before updating
    if (updates.workflow_state !== undefined) {
      try {
        const tableInfo = await this.adapter.query(
          'PRAGMA table_info(record_drafts)'
        );
        const hasColumn = tableInfo.some(
          (col: any) => col.name === 'workflow_state'
        );

        if (!hasColumn) {
          this.logger.warn(
            'workflow_state column missing, adding it before update',
            { id }
          );
          await this.adapter.execute(
            "ALTER TABLE record_drafts ADD COLUMN workflow_state TEXT DEFAULT 'draft'"
          );
        }
      } catch (error) {
        this.logger.warn(
          'Could not verify workflow_state column, proceeding with update',
          { id, error }
        );
      }
    }
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.workflow_state !== undefined) {
      fields.push('workflow_state = ?');
      values.push(updates.workflow_state);
    }
    if (updates.markdown_body !== undefined) {
      fields.push('markdown_body = ?');
      values.push(updates.markdown_body);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
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

    if (fields.length === 0) {
      return; // No updates to perform
    }

    // Always update last_draft_saved_at and updated_at
    fields.push('last_draft_saved_at = CURRENT_TIMESTAMP');
    fields.push('updated_at = CURRENT_TIMESTAMP');

    values.push(id);

    const sql = `UPDATE record_drafts SET ${fields.join(', ')} WHERE id = ?`;

    // Debug logging for workflow_state updates
    if (updates.workflow_state !== undefined) {
      console.log('[DatabaseService] Updating workflow_state:', {
        id,
        workflow_state: updates.workflow_state,
        sql,
        fields,
        values: values.map((v, i) => (i === values.length - 1 ? '[id]' : v)),
      });
    }

    await this.adapter.execute(sql, values);
  }

  async deleteDraft(id: string): Promise<void> {
    await this.adapter.execute('DELETE FROM record_drafts WHERE id = ?', [id]);
  }

  // Lock management
  async acquireLock(
    recordId: string,
    lockedBy: string,
    expiresAt: Date
  ): Promise<boolean> {
    // First, clean up expired locks for this record
    await this.adapter.execute(
      'DELETE FROM record_locks WHERE record_id = ? AND expires_at < CURRENT_TIMESTAMP',
      [recordId]
    );

    // Check if record is already locked
    const existingLock = await this.getLock(recordId);
    if (existingLock && existingLock.expires_at > new Date().toISOString()) {
      // Lock exists and is not expired
      return false;
    }

    // Acquire lock (INSERT OR REPLACE to handle existing expired locks)
    await this.adapter.execute(
      'INSERT OR REPLACE INTO record_locks (record_id, locked_by, expires_at) VALUES (?, ?, ?)',
      [recordId, lockedBy, expiresAt.toISOString()]
    );

    return true;
  }

  async releaseLock(recordId: string, lockedBy: string): Promise<boolean> {
    const result = await this.adapter.execute(
      'DELETE FROM record_locks WHERE record_id = ? AND locked_by = ?',
      [recordId, lockedBy]
    );
    return (result as any).changes > 0;
  }

  async getLock(recordId: string): Promise<any | null> {
    // Clean up expired locks first
    await this.adapter.execute(
      'DELETE FROM record_locks WHERE expires_at < CURRENT_TIMESTAMP'
    );

    const rows = await this.adapter.query(
      'SELECT * FROM record_locks WHERE record_id = ?',
      [recordId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async refreshLock(
    recordId: string,
    lockedBy: string,
    expiresAt: Date
  ): Promise<boolean> {
    const result = await this.adapter.execute(
      'UPDATE record_locks SET expires_at = ? WHERE record_id = ? AND locked_by = ?',
      [expiresAt.toISOString(), recordId, lockedBy]
    );
    return (result as any).changes > 0;
  }

  async updateRecord(
    id: string,
    updates: {
      title?: string;
      status?: string;
      workflow_state?: string;
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
    if (updates.workflow_state !== undefined) {
      fields.push('workflow_state = ?');
      values.push(updates.workflow_state);
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
      status?: string; // Deprecated: All records in this table are published by definition
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    let sql = 'SELECT * FROM records WHERE 1=1';
    const params: any[] = [];

    // Defensive: Filter out internal_only records (shouldn't be in records table, but just in case)
    sql += ' AND (workflow_state IS NULL OR workflow_state != ?)';
    params.push('internal_only');

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

    // Status filter is deprecated - all records in records table are published by definition
    // Keeping for backward compatibility, but it's ignored for published endpoints
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
