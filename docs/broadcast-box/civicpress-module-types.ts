/**
 * TypeScript Type Definitions for CivicPress Broadcast Box Module
 *
 * Copy these types into: modules/broadcast-box/src/types/
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
  payload: any;
}

export interface StartSessionCommand {
  action: 'start_session';
  payload: {
    session_id: string;
    civicpress_session_id: string;
    config: {
      video_source?: string;
      audio_source?: string;
      quality?: string;
      pip?: PiPConfig;
    };
  };
}

export interface StopSessionCommand {
  action: 'stop_session';
  payload: {
    session_id: string;
  };
}

export interface UpdateConfigCommand {
  action: 'update_config';
  payload: {
    config: Record<string, any>;
  };
}

export interface GetStatusCommand {
  action: 'get_status';
  payload?: {};
}

// Events (Broadcast Box → CivicPress)
export interface EventMessage extends BaseMessage {
  type: 'event';
  event: string;
  payload: any;
}

export interface DeviceConnectedEvent {
  event: 'device.connected';
  payload: {
    device_id: string;
    version: string;
    capabilities: string[];
  };
}

export interface SessionStartedEvent {
  event: 'session.started';
  payload: {
    session_id: string;
    state: string;
    started_at: string;
  };
}

export interface SessionStoppedEvent {
  event: 'session.stopped';
  payload: {
    session_id: string;
    state: string;
    stopped_at: string;
  };
}

export interface SessionCompleteEvent {
  event: 'session.complete';
  payload: {
    session_id: string;
    file_path: string;
    file_size: number;
    duration_seconds: number;
    hash: string;
    completed_at: string;
  };
}

export interface UploadProgressEvent {
  event: 'upload.progress';
  payload: {
    session_id: string;
    progress: {
      bytes_uploaded: number;
      bytes_total: number;
      percent: number;
      estimated_seconds_remaining: number;
    };
  };
}

export interface UploadCompleteEvent {
  event: 'upload.complete';
  payload: {
    session_id: string;
    uploaded_at: string;
    duration_seconds: number;
  };
}

export interface HealthUpdateEvent {
  event: 'health.update';
  payload: {
    device_id: string;
    health: DeviceHealth;
  };
}

export interface DeviceErrorEvent {
  event: 'device.error';
  payload: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    error: {
      code: string;
      message: string;
    };
  };
}

// Acknowledgments
export interface AcknowledgmentMessage extends BaseMessage {
  type: 'ack';
  command_id: string;
  status: 'success' | 'error';
  payload?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Heartbeat
export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ListDevicesResponse {
  devices: BroadcastDevice[];
  pagination: Pagination;
}

export interface GetDeviceResponse {
  device: BroadcastDevice;
  connection?: DeviceConnection;
  recentSessions?: BroadcastSession[];
}

export interface CreateDeviceRequest {
  deviceUuid: string;
  enrollmentCode: string;
  name: string;
  roomLocation?: string;
}

export interface CreateDeviceResponse {
  device: BroadcastDevice;
  credentials: {
    token: string;
    expiresAt: string;
  };
}

export interface UpdateDeviceRequest {
  name?: string;
  roomLocation?: string;
  config?: Partial<DeviceConfig>;
}

export interface CreateSessionRequest {
  deviceId: string;
  civicpressSessionId: string;
  config?: {
    videoSource?: string;
    audioSource?: string;
    quality?: string;
    pip?: PiPConfig;
  };
}

export interface CreateSessionResponse {
  session: BroadcastSession;
}

export interface GetSessionResponse {
  session: BroadcastSession;
  upload?: UploadJob;
}

export interface ListSessionsResponse {
  sessions: BroadcastSession[];
  pagination: Pagination;
}

export interface CreateUploadRequest {
  sessionId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  mimeType: string;
}

export interface CreateUploadResponse {
  upload: UploadJob;
  uploadUrl: string;
}

export interface GetHealthResponse {
  health: DeviceHealth;
  connection: {
    connected: boolean;
    endpoint?: string;
    lastHeartbeat?: string;
  };
  lastUpdated: string;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export type ErrorCode =
  | 'SESSION_ALREADY_ACTIVE'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_CONFIG'
  | 'DEVICE_BUSY'
  | 'CAPTURE_ERROR'
  | 'ENCODING_ERROR'
  | 'STORAGE_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_NOT_CONNECTED'
  | 'UPLOAD_ALREADY_EXISTS'
  | 'INVALID_ENROLLMENT_CODE';

// ============================================================================
// Service Types
// ============================================================================

export interface DeviceManager {
  listDevices(filters?: DeviceFilters): Promise<BroadcastDevice[]>;
  getDevice(id: string): Promise<BroadcastDevice | null>;
  createDevice(data: CreateDeviceRequest): Promise<BroadcastDevice>;
  updateDevice(id: string, data: UpdateDeviceRequest): Promise<BroadcastDevice>;
  revokeDevice(id: string): Promise<void>;
}

export interface SessionController {
  startSession(request: CreateSessionRequest): Promise<BroadcastSession>;
  stopSession(sessionId: string): Promise<BroadcastSession>;
  getSession(sessionId: string): Promise<BroadcastSession | null>;
  listSessions(filters?: SessionFilters): Promise<BroadcastSession[]>;
}

export interface UploadProcessor {
  createUpload(request: CreateUploadRequest): Promise<UploadJob>;
  processChunk(
    uploadId: string,
    chunk: Buffer,
    chunkNumber: number
  ): Promise<void>;
  finalizeUpload(uploadId: string): Promise<string>; // Returns storage location
  getUpload(uploadId: string): Promise<UploadJob | null>;
}

export interface WebSocketHandler {
  handleConnection(deviceId: string, ws: WebSocket): Promise<void>;
  sendCommand(deviceId: string, command: CommandMessage): Promise<void>;
  handleEvent(deviceId: string, event: EventMessage): Promise<void>;
}

export interface DeviceFilters {
  status?: DeviceStatus;
  room?: string;
  organizationId?: string;
}

export interface SessionFilters {
  deviceId?: string;
  civicpressSessionId?: string;
  status?: SessionStatus;
  limit?: number;
  offset?: number;
}
