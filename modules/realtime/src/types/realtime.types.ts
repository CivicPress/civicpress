/**
 * Realtime Module Type Definitions
 *
 * TypeScript interfaces and types for the realtime module
 */

import type { ClientData } from './handler-registry.types.js';

export interface RealtimeConfig {
  enabled: boolean;
  port: number;
  host: string;
  path: string;
  rooms: {
    max_rooms: number;
    cleanup_timeout: number; // seconds
    // Grace window (ms) the last-client-disconnect keeps a room's Yjs state in
    // memory before finalizing (snapshot + evict). A reconnect within this window
    // reuses the in-memory room so edits survive an abrupt drop (spec §6.3).
    grace_period_ms: number;
  };
  snapshots: {
    enabled: boolean;
    interval: number; // seconds
    max_updates: number;
    storage: 'database' | 'filesystem';
  };
  rate_limiting: {
    messages_per_second: number;
    connections_per_ip: number;
    connections_per_user: number;
  };
  connection_cleanup?: {
    enabled: boolean;
    check_interval: number; // seconds, default: 60
    stale_threshold: number; // seconds, default: 600 (10 minutes)
  };
}

/** Health + metrics snapshot returned by RealtimeServer.getHealthStatus(). */
export interface RealtimeHealthStatus {
  status: 'healthy' | 'unhealthy';
  server: { listening: boolean; port: number | null; host: string | null };
  connections: { total: number; perUser: number; perIP: number };
  rooms: { total: number; maxRooms: number };
  memory?: { heapUsed: number; heapTotal: number; external: number };
  rateLimiting: { activeClients: number; messagesPerSecond: number };
}

export interface RoomConfig {
  roomId: string;
  roomType: string;
  maxClients?: number;
  cleanupTimeout?: number;
}

export interface ClientConnection {
  id: string;
  userId: string;
  username: string;
  role: string;
  roomId: string;
  connectedAt: number;
  lastActivity: number;
  permissions: {
    canEdit: boolean;
    canView: boolean;
  };
}

export interface RoomState {
  roomId: string;
  roomType: string;
  // Participants are stored as loose ClientData (id + connection metadata) — the
  // server merges authenticated identity into this at connect time. The handler
  // registry's RoomState mirrors this shape.
  participants: ClientData[];
  yjsState?: Uint8Array;
  version: number;
  createdAt: number;
  lastActivity: number;
}

export interface SnapshotMetadata {
  roomId: string;
  snapshotId: string;
  version: number;
  timestamp: number;
  size: number;
}

export interface PresenceData {
  userId: string;
  username: string;
  color: string;
  cursor?: {
    position: number;
    selection?: {
      start: number;
      end: number;
    };
  };
  idle?: boolean;
}

