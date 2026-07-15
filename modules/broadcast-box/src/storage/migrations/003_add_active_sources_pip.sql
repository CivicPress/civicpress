-- Database Migrations for CivicPress Broadcast Box Module
-- 
-- Migration 003: Add Active Sources and PiP Configuration
-- Created: 2025-01-02
-- Supports both SQLite and PostgreSQL

-- Add active_sources column to broadcast_devices table
-- Stores currently active video/audio sources from status messages
-- JSON structure:
-- {
--   "video": { "id": 0, "identifier": "hdmi1", "name": "HDMI Input 1", "path": "/dev/video0", "resolution": [1920, 1080], "framerate": 30, "available": true } | null,
--   "audio": { "id": 0, "identifier": "hdmi1", "name": "HDMI Audio", "path": "/dev/audio0", "available": true } | null
-- }
ALTER TABLE broadcast_devices ADD COLUMN active_sources TEXT;

-- Add pip_config column to broadcast_devices table
-- Stores current Picture-in-Picture configuration from status messages
-- JSON structure:
-- {
--   "enabled": true,
--   "pipSource": { "id": 1, "identifier": "hdmi2", "name": "HDMI Input 2", ... } | null,
--   "mainSource": { "id": 0, "identifier": "hdmi1", "name": "HDMI Input 1", ... } | null,
--   "position": "top_right",
--   "size": { "width": 320, "height": 240 }
-- }
ALTER TABLE broadcast_devices ADD COLUMN pip_config TEXT;

