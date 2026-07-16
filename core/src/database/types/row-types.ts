/**
 * Per-table Row interfaces for the SQLite backend.
 *
 * Authored in Phase 2d W3-T3 (per-table-row-typing) to remove the
 * driver-boundary `any` default from `query<T>()`. Each interface
 * mirrors a `CREATE TABLE` in `core/src/database/schema/tables.ts`
 * (with the additive columns from `schema/migrations.ts` applied).
 *
 * Columns are typed as the JavaScript values sqlite3-node yields:
 * `TEXT` → string, `INTEGER`/`REAL` → number, `BOOLEAN` → number
 * (0/1), `DATETIME` → string (ISO-ish; rows come back as strings, not
 * Date objects).
 *
 * Nullable columns use `?: T` rather than `?: T | null`. SQLite returns
 * the literal value `null` at runtime, but TS treats the field as
 * `T | undefined`; this matches the rest of the codebase (`AuthUser`,
 * `ApiKey`, etc., which already use `?: string` for optional fields)
 * and avoids forcing a `?? undefined` rewrite at every row → domain
 * boundary. Truthiness checks (`if (x)`, `x ?? defaultVal`, `x || ''`)
 * behave identically for null and undefined, so the lie is harmless.
 * Where a SQL NULL is genuinely meaningful and a consumer must
 * distinguish it from `undefined`, the field is typed as `T | null`
 * explicitly (see `TableInfoRow.dflt_value`).
 *
 * Per-table consumers either pass the type as a generic to query —
 * `adapter.query<UserRow>(sql, params)` — or destructure the typed
 * row at the callsite.
 *
 * Saga-specific rows (`SagaStateRow`, `SagaResourceLockRow`) live with
 * their consumers (`saga/saga-state-store.ts`, `saga/resource-lock.ts`)
 * because the saga layer owns the persistence shape.
 */

import type { SqlRow } from '../database-adapter.js';

// -- Domain tables -----------------------------------------------------------

export interface UserRow extends SqlRow {
  id: number;
  username: string;
  role: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  password_hash?: string;
  auth_provider?: string;
  provider_user_id?: string;
  email_verified?: number;
  pending_email?: string;
  pending_email_token?: string;
  pending_email_expires?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApiKeyRow extends SqlRow {
  id: number;
  key_hash: string;
  user_id: number;
  name: string;
  expires_at?: string;
  created_at?: string;
}

/** `getApiKeyByHash` joins `api_keys` with `users`. */
export interface ApiKeyWithUserRow extends ApiKeyRow {
  username: string;
  role: string;
  user_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface SessionRow extends SqlRow {
  id: number;
  token_hash: string;
  user_id: number;
  expires_at: string;
  created_at?: string;
}

/** `getSessionByToken` joins `sessions` with `users`. */
export interface SessionWithUserRow extends SessionRow {
  username: string;
  role: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

export interface RecordRow extends SqlRow {
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
  author?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DraftRow extends SqlRow {
  id: string;
  title: string;
  type: string;
  status?: string;
  workflow_state?: string;
  markdown_body?: string;
  metadata?: string;
  geography?: string;
  attached_files?: string;
  linked_records?: string;
  linked_geography_files?: string;
  author?: string;
  created_by?: string;
  last_draft_saved_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StorageFileRow extends SqlRow {
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
}

export interface RecordLockRow extends SqlRow {
  record_id: string;
  locked_by: string;
  locked_at?: string;
  expires_at?: string;
}

export interface AuditLogRow extends SqlRow {
  id: number;
  user_id?: number;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: string;
  ip_address?: string;
  created_at?: string;
}

/** `getAuditLogs` joins `audit_logs` with `users` for username. */
export interface AuditLogWithUserRow extends AuditLogRow {
  username?: string;
}

export interface SearchIndexRow extends SqlRow {
  id: number;
  record_id: string;
  record_type: string;
  title: string;
  content?: string;
  tags?: string;
  metadata?: string;
  updated_at?: string;
  title_normalized?: string;
  content_preview?: string;
  word_count?: number;
}

export interface EmailVerificationRow extends SqlRow {
  id: number;
  user_id: number;
  email: string;
  token: string;
  type: 'initial' | 'change';
  expires_at: string;
  created_at?: string;
}

// -- Internal / helper rows --------------------------------------------------

/** `PRAGMA table_info(<table>)` result. */
export interface TableInfoRow extends SqlRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/** `PRAGMA index_list(<table>)` and `sqlite_master` index rows. */
export interface IndexInfoRow extends SqlRow {
  name: string;
  unique?: number;
  origin?: string;
  partial?: number;
  seq?: number;
}

/** `sqlite_master` trigger row. */
export interface TriggerInfoRow extends SqlRow {
  name: string;
  type?: string;
  tbl_name?: string;
  sql?: string;
}

/** `SELECT name FROM sqlite_master WHERE type='table' AND name=?` result. */
export interface SqliteMasterNameRow extends SqlRow {
  name: string;
}

/** `SELECT last_insert_rowid() as id` result. */
export interface LastInsertIdRow extends SqlRow {
  id: number;
}

/** `SELECT COUNT(*) as count ...` result. */
export interface CountRow extends SqlRow {
  count: number;
}

/** `SELECT COUNT(*) as total ...` result. */
export interface TotalRow extends SqlRow {
  total: number;
}
