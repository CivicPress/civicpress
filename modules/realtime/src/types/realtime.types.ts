/**
 * Realtime Module Type Definitions
 *
 * TypeScript interfaces and types for the realtime module
 */

export interface RealtimeConfig {
  enabled: boolean;
  port: number;
  host: string;
  path: string;
  rooms: {
    max_rooms: number;
    cleanup_timeout: number; // seconds
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
  participants: ClientConnection[];
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

/**
 * Device connection metadata for quality tracking and prioritization
 */
export interface DeviceConnectionMetadata {
  clientId: string;
  deviceUuid: string;
  deviceId: string;
  connectedAt: number; // Timestamp when connection was established
  lastMessageAt: number; // Timestamp of last message received from device
  lastMessageFromServer: number; // Timestamp of last message sent to device
  messageCount: number; // Total messages received from device
  connectionScore: number; // Calculated quality score (higher = better)
}
