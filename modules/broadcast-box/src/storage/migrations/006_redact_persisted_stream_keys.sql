-- Migration 006: Redact historical RTMP stream keys (FA-BB-009)
--
-- `logCommand` used to persist the full stream.configure payload — including
-- the RTMP stream_key — into broadcast_device_events. New writes are redacted
-- in code; this scrubs the rows that already exist. Uses the JSON1 functions
-- shipped with modern SQLite; if unavailable, the runner logs and continues
-- (new writes are safe either way). Re-running is a no-op.

UPDATE broadcast_device_events
SET event_data = json_set(event_data, '$.payload.stream_key', '[REDACTED]')
WHERE event_type LIKE 'command.stream.configure.%'
  AND json_extract(event_data, '$.payload.stream_key') IS NOT NULL
  AND json_extract(event_data, '$.payload.stream_key') != '[REDACTED]';
