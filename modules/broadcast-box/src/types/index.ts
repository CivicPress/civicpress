/**
 * TypeScript Type Definitions for CivicPress Broadcast Box Module
 */

// ============================================================================
// Device Types
// ============================================================================

export interface BroadcastDevice {
  id: string; // UUID
  organizationId: string;
  deviceUuid: string; // From Broadcast Box enrollment
  name: string;
  roomLocation?: string;
  status: DeviceStatus;
  capabilities: DeviceCapabilities;
  config: DeviceConfig;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DeviceStatus = 'enrolled' | 'active' | 'suspended' | 'revoked';

export interface DeviceCapabilities {
  videoSources: string[];
  audioSources: string[];
  pipSupported: boolean;
  maxResolution: string;
}

export interface DeviceConfig {
  defaultVideoSource?: string;
  defaultAudioSource?: string;
  qualityPreset?: 'low' | 'standard' | 'high';
  autoStart?: boolean;
}

export interface DeviceConnection {
  deviceId: string;
  connected: boolean;
  endpoint?: 'cloud' | 'local';
  lastHeartbeat?: Date;
  state: DeviceState;
}

export interface DeviceState {
  status: 'idle' | 'recording' | 'encoding' | 'uploading';
  activeSessionId?: string;
  health: DeviceHealth;
}

export interface DeviceHealth {
  score: number; // 0-100
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: {
    memoryPercent: number;
    cpuPercent: number;
    diskPercent: number;
  };
}

// ============================================================================
// Session Types
// ============================================================================

export interface BroadcastSession {
  id: string; // UUID
  deviceId: string;
  civicpressSessionId: string; // Links to CivicPress session record
  status: SessionStatus;
  startedAt?: Date;
  stoppedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata: SessionMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionStatus =
  | 'pending'
  | 'recording'
  | 'stopping'
  | 'encoding'
  | 'uploading'
  | 'complete'
  | 'failed';

export interface SessionMetadata {
  videoSource?: string;
  audioSource?: string;
  quality?: string;
  pip?: PiPConfig;
}

export interface PiPConfig {
  enabled: boolean;
  main: string;
  pip: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

// ============================================================================
// Upload Types
// ============================================================================

export interface UploadJob {
  id: string;
  sessionId: string;
  deviceId: string;
  filePath: string; // On device
  fileName: string;
  fileSize: number;
  fileHash: string; // SHA256
  mimeType: string;
  status: UploadStatus;
  progressPercent: number;
  storageLocation?: string; // Final location in Storage Manager
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'failed';

// ============================================================================
// WebSocket Protocol Types
// ============================================================================

export interface BaseMessage {
  type: string;
  id: string; // UUID
  timestamp: string; // ISO 8601
  payload?: any;
}

// Commands (CivicPress → Broadcast Box)
export interface CommandMessage extends BaseMessage {
  type: 'command';
  action: string;
  payload: CommandPayload;
}

export interface CommandPayload {
  sessionId?: string;
  config?: DeviceConfig;
  [key: string]: any;
}

// Events (Broadcast Box → CivicPress)
export interface EventMessage extends BaseMessage {
  type: 'event';
  event: string;
  payload: EventPayload;
}

export interface EventPayload {
  sessionId?: string;
  status?: string;
  health?: DeviceHealth;
  progress?: number;
  error?: string;
  [key: string]: any;
}

// Acknowledgments
export interface AckMessage extends BaseMessage {
  type: 'ack';
  commandId: string;
  success: boolean;
  error?: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface CreateDeviceRequest {
  deviceUuid: string;
  name: string;
  roomLocation?: string;
  capabilities: DeviceCapabilities;
  config?: DeviceConfig;
}

export interface UpdateDeviceRequest {
  name?: string;
  roomLocation?: string;
  config?: DeviceConfig;
  status?: DeviceStatus;
}

export interface StartSessionRequest {
  deviceId: string;
  civicpressSessionId: string;
  metadata: SessionMetadata;
}

export interface CreateUploadRequest {
  sessionId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  mimeType: string;
}
