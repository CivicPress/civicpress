-- Realtime Module Database Migrations
-- Snapshot storage table
--
-- Snapshots are an EPHEMERAL merge-aid for fast reconnection; the canonical
-- durable archive is the Markdown file, NOT the snapshot (spec §3e). The extra
-- columns make snapshots integrity-checked, format-versioned, and size-aware:
--
--   integrity_hash  TEXT    — sha256 hex of snapshot_data; verified on load
--   format_version  INTEGER — SNAPSHOT_FORMAT_V1 (1); a newer value => discard
--   byte_size       INTEGER — for the MAX_SNAPSHOT_BYTES size-cap warning
--   created_at      INTEGER — unix ms; drives the SNAPSHOT_TTL_MS cleanup

CREATE TABLE IF NOT EXISTS realtime_snapshots (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  snapshot_data BLOB NOT NULL,
  version INTEGER NOT NULL,
  integrity_hash TEXT NOT NULL DEFAULT '',
  format_version INTEGER NOT NULL DEFAULT 1,
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_room_id ON realtime_snapshots(room_id);
CREATE INDEX IF NOT EXISTS realtime_snapshots_created_at_idx ON realtime_snapshots(created_at);
