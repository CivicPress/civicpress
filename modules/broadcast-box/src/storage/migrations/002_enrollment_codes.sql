-- Database Migrations for CivicPress Broadcast Box Module
-- 
-- Migration 002: Enrollment Codes Table
-- Created: 2025-01-30
-- Supports both SQLite and PostgreSQL

-- Enrollment codes table
CREATE TABLE IF NOT EXISTS broadcast_enrollment_codes (
  id TEXT PRIMARY KEY,
  device_uuid TEXT NOT NULL UNIQUE,
  enrollment_code_hash TEXT NOT NULL,  -- Hashed version for storage (bcrypt)
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_by_user_id INTEGER NULL,  -- Track who generated it (future: multi-tenant)
  ip_address TEXT NULL,  -- IP that generated it (for audit)
  registration_ip TEXT NULL  -- IP that used it (for audit)

  -- NOTE: device_uuid is intentionally NOT a FOREIGN KEY. An enrollment code is a
  -- pre-registration claim credential that legitimately PRECEDES its device row:
  -- DeviceManager.enrollDevice() mints a fresh device_uuid and inserts the code
  -- BEFORE registerDevice() ever creates the broadcast_devices row. The old
  -- `FOREIGN KEY (device_uuid) REFERENCES broadcast_devices(device_uuid)` was inert
  -- until PRAGMA foreign_keys=ON (Tier-A hardening) turned it on, at which point it
  -- rejected every enroll INSERT and broke device onboarding entirely. This mirrors
  -- the deliberate no-FK pattern for broadcast_sessions.civicpress_session_id in
  -- 001_initial_schema.sql. Code lifecycle (15-min expiry + enrollment-cleanup +
  -- deleteAllByDeviceUuid) already handles the cleanup the ON DELETE CASCADE provided.
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_enrollment_code_hash ON broadcast_enrollment_codes(enrollment_code_hash);
CREATE INDEX IF NOT EXISTS idx_enrollment_device_uuid ON broadcast_enrollment_codes(device_uuid);
CREATE INDEX IF NOT EXISTS idx_enrollment_expires_at ON broadcast_enrollment_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_used_at ON broadcast_enrollment_codes(used_at);

