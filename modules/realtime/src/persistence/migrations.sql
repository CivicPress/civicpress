-- Realtime Module Database Migrations
-- Snapshot storage table

CREATE TABLE IF NOT EXISTS realtime_snapshots (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  snapshot_data BLOB NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_room_id ON realtime_snapshots(room_id);
CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_created_at ON realtime_snapshots(created_at);

