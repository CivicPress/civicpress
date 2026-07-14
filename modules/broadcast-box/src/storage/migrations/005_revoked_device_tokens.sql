-- Migration 005: Device-token revocation denylist (FA-BB-006)
--
-- Token-level revocation for device bearer tokens: revoked `jti`s are
-- checked on every token validation. Rows carry the token's own expiry so
-- expired entries can be swept. Re-running is safe (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS broadcast_revoked_device_tokens (
  jti TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  revoked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_revoked_device_tokens_expires
  ON broadcast_revoked_device_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_revoked_device_tokens_device
  ON broadcast_revoked_device_tokens(device_id);
