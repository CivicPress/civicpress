/**
 * TypeScript Type Definitions for CivicPress Broadcast Box Module
 */

// Export error codes
export * from './errors.js';

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
  activeSources?: ActiveSources; // Currently active sources from status messages
  pipConfig?: PiPConfiguration; // Current PiP configuration from status messages
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DeviceStatus = 'enrolled' | 'active' | 'suspended' | 'revoked';

/**
 * Source information from status message protocol
 * Matches the protocol's active_sources structure
 */
export interface SourceInfo {
  id: number; // Numeric source ID (0, 1, 2, ...)
  identifier: string; // String identifier ("hdmi1", "hdmi2", "usb_camera", etc.)
  name?: string; // Human-readable name
  path?: string; // Device path (e.g., "/dev/video0")
  resolution?: [number, number]; // [width, height] for video sources
  framerate?: number; // FPS for video sources
  available?: boolean; // Whether source is currently available
}

/**
 * Active sources from status message
 */
export interface ActiveSources {
  video: SourceInfo | null; // Currently active video source
  audio: SourceInfo | null; // Currently active audio source
}

/**
 * Video source device information (legacy, for capabilities)
 */
export interface VideoSource {
  id: number; // Numeric device ID (from protocol)
  path?: string; // Device path (e.g., "/dev/video0")
  name: string; // Human-readable device name
  resolution?: [number, number]; // [width, height]
  framerate?: number; // Frames per second
  available: boolean; // Is device plugged in and working?
}

/**
 * Audio source device information (legacy, for capabilities)
 */
export interface AudioSource {
  id: number; // Numeric device ID (from protocol)
  name: string; // Human-readable device name
  channels?: number; // Number of audio channels
  sampleRate?: number; // Sample rate in Hz
  available: boolean; // Is device plugged in and working?
}

export interface DeviceCapabilities {
  // Legacy: String arrays for backward compatibility
  videoSources: string[];
  audioSources: string[];

  // New: Detailed source objects (from protocol)
  // Use SourceInfo instead of VideoSource/AudioSource to support identifier field
  videoSourceObjects?: SourceInfo[];
  audioSourceObjects?: SourceInfo[];

  pipSupported: boolean;
  /**
   * Full PiP capability specification (from `device.connected` payload.capabilities.pip).
   * This is richer than `pipSupported` and should be used for UI constraints.
   */
  pipCapabilities?: PiPCapabilities;

  /**
   * Audio mixing capability specification (from `device.connected` payload.capabilities.audio_mixing).
   */
  audioMixingCapabilities?: AudioMixingCapabilities;

  /**
   * Hardware encoding capability specification (from `device.connected` payload.capabilities.hardware_encoding).
   */
  hardwareEncodingCapabilities?: HardwareEncodingCapabilities;

  maxResolution: string;
  maxFramerate?: number; // Maximum framerate supported
  encodingPresets?: EncodingPreset[]; // Available encoding presets
  hardwareEncoding?: boolean; // Hardware encoding support (from status messages)
}

export interface Size2D {
  width: number;
  height: number;
}

export interface PiPCapabilities {
  supported: boolean;
  maxSources?: number;
  supportedPositions?: Array<
    'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'
  >;
  minSize?: Size2D;
  maxSize?: Size2D;
}

export interface AudioMixingCapabilities {
  supported: boolean;
  maxInputs?: number;
}

export interface HardwareEncodingCapabilities {
  supported: boolean;
}

/**
 * Encoding preset configuration
 */
export interface EncodingPreset {
  name: 'low' | 'standard' | 'high';
  videoBitrate: number; // kbps
  audioBitrate: number; // kbps
  resolution: string; // e.g., "1920x1080"
  framerate: number; // FPS
}

export interface DeviceConfig {
  // Legacy: String source names
  defaultVideoSource?: string;
  defaultAudioSource?: string;

  // New: Numeric source IDs (from protocol)
  defaultVideoSourceId?: number;
  defaultAudioSourceId?: number;

  qualityPreset?: 'low' | 'standard' | 'high';
  autoStart?: boolean;

  // Advanced configuration options (from protocol)
  qualityPresets?: {
    low?: EncodingPresetConfig;
    standard?: EncodingPresetConfig;
    high?: EncodingPresetConfig;
  };
  network?: {
    bandwidthLimitMbps?: number;
    proxySupport?: boolean;
  };
  storage?: {
    bufferSizeLimit?: number;
    retentionRules?: any;
  };
}

/**
 * Encoding preset configuration details
 */
export interface EncodingPresetConfig {
  videoBitrate: number; // kbps
  audioBitrate: number; // kbps
  resolution: string; // e.g., "1920x1080"
  framerate: number; // FPS
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
  networkConnected?: boolean; // Network connectivity status from status messages
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
  // Legacy: String source names
  videoSource?: string;
  audioSource?: string;

  // New: Numeric source IDs (from protocol)
  videoSourceId?: number;
  audioSourceId?: number;

  quality?: string;
  pip?: PiPConfig;
}

/**
 * Picture-in-Picture configuration from status message protocol
 * Matches the protocol's pip structure
 */
export interface PiPConfiguration {
  /**
   * Whether PiP is supported on this device right now (from status `sources.pip.supported`).
   * If missing (older devices), treat as supported.
   */
  supported?: boolean;
  enabled: boolean; // Whether PiP is currently active
  pipSource: SourceInfo | null; // PiP source (null if disabled)
  mainSource: SourceInfo | null; // Main source (null if no active video source)
  position:
    | 'top_left'
    | 'top_right'
    | 'bottom_left'
    | 'bottom_right'
    | 'center';
  size: {
    width: number; // PiP window width in pixels
    height: number; // PiP window height in pixels
  };
}

/**
 * Legacy PiP config (for session metadata)
 */
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
  civicpressSessionId?: string; // For start_session
  config?: DeviceConfig;
  sourceType?: 'video' | 'audio' | 'pip'; // For switch_source
  sourceId?: number; // For switch_source (numeric ID from protocol)
  videoSource?: string | number; // String name or numeric ID
  audioSource?: string | number; // String name or numeric ID
  [key: string]: any;
}

// Events (Broadcast Box → CivicPress)
export interface EventMessage extends BaseMessage {
  type: 'event';
  event: string;
  payload: EventPayload;
}

export interface EventPayload {
  // Protocol format: nested event_type and event_data
  eventType?: string;
  eventData?: any;

  // Current format: flat fields
  sessionId?: string;
  status?: string;
  health?: DeviceHealth;
  progress?: number;
  error?: string;

  // device.connected event data
  deviceId?: string;
  version?: string;
  protocolVersion?: string;
  sources?: {
    video?: VideoSource[];
    audio?: AudioSource[];
  };
  capabilities?: DeviceCapabilities;
  configuration?: any;

  // status event data
  session?: {
    state?: string;
    sessionId?: string | null;
    metadata?: any;
  };
  resources?: {
    cpuPercent?: number;
    memoryPercent?: number;
    diskPercent?: number;
    healthy?: boolean;
  };
  storage?: {
    totalSizeMb?: number;
    sessionCount?: number;
  };
  upload?: {
    queueSize?: number;
    activeUploads?: number;
    totalCompleted?: number;
    totalFailed?: number;
  };
  connection?: {
    connected?: boolean;
    state?: string;
    endpoint?: string;
  };

  [key: string]: any;
}

// Acknowledgments
export interface AckMessage extends BaseMessage {
  type: 'ack';
  commandId: string;
  success: boolean;
  error?: string;
  errorCode?: string; // Standardized error code (from protocol)
  payload?: any; // Result data
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
  capabilities?: DeviceCapabilities; // Allow updating capabilities (e.g., from device.connected event)
  activeSources?: ActiveSources; // Update active sources from status messages
  pipConfig?: PiPConfiguration; // Update PiP configuration from status messages
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
