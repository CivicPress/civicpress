/**
 * Core SQLite table DDL — extracted from database-adapter.ts in Phase 2d
 * W2-T4. Exported as an ordered array of CREATE TABLE statements applied
 * by the adapter's initialize() flow.
 */

export const CORE_TABLE_STATEMENTS: string[] = [
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
    provider_user_id TEXT,
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    title_normalized TEXT,
    content_preview TEXT,
    word_count INTEGER,
    UNIQUE(record_id, record_type)
  )`,

  // Records table
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    workflow_state TEXT DEFAULT 'draft',
    content TEXT,
    metadata TEXT,
    geography TEXT,
    attached_files TEXT,
    linked_records TEXT,
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
    relative_path TEXT NOT NULL,
    provider_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    description TEXT,
    uploaded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Geography files table (FA-CORE-011). The markdown file on disk stays the
  // source of truth; this mirror lets DB-backed consumers (search, linked-
  // records joins) see geography rows instead of the FS being invisible to
  // them. bounds/metadata are stored as JSON TEXT.
  `CREATE TABLE IF NOT EXISTS geography_files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    srid INTEGER DEFAULT 4326,
    bounds TEXT,
    metadata TEXT,
    file_path TEXT NOT NULL,
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

  // Record drafts table (temporary until v3 collaboration)
  `CREATE TABLE IF NOT EXISTS record_drafts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    workflow_state TEXT DEFAULT 'draft',
    markdown_body TEXT,
    metadata TEXT,
    geography TEXT,
    attached_files TEXT,
    linked_records TEXT,
    linked_geography_files TEXT,
    author TEXT,
    created_by TEXT,
    last_draft_saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Record locks table (temporary until v3 collaboration). Deliberately NO
  // FK to records(id): editing locks are taken on DRAFTS, whose id exists
  // only in record_drafts until publish, so an enforced FK made draft
  // locking impossible. The table is ephemeral (locks expire); deleteRecord
  // cleans up explicitly. Existing databases are rebuilt to this shape by
  // ensureRecordLocksWithoutFk in schema/migrations.ts.
  `CREATE TABLE IF NOT EXISTS record_locks (
    record_id TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  )`,

  // Saga states table for saga pattern persistence and recovery
  `CREATE TABLE IF NOT EXISTS saga_states (
    id TEXT PRIMARY KEY,
    saga_type TEXT NOT NULL,
    saga_version TEXT,
    context TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'compensating', 'compensated')),
    current_step INTEGER DEFAULT 0,
    step_results TEXT NOT NULL DEFAULT '[]',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    error TEXT,
    compensation_status TEXT CHECK (compensation_status IN ('pending', 'executing', 'completed', 'failed', 'partial')),
    compensation_completed_at DATETIME,
    compensation_error TEXT,
    idempotency_key TEXT UNIQUE,
    correlation_id TEXT NOT NULL
  )`,

  // Saga resource locks for concurrency control
  `CREATE TABLE IF NOT EXISTS saga_resource_locks (
    resource_key TEXT PRIMARY KEY,
    saga_id TEXT NOT NULL,
    acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (saga_id) REFERENCES saga_states(id) ON DELETE CASCADE
  )`,

  // Login-attempt throttling / account lockout (FA-API-007). One row per
  // username (case-normalized): running failed-attempt count + a lockout
  // window. Cleared on a successful login.
  `CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    first_failed_at DATETIME,
    last_failed_at DATETIME,
    locked_until DATETIME
  )`,
];
