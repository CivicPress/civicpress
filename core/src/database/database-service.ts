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
import { OperatorNotificationStore } from './stores/operator-notification-store.js';
import { MIGRATION_LEDGER_TABLE } from './schema/migrations.js';
import type {
  RecordLockRow,
  AuditLogWithUserRow,
  StorageFileRow,
  CountRow,
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
  private operatorNotifications: OperatorNotificationStore;

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
    this.operatorNotifications = new OperatorNotificationStore(this.adapter);
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

  async execute(sql: string, params: SqlParam[] = []): Promise<ExecuteResult> {
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

  async pruneUserSessions(
    ...args: Parameters<UserStore['pruneUserSessions']>
  ): ReturnType<UserStore['pruneUserSessions']> {
    return this.users.pruneUserSessions(...args);
  }

  // Password reset tokens — delegated to UserStore (auth surface)
  async createPasswordResetToken(
    ...args: Parameters<UserStore['createPasswordResetToken']>
  ): ReturnType<UserStore['createPasswordResetToken']> {
    return this.users.createPasswordResetToken(...args);
  }

  async getLivePasswordResetToken(
    ...args: Parameters<UserStore['getLivePasswordResetToken']>
  ): ReturnType<UserStore['getLivePasswordResetToken']> {
    return this.users.getLivePasswordResetToken(...args);
  }

  async consumePasswordResetToken(
    ...args: Parameters<UserStore['consumePasswordResetToken']>
  ): ReturnType<UserStore['consumePasswordResetToken']> {
    return this.users.consumePasswordResetToken(...args);
  }

  async deleteUserPasswordResetTokens(
    ...args: Parameters<UserStore['deleteUserPasswordResetTokens']>
  ): ReturnType<UserStore['deleteUserPasswordResetTokens']> {
    return this.users.deleteUserPasswordResetTokens(...args);
  }

  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    return this.users.cleanupExpiredPasswordResetTokens();
  }

  // ---------------------------------------------------------------------------
  // Operator notifications — delegated to OperatorNotificationStore

  /**
   * Apply `notifications.yml`'s `security` keys to the operator inbox:
   * redaction and at-rest encryption of `body`/`data`, plus a one-time pass
   * that seals rows written before encryption was switched on.
   */
  async configureOperatorNotificationProtection(
    ...args: Parameters<OperatorNotificationStore['configureProtection']>
  ): Promise<number> {
    this.operatorNotifications.configureProtection(...args);
    return this.operatorNotifications.migratePlaintextRows();
  }

  // ---------------------------------------------------------------------------

  async createOperatorNotification(
    ...args: Parameters<OperatorNotificationStore['create']>
  ): ReturnType<OperatorNotificationStore['create']> {
    return this.operatorNotifications.create(...args);
  }

  async listOperatorNotifications(
    ...args: Parameters<OperatorNotificationStore['list']>
  ): ReturnType<OperatorNotificationStore['list']> {
    return this.operatorNotifications.list(...args);
  }

  async getOperatorNotificationById(
    ...args: Parameters<OperatorNotificationStore['getById']>
  ): ReturnType<OperatorNotificationStore['getById']> {
    return this.operatorNotifications.getById(...args);
  }

  async countUnreadOperatorNotifications(): Promise<number> {
    return this.operatorNotifications.countUnread();
  }

  async markOperatorNotificationRead(
    ...args: Parameters<OperatorNotificationStore['markRead']>
  ): ReturnType<OperatorNotificationStore['markRead']> {
    return this.operatorNotifications.markRead(...args);
  }

  async markAllOperatorNotificationsRead(): Promise<number> {
    return this.operatorNotifications.markAllRead();
  }

  async dismissOperatorNotification(
    ...args: Parameters<OperatorNotificationStore['dismiss']>
  ): ReturnType<OperatorNotificationStore['dismiss']> {
    return this.operatorNotifications.dismiss(...args);
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

  async isFileReferencedByPublishedRecord(
    ...args: Parameters<RecordStore['isFileReferencedByPublishedRecord']>
  ): ReturnType<RecordStore['isFileReferencedByPublishedRecord']> {
    return this.records.isFileReferencedByPublishedRecord(...args);
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

  async getDocumentNumbers(
    ...args: Parameters<RecordStore['getDocumentNumbers']>
  ): ReturnType<RecordStore['getDocumentNumbers']> {
    return this.records.getDocumentNumbers(...args);
  }

  async getReservedDocumentNumbers(
    ...args: Parameters<RecordStore['getReservedDocumentNumbers']>
  ): ReturnType<RecordStore['getReservedDocumentNumbers']> {
    return this.records.getReservedDocumentNumbers(...args);
  }

  async reserveDocumentNumber(
    ...args: Parameters<RecordStore['reserveDocumentNumber']>
  ): ReturnType<RecordStore['reserveDocumentNumber']> {
    return this.records.reserveDocumentNumber(...args);
  }

  async releaseDocumentNumber(
    ...args: Parameters<RecordStore['releaseDocumentNumber']>
  ): ReturnType<RecordStore['releaseDocumentNumber']> {
    return this.records.releaseDocumentNumber(...args);
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
    // The row is (re)written only when it does not yet exist, OR the existing
    // lock has already expired, OR the existing lock is held by the SAME caller;
    // SQLite's `changes` then tells us whether WE won.
    //
    // The same-holder clause makes acquire idempotent + self-renewing: a caller
    // re-POSTing a lock it already holds succeeds (and its expiry is pushed
    // forward). The UI relies on exactly this — its lock-refresh timer re-POSTs
    // this acquire endpoint (there is no separate refresh route wired up), so
    // WITHOUT this clause every renewal 409s and the holder's own lock silently
    // lapses after `lockDurationMinutes` mid-edit. A DIFFERENT caller still loses
    // to a live lock (both conditions false → 0 changes → false), so the TOCTOU
    // guarantee is unchanged.
    //
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
       WHERE record_locks.expires_at <= ?
          OR record_locks.locked_by = excluded.locked_by`,
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
    // The activity file's fields (columns added 2026-10-02).
    source?: string;
    outcome?: string;
    message?: string;
    /** Structured details, stored as JSON. */
    metadata?: Record<string, unknown>;
    actorUsername?: string;
    actorRole?: string;
    targetName?: string;
    /** When the event happened, ISO. Defaults to the insert time. */
    occurredAt?: string;
  }): Promise<void> {
    const metadataJson = serializeMetadata(auditData.metadata);
    const createdAt = toSqliteTimestamp(auditData.occurredAt);
    const insert = (userId: number | null, details?: string) =>
      this.adapter.execute(
        `INSERT INTO audit_logs
           (user_id, action, resource_type, resource_id, details, ip_address,
            source, outcome, message, metadata, actor_username, actor_role,
            target_name${createdAt ? ', created_at' : ''})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${createdAt ? ', ?' : ''})`,
        [
          userId,
          auditData.action,
          auditData.resourceType,
          auditData.resourceId,
          details,
          auditData.ipAddress,
          auditData.source ?? null,
          auditData.outcome ?? null,
          auditData.message ?? null,
          metadataJson,
          auditData.actorUsername ?? null,
          auditData.actorRole ?? null,
          auditData.targetName ?? null,
          ...(createdAt ? [createdAt] : []),
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

  /**
   * The trail, filtered the way the Activity page asks: newest first, with
   * the total for pagination. Rows written before 2026-10-02 have no
   * `source`/`outcome`; a filter on either leaves them out, as it must.
   */
  async queryAuditLogs(
    filters: AuditLogFilters = {},
    page: { limit?: number; offset?: number } = {}
  ): Promise<{ rows: AuditLogWithUserRow[]; total: number }> {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (filters.source) {
      where.push('al.source = ?');
      params.push(filters.source);
    }
    if (filters.outcome) {
      where.push('al.outcome = ?');
      params.push(filters.outcome);
    }
    if (filters.action) {
      where.push('al.action = ?');
      params.push(filters.action);
    }
    if (filters.actor) {
      // An id or a username, as the page's actor box takes either.
      where.push(
        '(CAST(al.user_id AS TEXT) = ? OR al.actor_username = ? OR u.username = ?)'
      );
      params.push(filters.actor, filters.actor, filters.actor);
    }
    const since = toSqliteTimestamp(filters.since);
    if (since) {
      where.push('al.created_at >= ?');
      params.push(since);
    }
    const before = toSqliteTimestamp(filters.before);
    if (before) {
      where.push('al.created_at <= ?');
      params.push(before);
    }
    const from = `FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id${
      where.length ? ' WHERE ' + where.join(' AND ') : ''
    }`;
    const countRows = await this.adapter.query<CountRow>(
      `SELECT COUNT(*) as count ${from}`,
      params
    );
    const limit = Math.max(
      1,
      Math.min(1000, Number.isFinite(page.limit) ? (page.limit as number) : 100)
    );
    const offset = Math.max(
      0,
      Number.isFinite(page.offset) ? (page.offset as number) : 0
    );
    const rows = await this.adapter.query<AuditLogWithUserRow>(
      `SELECT al.*, u.username ${from} ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total: countRows[0].count };
  }

  /**
   * Bulk insert, one transaction, for the one-time import of the activity
   * file. `user_id` is kept only for users that exist, so the FOREIGN KEY
   * never fires row by row; the numeric attribution survives in `details`.
   */
  async insertAuditEntries(
    entries: Array<Parameters<DatabaseService['logAuditEvent']>[0]>
  ): Promise<number> {
    if (entries.length === 0) return 0;
    const existing = new Set(
      (await this.adapter.query<{ id: number }>('SELECT id FROM users')).map(
        (row) => row.id
      )
    );
    await this.adapter.execute('BEGIN');
    try {
      for (const entry of entries) {
        const userId =
          entry.userId != null && existing.has(entry.userId)
            ? entry.userId
            : null;
        const details =
          entry.userId != null && userId === null
            ? `${entry.details ?? ''} [detached user_id=${entry.userId}: not in users]`.trim()
            : entry.details;
        const createdAt = toSqliteTimestamp(entry.occurredAt);
        await this.adapter.execute(
          `INSERT INTO audit_logs
             (user_id, action, resource_type, resource_id, details, ip_address,
              source, outcome, message, metadata, actor_username, actor_role,
              target_name${createdAt ? ', created_at' : ''})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${createdAt ? ', ?' : ''})`,
          [
            userId,
            entry.action,
            entry.resourceType,
            entry.resourceId,
            details,
            entry.ipAddress,
            entry.source ?? null,
            entry.outcome ?? null,
            entry.message ?? null,
            serializeMetadata(entry.metadata),
            entry.actorUsername ?? null,
            entry.actorRole ?? null,
            entry.targetName ?? null,
            ...(createdAt ? [createdAt] : []),
          ]
        );
      }
      await this.adapter.execute('COMMIT');
    } catch (error) {
      await this.adapter.execute('ROLLBACK').catch(() => {});
      throw error;
    }
    return entries.length;
  }

  /** Has this one-off data migration been recorded in the schema ledger? */
  async hasDataMigration(id: string): Promise<boolean> {
    const rows = await this.adapter.query<{ id: string }>(
      `SELECT id FROM ${MIGRATION_LEDGER_TABLE} WHERE id = ?`,
      [id]
    );
    return rows.length > 0;
  }

  /** Record a one-off data migration in the schema ledger, so it never runs twice. */
  async recordDataMigration(id: string): Promise<void> {
    await this.adapter.execute(
      `INSERT OR IGNORE INTO ${MIGRATION_LEDGER_TABLE} (id, outcome) VALUES (?, 'applied')`,
      [id]
    );
  }

  /** When the first row written through the channel happened (`YYYY-MM-DD HH:MM:SS`, UTC), or null. */
  async earliestDurableAuditTimestamp(): Promise<string | null> {
    const rows = await this.adapter.query<{ first: string | null }>(
      'SELECT MIN(created_at) as first FROM audit_logs WHERE source IS NOT NULL'
    );
    return rows[0]?.first ?? null;
  }

  /** How many rows were written before the columns existed (no `source`). */
  async countLegacyAuditEntries(): Promise<number> {
    const rows = await this.adapter.query<CountRow>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE source IS NULL'
    );
    return rows[0].count;
  }

  /** How many rows the table holds at all. */
  async countAuditEntries(): Promise<number> {
    const rows = await this.adapter.query<CountRow>(
      'SELECT COUNT(*) as count FROM audit_logs'
    );
    return rows[0].count;
  }

  /** How many rows carry the fields added 2026-10-02 — none means the table has not seen a channel write since then. */
  async countDurableAuditEntries(): Promise<number> {
    const rows = await this.adapter.query<CountRow>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE source IS NOT NULL'
    );
    return rows[0].count;
  }

  async getAuditLogs(limit = 100, offset = 0): Promise<AuditLogWithUserRow[]> {
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

export interface AuditLogFilters {
  source?: string;
  outcome?: string;
  action?: string;
  /** A user id or a username. */
  actor?: string;
  /** ISO string or epoch milliseconds, inclusive. */
  since?: string | number;
  before?: string | number;
}

function serializeMetadata(
  metadata: Record<string, unknown> | undefined
): string | null {
  if (!metadata) return null;
  try {
    return JSON.stringify(metadata);
  } catch {
    return '{"unserializable":true}';
  }
}

/**
 * `audit_logs.created_at` is SQLite's `CURRENT_TIMESTAMP`: `YYYY-MM-DD HH:MM:SS`
 * in UTC. Filters and explicit timestamps are written in that shape so they
 * compare with it.
 */
function toSqliteTimestamp(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  const ms =
    typeof value === 'number'
      ? value
      : isNaN(Number(value))
        ? Date.parse(value)
        : Number(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}
