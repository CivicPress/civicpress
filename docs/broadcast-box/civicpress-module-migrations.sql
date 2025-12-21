-- Database Migrations for CivicPress Broadcast Box Module
-- 
-- Copy these migrations into: modules/broadcast-box/src/storage/migrations/
-- 
-- Supports both SQLite and PostgreSQL
-- 

-- Migration 001: Initial Schema
-- Created: 2025-01-30

-- Devices table
CREATE TABLE IF NOT EXISTS broadcast_devices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  device_uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  room_location TEXT,
  status TEXT NOT NULL CHECK(status IN ('enrolled', 'active', 'suspended', 'revoked')),
  capabilities TEXT NOT NULL, -- JSON string
  config TEXT, -- JSON string
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Recording sessions table
CREATE TABLE IF NOT EXISTS broadcast_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  civicpress_session_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'recording', 'stopping', 'encoding', 'uploading', 'complete', 'failed')),
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  metadata TEXT, -- JSON string
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES broadcast_devices(id) ON DELETE CASCADE
);

-- Upload jobs table
CREATE TABLE IF NOT EXISTS broadcast_uploads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'uploading', 'processing', 'complete', 'failed')),
  progress_percent INTEGER DEFAULT 0 CHECK(progress_percent >= 0 AND progress_percent <= 100),
  storage_location TEXT,
  error TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES broadcast_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES broadcast_devices(id) ON DELETE CASCADE
);

-- Device events/telemetry table (for audit and monitoring)
CREATE TABLE IF NOT EXISTS broadcast_device_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT, -- JSON string
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES broadcast_devices(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broadcast_devices_org ON broadcast_devices(organization_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_devices_status ON broadcast_devices(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_devices_uuid ON broadcast_devices(device_uuid);

CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_device ON broadcast_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_civicpress ON broadcast_sessions(civicpress_session_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_status ON broadcast_sessions(status);

CREATE INDEX IF NOT EXISTS idx_broadcast_uploads_session ON broadcast_uploads(session_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_uploads_device ON broadcast_uploads(device_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_uploads_status ON broadcast_uploads(status);

CREATE INDEX IF NOT EXISTS idx_broadcast_device_events_device ON broadcast_device_events(device_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_device_events_type ON broadcast_device_events(event_type);
CREATE INDEX IF NOT EXISTS idx_broadcast_device_events_created ON broadcast_device_events(created_at);

-- PostgreSQL-specific: Add JSONB support if using PostgreSQL
-- Uncomment if using PostgreSQL:
-- ALTER TABLE broadcast_devices ALTER COLUMN capabilities TYPE JSONB USING capabilities::JSONB;
-- ALTER TABLE broadcast_devices ALTER COLUMN config TYPE JSONB USING config::JSONB;
-- ALTER TABLE broadcast_sessions ALTER COLUMN metadata TYPE JSONB USING metadata::JSONB;
-- ALTER TABLE broadcast_device_events ALTER COLUMN event_data TYPE JSONB USING event_data::JSONB;

-- Migration 002: Add device connection tracking (future)
-- Created: TBD
-- 
-- CREATE TABLE IF NOT EXISTS broadcast_device_connections (
--   device_id TEXT PRIMARY KEY,
--   connected BOOLEAN NOT NULL DEFAULT FALSE,
--   endpoint TEXT,
--   last_heartbeat TIMESTAMP,
--   connection_state TEXT, -- JSON string
--   updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (device_id) REFERENCES broadcast_devices(id) ON DELETE CASCADE
-- );

