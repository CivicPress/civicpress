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
  registration_ip TEXT NULL,  -- IP that used it (for audit)
  
  -- Foreign key to devices (optional, for referential integrity)
  FOREIGN KEY (device_uuid) REFERENCES broadcast_devices(device_uuid) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_enrollment_code_hash ON broadcast_enrollment_codes(enrollment_code_hash);
CREATE INDEX IF NOT EXISTS idx_enrollment_device_uuid ON broadcast_enrollment_codes(device_uuid);
CREATE INDEX IF NOT EXISTS idx_enrollment_expires_at ON broadcast_enrollment_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_used_at ON broadcast_enrollment_codes(used_at);

