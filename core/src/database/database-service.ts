/**
 * DatabaseService — thin orchestrator over four focused stores.
 *
 * Phase 2d W2-T5 decomposed this file from a 1,577-LoC monolith into
 * an orchestrator + four stores under `stores/`:
 *
 *   - DraftStore        — `record_drafts` CRUD
 *   - RecordStore       — `records` CRUD + search-index glue
 *   - UserStore         — `users` + `api_keys` + `sessions` CRUD
 *   - StorageFileStore  — `storage_files` CRUD
 *
 * The orchestrator keeps inline:
 *   - lifecycle (initialize, close, query, execute)
 *   - transactions (begin/commit/rollback)
 *   - locks (acquire/release/get/refresh)
 *   - audit (logAuditEvent, getAuditLogs)
 *   - healthCheck
 *   - adapter/searchService getters
 *
 * Every public method preserved by delegation so external consumers
 * see no signature change.
 */

import {
  DatabaseAdapter,
  DatabaseConfig,
  createDatabaseAdapter,
  SQLiteAdapter,
  SqlParam,
  ExecuteResult,
} from './database-adapter.js';
import { Logger } from '../utils/logger.js';
import * as process from 'process';
import { SearchService } from '../search/search-service.js';
import { SQLiteSearchService } from '../search/sqlite-search-service.js';
import { UnifiedCacheManager } from '../cache/unified-cache-manager.js';
import { DraftStore } from './stores/draft-store.js';
import { RecordStore } from './stores/record-store.js';
import { UserStore } from './stores/user-store.js';
import { StorageFileStore } from './stores/storage-file-store.js';
import { GeographyStore } from './stores/geography-store.js';
import type {
  RecordLockRow,
  AuditLogWithUserRow,
  StorageFileRow,
} from './types/row-types.js';

export class DatabaseService {
  private adapter: DatabaseAdapter;
  private isConnected = false;
  private logger: Logger;
  private searchService?: SearchService;
  private drafts: DraftStore;
  private records: RecordStore;
  private users: UserStore;
  private storageFiles: StorageFileStore;
  private geographyFiles: GeographyStore;

  constructor(
    config: DatabaseConfig,
    logger?: Logger,
    cacheManager?: UnifiedCacheManager
  ) {
    this.adapter = createDatabaseAdapter(config);
    this.logger = logger || new Logger();

    // Initialize search service based on adapter type
    // Note: Cache manager may not be available yet (caches registered later)
    // SQLiteSearchService will use lazy initialization
    if (this.adapter instanceof SQLiteAdapter) {
      this.searchService = new SQLiteSearchService(this.adapter, cacheManager);
    }
    // TODO: Add PostgreSQL search service when PostgresAdapter is implemented

    // Wire up focused stores
    this.drafts = new DraftStore(this.adapter, this.logger);
    this.records = new RecordStore(
      this.adapter,
      this.searchService,
      this.logger
    );
    this.users = new UserStore(this.adapter);
    this.storageFiles = new StorageFileStore(this.adapter, this.logger);
    this.geographyFiles = new GeographyStore(this.adapter, this.logger);
  }

  /**
   * Get the search service instance
   */
  getSearchService(): SearchService | undefined {
    return this.searchService;
  }

  /**
   * Get the database adapter
   */
  getAdapter(): DatabaseAdapter {
    return this.adapter;
  }

  /**
   * Begin a database transaction
   */
  async beginTransaction(): Promise<
    import('./database-adapter.js').Transaction
  > {
    return this.adapter.beginTransaction();
  }

  /**
   * Commit a database transaction
   */
  async commitTransaction(
    transaction: import('./database-adapter.js').Transaction
  ): Promise<void> {
    return this.adapter.commitTransaction(transaction);
  }

  /**
   * Rollback a database transaction
   */
  async rollbackTransaction(
    transaction: import('./database-adapter.js').Transaction
  ): Promise<void> {
    return this.adapter.rollbackTransaction(transaction);
  }

  async initialize(): Promise<void> {
    try {
      await this.adapter.connect();
      await this.adapter.initialize();
      this.isConnected = true;
      // Database initialization message logged at higher level (civic-core.ts)
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
  async query<T = unknown>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return await this.adapter.query<T>(sql, params);
  }

  async execute(
    sql: string,
    params: SqlParam[] = []
  ): Promise<ExecuteResult> {
    return await this.adapter.execute(sql, params);
  }

  // ---------------------------------------------------------------------------
  // User management — delegated to UserStore
  // ---------------------------------------------------------------------------

  async createUser(
    ...args: Parameters<UserStore['createUser']>
  ): Promise<number> {
    return this.users.createUser(...args);
  }

  async getUserByUsername(
    ...args: Parameters<UserStore['getUserByUsername']>
  ): ReturnType<UserStore['getUserByUsername']> {
    return this.users.getUserByUsername(...args);
  }

  async getUserById(
    ...args: Parameters<UserStore['getUserById']>
  ): ReturnType<UserStore['getUserById']> {
    return this.users.getUserById(...args);
  }

  async getUserByEmail(
    ...args: Parameters<UserStore['getUserByEmail']>
  ): ReturnType<UserStore['getUserByEmail']> {
    return this.users.getUserByEmail(...args);
  }

  async getUserByProvider(
    ...args: Parameters<UserStore['getUserByProvider']>
  ): ReturnType<UserStore['getUserByProvider']> {
    return this.users.getUserByProvider(...args);
  }

  async getUserWithPassword(
    ...args: Parameters<UserStore['getUserWithPassword']>
  ): ReturnType<UserStore['getUserWithPassword']> {
    return this.users.getUserWithPassword(...args);
  }

  async createUserWithPassword(
    ...args: Parameters<UserStore['createUserWithPassword']>
  ): ReturnType<UserStore['createUserWithPassword']> {
    return this.users.createUserWithPassword(...args);
  }

  async updateUser(
    ...args: Parameters<UserStore['updateUser']>
  ): Promise<boolean> {
    return this.users.updateUser(...args);
  }

  async deleteUser(
    ...args: Parameters<UserStore['deleteUser']>
  ): Promise<void> {
    return this.users.deleteUser(...args);
  }

  async listUsers(
    ...args: Parameters<UserStore['listUsers']>
  ): ReturnType<UserStore['listUsers']> {
    return this.users.listUsers(...args);
  }

  // API key management — delegated
  async createApiKey(
    ...args: Parameters<UserStore['createApiKey']>
  ): Promise<number> {
    return this.users.createApiKey(...args);
  }

  async getApiKeyByHash(
    ...args: Parameters<UserStore['getApiKeyByHash']>
  ): ReturnType<UserStore['getApiKeyByHash']> {
    return this.users.getApiKeyByHash(...args);
  }

  async deleteApiKey(
    ...args: Parameters<UserStore['deleteApiKey']>
  ): Promise<void> {
    return this.users.deleteApiKey(...args);
  }

  // Session management — delegated
  async createSession(
    ...args: Parameters<UserStore['createSession']>
  ): Promise<number> {
    return this.users.createSession(...args);
  }

  async getSessionByToken(
    ...args: Parameters<UserStore['getSessionByToken']>
  ): ReturnType<UserStore['getSessionByToken']> {
    return this.users.getSessionByToken(...args);
  }

  async deleteSession(
    ...args: Parameters<UserStore['deleteSession']>
  ): Promise<void> {
    return this.users.deleteSession(...args);
  }

  async deleteUserSessions(
    ...args: Parameters<UserStore['deleteUserSessions']>
  ): Promise<void> {
    return this.users.deleteUserSessions(...args);
  }

  async cleanupExpiredSessions(): Promise<void> {
    return this.users.cleanupExpiredSessions();
  }

  // ---------------------------------------------------------------------------
  // Search index — delegated to RecordStore
  // ---------------------------------------------------------------------------

  async indexRecord(
    ...args: Parameters<RecordStore['indexRecord']>
  ): Promise<void> {
    return this.records.indexRecord(...args);
  }

  async searchRecords(
    ...args: Parameters<RecordStore['searchRecords']>
  ): ReturnType<RecordStore['searchRecords']> {
    return this.records.searchRecords(...args);
  }

  async removeRecordFromIndex(
    ...args: Parameters<RecordStore['removeRecordFromIndex']>
  ): Promise<void> {
    return this.records.removeRecordFromIndex(...args);
  }

  // ---------------------------------------------------------------------------
  // Record management — delegated to RecordStore
  // ---------------------------------------------------------------------------

  async createRecord(
    ...args: Parameters<RecordStore['createRecord']>
  ): Promise<void> {
    return this.records.createRecord(...args);
  }

  async getRecord(
    ...args: Parameters<RecordStore['getRecord']>
  ): ReturnType<RecordStore['getRecord']> {
    return this.records.getRecord(...args);
  }

  async updateRecord(
    ...args: Parameters<RecordStore['updateRecord']>
  ): Promise<void> {
    return this.records.updateRecord(...args);
  }

  async deleteRecord(
    ...args: Parameters<RecordStore['deleteRecord']>
  ): Promise<void> {
    return this.records.deleteRecord(...args);
  }

  async listRecords(
    ...args: Parameters<RecordStore['listRecords']>
  ): ReturnType<RecordStore['listRecords']> {
    return this.records.listRecords(...args);
  }

  // ---------------------------------------------------------------------------
  // Draft management — delegated to DraftStore
  // ---------------------------------------------------------------------------

  async createDraft(
    ...args: Parameters<DraftStore['createDraft']>
  ): Promise<void> {
    return this.drafts.createDraft(...args);
  }

  async getDraft(
    ...args: Parameters<DraftStore['getDraft']>
  ): ReturnType<DraftStore['getDraft']> {
    return this.drafts.getDraft(...args);
  }

  async listDrafts(
    ...args: Parameters<DraftStore['listDrafts']>
  ): ReturnType<DraftStore['listDrafts']> {
    return this.drafts.listDrafts(...args);
  }

  async updateDraft(
    ...args: Parameters<DraftStore['updateDraft']>
  ): Promise<void> {
    return this.drafts.updateDraft(...args);
  }

  async deleteDraft(
    ...args: Parameters<DraftStore['deleteDraft']>
  ): Promise<void> {
    return this.drafts.deleteDraft(...args);
  }

  // ---------------------------------------------------------------------------
  // Lock management — kept inline (lightweight, no separate store)
  // ---------------------------------------------------------------------------

  async acquireLock(
    recordId: string,
    lockedBy: string,
    expiresAt: Date
  ): Promise<boolean> {
    // Atomic acquire in ONE statement — this closes the check-then-insert TOCTOU
    // where two callers both saw "no active lock" (getLock) and both wrote
    // (INSERT OR REPLACE), ending up with two holders of the same record lock.
    // The row is (re)written only when it does not yet exist OR the existing lock
    // has already expired; SQLite's `changes` then tells us whether WE won.
    // Compare expiry ISO-to-ISO — expires_at is stored via toISOString(), and
    // SQLite's CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS') does NOT order correctly
    // against the 'T'/'Z' ISO form (the old DELETE-by-CURRENT_TIMESTAMP was a
    // latent no-op for that reason).
    const nowIso = new Date().toISOString();
    const result = await this.adapter.execute(
      `INSERT INTO record_locks (record_id, locked_by, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(record_id) DO UPDATE SET
         locked_by = excluded.locked_by,
         expires_at = excluded.expires_at
       WHERE record_locks.expires_at <= ?`,
      [recordId, lockedBy, expiresAt.toISOString(), nowIso]
    );

    return (result.changes ?? 0) > 0;
  }

  async releaseLock(recordId: string, lockedBy: string): Promise<boolean> {
    const result = await this.adapter.execute(
      'DELETE FROM record_locks WHERE record_id = ? AND locked_by = ?',
      [recordId, lockedBy]
    );
    return (result.changes ?? 0) > 0;
  }

  async getLock(recordId: string): Promise<RecordLockRow | null> {
    // Clean up expired locks first
    await this.adapter.execute(
      'DELETE FROM record_locks WHERE expires_at < CURRENT_TIMESTAMP'
    );

    const rows = await this.adapter.query<RecordLockRow>(
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
    return (result.changes ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Storage file management — delegated to StorageFileStore
  // ---------------------------------------------------------------------------

  async createStorageFile(
    ...args: Parameters<StorageFileStore['createStorageFile']>
  ): Promise<void> {
    return this.storageFiles.createStorageFile(...args);
  }

  async upsertStorageFile(
    ...args: Parameters<StorageFileStore['upsertStorageFile']>
  ): Promise<void> {
    return this.storageFiles.upsertStorageFile(...args);
  }

  async getStorageFileById(
    ...args: Parameters<StorageFileStore['getStorageFileById']>
  ): Promise<StorageFileRow | null> {
    return this.storageFiles.getStorageFileById(...args);
  }

  async getStorageFilesByFolder(
    ...args: Parameters<StorageFileStore['getStorageFilesByFolder']>
  ): Promise<StorageFileRow[]> {
    return this.storageFiles.getStorageFilesByFolder(...args);
  }

  async getAllStorageFiles(): Promise<StorageFileRow[]> {
    return this.storageFiles.getAllStorageFiles();
  }

  async deleteStorageFile(
    ...args: Parameters<StorageFileStore['deleteStorageFile']>
  ): Promise<boolean> {
    return this.storageFiles.deleteStorageFile(...args);
  }

  async updateStorageFile(
    ...args: Parameters<StorageFileStore['updateStorageFile']>
  ): Promise<boolean> {
    return this.storageFiles.updateStorageFile(...args);
  }

  async findStorageFileByPath(
    ...args: Parameters<StorageFileStore['findStorageFileByPath']>
  ): Promise<StorageFileRow | null> {
    return this.storageFiles.findStorageFileByPath(...args);
  }

  // ---------------------------------------------------------------------------
  // Geography file mirror (FA-CORE-011) — delegated to GeographyStore
  // ---------------------------------------------------------------------------

  async upsertGeographyFile(
    ...args: Parameters<GeographyStore['upsertGeographyFile']>
  ): Promise<void> {
    return this.geographyFiles.upsertGeographyFile(...args);
  }

  async deleteGeographyFile(
    ...args: Parameters<GeographyStore['deleteGeographyFile']>
  ): Promise<void> {
    return this.geographyFiles.deleteGeographyFile(...args);
  }

  async getGeographyFileRow(
    ...args: Parameters<GeographyStore['getGeographyFile']>
  ): Promise<Record<string, unknown> | null> {
    return this.geographyFiles.getGeographyFile(...args);
  }

  async listGeographyFileRows(): Promise<Record<string, unknown>[]> {
    return this.geographyFiles.listGeographyFiles();
  }

  // ---------------------------------------------------------------------------
  // Audit logging — kept inline
  // ---------------------------------------------------------------------------

  async logAuditEvent(auditData: {
    userId?: number;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: string;
    ipAddress?: string;
  }): Promise<void> {
    const insert = (userId: number | null, details?: string) =>
      this.adapter.execute(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
        [
          userId,
          auditData.action,
          auditData.resourceType,
          auditData.resourceId,
          details,
          auditData.ipAddress,
        ]
      );

    try {
      await insert(auditData.userId ?? null, auditData.details);
    } catch (error) {
      // audit_logs is append-only history; its user_id FK (declared with no
      // ON DELETE action, and unchangeable on existing databases without a
      // table rebuild) must not abort the business operation or lose the
      // audit row when the actor's user row is absent — a user deleted
      // mid-flight, or a synthetic actor in tests. Keep the row, detach the
      // reference, and preserve the numeric attribution in details.
      const message = error instanceof Error ? error.message : String(error);
      if (auditData.userId != null && /FOREIGN KEY/i.test(message)) {
        await insert(
          null,
          `${auditData.details ?? ''} [detached user_id=${auditData.userId}: not in users]`.trim()
        );
        return;
      }
      throw error;
    }
  }

  async getAuditLogs(
    limit = 100,
    offset = 0
  ): Promise<AuditLogWithUserRow[]> {
    return await this.adapter.query<AuditLogWithUserRow>(
      'SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  }

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

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
