-- Migration 004: Device signing key (FA-BB-001 residual)
--
-- Stores the device's Ed25519 PUBLIC key (PEM/SPKI), registered once at
-- enrollment. When present, every session.manifest from the device must be
-- signed by the matching private key (which never leaves the device) — a
-- stolen bearer token alone can no longer forge capture segments.
-- Re-running is safe: the migration runner skips "duplicate column" errors.

ALTER TABLE broadcast_devices ADD COLUMN public_key TEXT;
