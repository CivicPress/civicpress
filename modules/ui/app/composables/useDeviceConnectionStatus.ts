/**
 * Device Connection Status Composable
 *
 * Manages real-time WebSocket connections to device rooms for monitoring
 * device connection status. Only connects when needed (list/detail pages).
 */

import { ref, computed, onUnmounted, watch, type Ref } from 'vue';
import { useAuthStore } from '~/stores/auth';
import type {
  SourceInfo,
  ActiveSources,
  PiPConfiguration,
} from './broadcast-box-types';

export interface DeviceConnectionStatus {
  connected: boolean;
  lastSeenAt?: string;
  state?: 'idle' | 'recording' | 'encoding' | 'uploading';
  sessionId?: string | null;
  health?: {
    score: number;
    status?: 'healthy' | 'degraded' | 'unhealthy';
    metrics: {
      cpuPercent: number;
      memoryPercent: number;
      diskPercent: number;
    };
    networkConnected?: boolean; // Network connectivity status
  };
  activeSources?: ActiveSources; // Currently active sources
  pip?: PiPConfiguration; // Current PiP configuration
  capabilities?: {
    videoSources?: string[];
    audioSources?: string[];
    videoSourceObjects?: any[];
    audioSourceObjects?: any[];
    pipSupported?: boolean;
    pipCapabilities?: {
      supported: boolean;
      maxSources?: number;
      supportedPositions?: Array<
        'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'
      >;
      minSize?: { width: number; height: number };
      maxSize?: { width: number; height: number };
    };
    audioMixingCapabilities?: {
      supported: boolean;
      maxInputs?: number;
    };
    hardwareEncodingCapabilities?: {
      supported: boolean;
    };
    maxResolution?: string;
    hardwareEncoding?: boolean;
    /** Quality presets and defaults from device.connected / status */
    quality?: {
      presets: Array<{
        name: string;
        videoBitrateKbps: number;
        audioBitrateKbps: number;
        resolution: [number, number];
        framerate: number;
      }>;
      defaults?: { preview?: string; streaming?: string; recording?: string };
    };
  }; // Capabilities extracted from status messages and device.connected events
  manualRecording?: {
    isRecording: boolean;
    recordingId: string | null;
    startedAt: string | null;
    filePath: string | null;
  };
  /** RTMP streaming status from streaming.rtmp.* events */
  streaming?: {
    active: boolean;
    platform?: string;
    url?: string;
    quality?: string;
    error?: string;
    retryCount?: number;
  };
}

const deviceStatuses = ref<Map<string, DeviceConnectionStatus>>(new Map());
const activeConnections = ref<Map<string, WebSocket>>(new Map());
const connectingDevices = ref<Set<string>>(new Set()); // Track devices currently connecting
const connectionRetries = ref<Map<string, number>>(new Map()); // Track retry counts
// Reference counting: track how many components are subscribed to each device
const connectionRefCounts = ref<Map<string, number>>(new Map());
const config = useRuntimeConfig();

// Maximum retry attempts before giving up
const MAX_RETRY_ATTEMPTS = 3;
// Delay between retries (exponential backoff: 1s, 2s, 4s)
const RETRY_DELAYS = [1000, 2000, 4000];

/**
 * Get realtime server WebSocket URL
 */
function getRealtimeUrl(): string {
  // Extract host from API URL (e.g., http://localhost:3000 -> ws://localhost:3001)
  const apiUrl = config.public.civicApiUrl || 'http://localhost:3000';
  const url = new URL(apiUrl);
  // Realtime server runs on port 3001
  return `ws://${url.hostname}:3001`;
}

/**
 * Connect to a device room as an observer
 */
// Track pending connection promises to share them across concurrent calls
const pendingConnections = new Map<string, Promise<WebSocket | null>>();

async function connectToDeviceRoom(
  deviceUuid: string
): Promise<WebSocket | null> {
  // Check if already connected
  const existingConnection = activeConnections.value.get(deviceUuid);
  if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
    // Increment ref count for existing connection
    const currentRefCount = connectionRefCounts.value.get(deviceUuid) || 0;
    connectionRefCounts.value.set(deviceUuid, currentRefCount + 1);
    console.log(
      `[DeviceConnectionStatus] Reusing existing connection for ${deviceUuid}, ref count: ${currentRefCount} -> ${currentRefCount + 1}`
    );
    // Connection already exists and has message handler - don't attach another one
    return existingConnection;
  }

  // Check retry count
  const retryCount = connectionRetries.value.get(deviceUuid) || 0;
  if (retryCount >= MAX_RETRY_ATTEMPTS) {
    console.warn(
      `[DeviceConnectionStatus] Max retry attempts reached for device ${deviceUuid}, giving up`
    );
    return null;
  }

  const authStore = useAuthStore();
  if (!authStore.isAuthenticated || !authStore.token) {
    console.warn(
      '[DeviceConnectionStatus] Not authenticated, cannot connect to device room'
    );
    return null;
  }

  // CRITICAL: Check if already connecting - reuse the pending promise
  // This MUST be the FIRST check (after auth/retry) to prevent race conditions
  // where multiple concurrent calls all create their own promises/WebSockets
  const pendingConnection = pendingConnections.get(deviceUuid);
  if (pendingConnection) {
    console.log(
      `[DeviceConnectionStatus] Reusing pending connection promise for ${deviceUuid}`
    );
    // Increment ref count for pending connection
    const currentRefCount = connectionRefCounts.value.get(deviceUuid) || 0;
    connectionRefCounts.value.set(deviceUuid, currentRefCount + 1);
    return pendingConnection;
  }

  // Double-check using connectingDevices Set as additional safety
  if (connectingDevices.value.has(deviceUuid)) {
    // This shouldn't happen if pendingConnections check worked correctly
    console.warn(
      `[DeviceConnectionStatus] Already connecting to device room: ${deviceUuid} (race condition detected)`
    );
    // Wait a tiny bit and check pendingConnections again
    await new Promise((resolve) => setTimeout(resolve, 10));
    const retryPendingConnection = pendingConnections.get(deviceUuid);
    if (retryPendingConnection) {
      return retryPendingConnection;
    }
    return null;
  }

  // Mark as connecting - do this BEFORE creating the promise to prevent race conditions
  connectingDevices.value.add(deviceUuid);

  const token = authStore.token; // TypeScript now knows this is string (not null)
  const realtimeUrl = getRealtimeUrl();
  const wsUrl = `${realtimeUrl}/realtime/devices/${deviceUuid}`;

  // Create connection promise - we'll store it IMMEDIATELY after creation
  // The Promise constructor runs synchronously, so this executes immediately
  let connectionResolve: ((ws: WebSocket | null) => void) | null = null;
  let connectionReject: ((error: any) => void) | null = null;

  const connectionPromise = new Promise<WebSocket | null>((resolve, reject) => {
    connectionResolve = resolve;
    connectionReject = reject;

    try {
      // Use subprotocol for authentication (browser-compatible)
      // The realtime server extracts the token from the Sec-WebSocket-Protocol header
      const ws = new WebSocket(wsUrl, token);

      ws.onopen = () => {
        console.log(
          `[DeviceConnectionStatus] Connected to device room: ${deviceUuid}`
        );

        // Check if another connection was established first (race condition protection)
        const existingConnection = activeConnections.value.get(deviceUuid);
        if (
          existingConnection &&
          existingConnection !== ws &&
          existingConnection.readyState === WebSocket.OPEN
        ) {
          // Another connection was established first, close this duplicate
          console.warn(
            `[DeviceConnectionStatus] Duplicate connection detected for ${deviceUuid}, closing duplicate`
          );
          ws.close(1000, 'Duplicate connection');
          // Resolve with the existing connection instead of this duplicate
          if (connectionResolve) {
            connectionResolve(existingConnection);
          }
          return;
        }

        activeConnections.value.set(deviceUuid, ws);
        connectingDevices.value.delete(deviceUuid);
        // Don't delete from pendingConnections here - let finally() handle it
        connectionRetries.value.delete(deviceUuid); // Reset retry count on success

        // Initialize ref count for new connection (starts at 1 for the component that initiated it)
        const currentRefCount = connectionRefCounts.value.get(deviceUuid) || 0;
        connectionRefCounts.value.set(deviceUuid, currentRefCount + 1);
        console.log(
          `[DeviceConnectionStatus] New connection established for ${deviceUuid}, ref count: ${currentRefCount} -> ${currentRefCount + 1}`
        );

        if (connectionResolve) {
          connectionResolve(ws);
        }
      };

      // Set message handler once per WebSocket instance
      // This handler will only be attached to one WebSocket per device
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Debug: log all messages to help diagnose issues
          console.log(
            `[DeviceConnectionStatus] Message received for ${deviceUuid}:`,
            message.type,
            message.event || message.action || 'no event/action',
            message
          );

          // Handle connection acknowledgment
          // Note: This only means the observer connected, not that the device is connected
          if (
            message.type === 'control' &&
            message.event === 'connection.ack'
          ) {
            console.log(
              `[DeviceConnectionStatus] Observer connection acknowledged: ${deviceUuid}`
            );
            // Don't set connected=true here - wait for device.connected event
          }

          // Helper function to extract and map health data
          const extractHealthData = (payload: any) => {
            if (!payload?.health) return undefined;
            const deviceHealth = payload.health;
            return {
              score: deviceHealth.score ?? 100,
              status: deviceHealth.status || 'healthy',
              metrics: {
                cpuPercent: deviceHealth.metrics?.cpuPercent ?? 0,
                memoryPercent: deviceHealth.metrics?.memoryPercent ?? 0,
                diskPercent: deviceHealth.metrics?.diskPercent ?? 0,
              },
              networkConnected:
                deviceHealth.network_connected ??
                deviceHealth.networkConnected ??
                true,
            };
          };

          // Handle device status messages (response to get_status command)
          if (message.type === 'status') {
            const payload = message.payload;
            const health = extractHealthData(payload);

            // Extract capabilities from sources (if available)
            // The device sends sources.video and sources.audio arrays with detailed source info
            // We need to convert these to capabilities format for the UI
            let capabilitiesUpdate: any = undefined;
            let videoSourceObjects: any[] = [];
            let audioSourceObjects: any[] = [];

            if (payload.sources) {
              const videoSources: string[] = [];
              const audioSources: string[] = [];

              // Extract video sources
              if (Array.isArray(payload.sources.video)) {
                payload.sources.video.forEach((source: any) => {
                  if (source.identifier) {
                    videoSources.push(source.identifier);
                    videoSourceObjects.push({
                      id: source.id,
                      identifier: source.identifier,
                      name: source.name || source.identifier,
                      path: source.path,
                      resolution: source.resolution,
                    });
                  }
                });
              }

              // Extract audio sources
              if (Array.isArray(payload.sources.audio)) {
                payload.sources.audio.forEach((source: any) => {
                  if (source.identifier) {
                    audioSources.push(source.identifier);
                    audioSourceObjects.push({
                      id: source.id,
                      identifier: source.identifier,
                      name: source.name || source.identifier,
                      channels: source.channels,
                      sample_rate: source.sample_rate,
                    });
                  }
                });
              }

              if (videoSources.length > 0 || audioSources.length > 0) {
                capabilitiesUpdate = {
                  videoSources,
                  audioSources,
                  videoSourceObjects,
                  audioSourceObjects,
                  // Preserve other capability fields if they exist
                  pipSupported:
                    payload.sources?.pip?.supported !== undefined
                      ? Boolean(payload.sources.pip.supported)
                      : payload.capabilities?.pipSupported,
                  maxResolution: payload.capabilities?.maxResolution,
                  hardwareEncoding:
                    payload.resources?.healthy !== undefined ? true : undefined,
                };
              }
            }

            // Helper to enrich source object from source objects arrays if it only has id/identifier
            const enrichSource = (
              source: any,
              sourceObjects: any[],
              sourceType: 'video' | 'audio'
            ): any => {
              if (!source) return null;

              // If source already has full info (name, path, etc.), use it as-is
              if (source.name || source.path) {
                return source;
              }

              // Otherwise, look up full source object from source objects array
              if (source.id !== undefined && sourceObjects.length > 0) {
                const fullSource = sourceObjects.find(
                  (s: any) => s.id === source.id
                );
                if (fullSource) {
                  // Merge: use identifier from status if provided, otherwise from source objects
                  return {
                    id: fullSource.id,
                    identifier:
                      source.identifier ||
                      fullSource.identifier ||
                      fullSource.name,
                    name:
                      fullSource.name ||
                      source.identifier ||
                      fullSource.identifier,
                    path: fullSource.path,
                    resolution: fullSource.resolution,
                    framerate: fullSource.framerate,
                    available: fullSource.available !== false,
                  };
                }
              }

              // If we have identifier but no full object, try to find by identifier
              if (source.identifier && sourceObjects.length > 0) {
                const fullSource = sourceObjects.find(
                  (s: any) =>
                    s.identifier === source.identifier ||
                    s.name === source.identifier
                );
                if (fullSource) {
                  return {
                    id: fullSource.id,
                    identifier: fullSource.identifier || source.identifier,
                    name: fullSource.name || source.identifier,
                    path: fullSource.path,
                    resolution: fullSource.resolution,
                    framerate: fullSource.framerate,
                    available: fullSource.available !== false,
                  };
                }
              }

              // If we can't enrich, return what we have (at least id and identifier)
              return source;
            };

            // Extract active sources.
            // Devices may send any of these formats:
            // - payload.active_sources (full objects)
            // - payload.active (id + identifier only)
            // - payload.sources.active (nested under sources, used by current Broadcast Box status payloads)
            const activeSourcesPayload =
              payload.active_sources ||
              payload.active ||
              payload.sources?.active;
            let activeSources: ActiveSources | undefined = undefined;

            if (activeSourcesPayload !== undefined) {
              // Enrich incomplete source objects using source objects from payload.sources
              const activeVideo = activeSourcesPayload.video
                ? enrichSource(
                    activeSourcesPayload.video,
                    videoSourceObjects,
                    'video'
                  )
                : null;

              const activeAudio = activeSourcesPayload.audio
                ? enrichSource(
                    activeSourcesPayload.audio,
                    audioSourceObjects,
                    'audio'
                  )
                : null;

              activeSources = {
                video: activeVideo,
                audio: activeAudio,
              };
            }

            // Extract PiP configuration (new devices nest it under payload.sources.pip)
            const pipPayload = payload.pip || payload.sources?.pip;
            const pip: PiPConfiguration | undefined = pipPayload
              ? {
                  supported:
                    pipPayload.supported !== undefined
                      ? Boolean(pipPayload.supported)
                      : true,
                  enabled: pipPayload.enabled || false,
                  pipSource: (() => {
                    const value = pipPayload.pip_source;
                    if (!value) return null;
                    if (typeof value === 'string') {
                      const match = videoSourceObjects.find(
                        (s: any) =>
                          s.identifier === value ||
                          s.identifier?.toLowerCase?.() ===
                            value.toLowerCase() ||
                          s.name === value ||
                          s.name?.toLowerCase?.() === value.toLowerCase()
                      );
                      return (
                        match || {
                          id: -1,
                          identifier: value,
                          name: value,
                          available: true,
                        }
                      );
                    }
                    // If device sends an object, try to enrich it
                    if (typeof value === 'object') {
                      return enrichSource(value, videoSourceObjects, 'video');
                    }
                    return null;
                  })(),
                  mainSource: (() => {
                    const value = pipPayload.main_source;
                    if (!value) return null;
                    if (typeof value === 'string') {
                      const match = videoSourceObjects.find(
                        (s: any) =>
                          s.identifier === value ||
                          s.identifier?.toLowerCase?.() ===
                            value.toLowerCase() ||
                          s.name === value ||
                          s.name?.toLowerCase?.() === value.toLowerCase()
                      );
                      return (
                        match || {
                          id: -1,
                          identifier: value,
                          name: value,
                          available: true,
                        }
                      );
                    }
                    if (typeof value === 'object') {
                      return enrichSource(value, videoSourceObjects, 'video');
                    }
                    return null;
                  })(),
                  position: pipPayload.position || 'top_right',
                  // pipSize: single number (e.g. 0.25). Legacy status may send size as { width, height }; prefer pip_size or numeric size.
                  size: (() => {
                    const v = pipPayload.pip_size ?? pipPayload.size;
                    if (typeof v === 'number') return v;
                    if (
                      v &&
                      typeof v === 'object' &&
                      'width' in v &&
                      'height' in v
                    )
                      return v as { width: number; height: number };
                    return 0.25;
                  })(),
                }
              : undefined;

            // Map state: "capturing" → "recording" to match internal state enum
            let deviceState:
              | 'idle'
              | 'recording'
              | 'encoding'
              | 'uploading'
              | undefined;
            const rawState = payload?.state || payload?.session?.state;
            if (rawState) {
              deviceState =
                rawState === 'idle'
                  ? 'idle'
                  : rawState === 'capturing'
                    ? 'recording' // Map capturing → recording
                    : rawState === 'recording'
                      ? 'recording'
                      : rawState === 'encoding'
                        ? 'encoding'
                        : rawState === 'uploading'
                          ? 'uploading'
                          : undefined;
            }

            console.log(
              `[DeviceConnectionStatus] Status message received for ${deviceUuid}:`,
              {
                health,
                state: deviceState,
                hasActiveSources: !!activeSources,
                hasPiP: !!pip,
                hasCapabilities: !!capabilitiesUpdate,
                videoSourcesCount:
                  capabilitiesUpdate?.videoSources?.length || 0,
                audioSourcesCount:
                  capabilitiesUpdate?.audioSources?.length || 0,
              }
            );

            // Convert timestamp to ISO string if it's a number (Unix timestamp)
            let lastSeenAt: string;
            if (message.timestamp) {
              if (typeof message.timestamp === 'number') {
                // Unix timestamp (seconds) - convert to ISO string
                lastSeenAt = new Date(message.timestamp * 1000).toISOString();
              } else if (typeof message.timestamp === 'string') {
                lastSeenAt = message.timestamp;
              } else {
                lastSeenAt = new Date().toISOString();
              }
            } else {
              lastSeenAt = new Date().toISOString();
            }

            // Build update object, only including defined values
            const statusUpdate: Partial<DeviceConnectionStatus> = {
              connected: true,
              lastSeenAt,
              state: deviceState || 'idle',
              sessionId:
                payload?.session_id ||
                payload?.session?.session_id ||
                payload?.active_session?.session_id ||
                null,
              health,
            };

            // Only update activeSources if we actually have data (don't overwrite with undefined)
            if (activeSources !== undefined) {
              statusUpdate.activeSources = activeSources;
            }

            // Only update pip if we have data
            if (pip !== undefined) {
              statusUpdate.pip = pip;
            }

            // Only update capabilities if we have data
            if (capabilitiesUpdate !== undefined) {
              statusUpdate.capabilities = capabilitiesUpdate;
            }

            updateDeviceStatus(deviceUuid, statusUpdate);
          }

          // Handle health.update events
          if (message.type === 'event' && message.event === 'health.update') {
            const payload = message.payload;
            const health = extractHealthData(payload);
            console.log(
              `[DeviceConnectionStatus] Health update received for ${deviceUuid}:`,
              health
            );
            // Convert timestamp to ISO string if it's a number (Unix timestamp)
            let lastSeenAt: string;
            if (message.timestamp) {
              if (typeof message.timestamp === 'number') {
                // Unix timestamp (seconds) - convert to ISO string
                lastSeenAt = new Date(message.timestamp * 1000).toISOString();
              } else if (typeof message.timestamp === 'string') {
                lastSeenAt = message.timestamp;
              } else {
                lastSeenAt = new Date().toISOString();
              }
            } else {
              lastSeenAt = new Date().toISOString();
            }

            updateDeviceStatus(deviceUuid, {
              connected: true,
              lastSeenAt,
              health,
            });
          }

          // Handle device connection events
          // Device sends: type: 'event', event: 'device.connected' with capabilities
          // Server sends: type: 'control', event: 'device.connected' (no capabilities)
          if (
            (message.type === 'control' || message.type === 'event') &&
            message.event === 'device.connected'
          ) {
            console.log(
              `[DeviceConnectionStatus] Device connected: ${deviceUuid}`,
              message.type === 'event'
                ? '(with capabilities)'
                : '(server notification)'
            );

            const statusUpdate: Partial<DeviceConnectionStatus> = {
              connected: true,
            };

            // Extract capabilities and sources from device-sent event (type: 'event')
            if (message.type === 'event' && message.payload) {
              const payload = message.payload;
              let capabilitiesUpdate: any = undefined;

              // Extract structured capabilities from payload.capabilities
              if (
                payload.capabilities &&
                typeof payload.capabilities === 'object'
              ) {
                const caps = payload.capabilities;
                capabilitiesUpdate = { ...capabilitiesUpdate };

                // PiP capabilities: object (new) or boolean (legacy)
                const pipCap = caps.pip;
                if (pipCap !== undefined) {
                  if (typeof pipCap === 'object' && pipCap !== null) {
                    capabilitiesUpdate.pipCapabilities = {
                      supported: Boolean(pipCap.supported),
                      maxSources:
                        typeof pipCap.max_sources === 'number'
                          ? pipCap.max_sources
                          : undefined,
                      supportedPositions: Array.isArray(
                        pipCap.supported_positions
                      )
                        ? pipCap.supported_positions
                        : undefined,
                      minSize:
                        pipCap.min_size &&
                        typeof pipCap.min_size.width === 'number' &&
                        typeof pipCap.min_size.height === 'number'
                          ? {
                              width: pipCap.min_size.width,
                              height: pipCap.min_size.height,
                            }
                          : undefined,
                      maxSize:
                        pipCap.max_size &&
                        typeof pipCap.max_size.width === 'number' &&
                        typeof pipCap.max_size.height === 'number'
                          ? {
                              width: pipCap.max_size.width,
                              height: pipCap.max_size.height,
                            }
                          : undefined,
                    };
                    capabilitiesUpdate.pipSupported = Boolean(pipCap.supported);
                  } else if (typeof pipCap === 'boolean') {
                    capabilitiesUpdate.pipCapabilities = { supported: pipCap };
                    capabilitiesUpdate.pipSupported = pipCap;
                  }
                }

                // Audio mixing capabilities
                const audioMixingCap = caps.audio_mixing;
                if (audioMixingCap !== undefined) {
                  if (
                    typeof audioMixingCap === 'object' &&
                    audioMixingCap !== null
                  ) {
                    capabilitiesUpdate.audioMixingCapabilities = {
                      supported: Boolean(audioMixingCap.supported),
                      maxInputs:
                        typeof audioMixingCap.max_inputs === 'number'
                          ? audioMixingCap.max_inputs
                          : undefined,
                    };
                  } else if (typeof audioMixingCap === 'boolean') {
                    capabilitiesUpdate.audioMixingCapabilities = {
                      supported: audioMixingCap,
                    };
                  }
                }

                // Hardware encoding capabilities: object (new) or boolean (legacy)
                const hwEncCap = caps.hardware_encoding;
                if (hwEncCap !== undefined) {
                  if (typeof hwEncCap === 'object' && hwEncCap !== null) {
                    capabilitiesUpdate.hardwareEncodingCapabilities = {
                      supported: Boolean(hwEncCap.supported),
                    };
                    capabilitiesUpdate.hardwareEncoding = Boolean(
                      hwEncCap.supported
                    );
                  } else if (typeof hwEncCap === 'boolean') {
                    capabilitiesUpdate.hardwareEncodingCapabilities = {
                      supported: hwEncCap,
                    };
                    capabilitiesUpdate.hardwareEncoding = hwEncCap;
                  }
                }

                // Quality presets and defaults (capabilities.quality)
                const qualityCap = caps.quality;
                if (
                  qualityCap != null &&
                  typeof qualityCap === 'object' &&
                  Array.isArray(qualityCap.presets)
                ) {
                  const presets: Array<{
                    name: string;
                    videoBitrateKbps: number;
                    audioBitrateKbps: number;
                    resolution: [number, number];
                    framerate: number;
                  }> = [];
                  for (const p of qualityCap.presets) {
                    if (
                      p &&
                      typeof p.name === 'string' &&
                      typeof (p.video_bitrate_kbps ?? p.videoBitrateKbps) ===
                        'number' &&
                      typeof (p.audio_bitrate_kbps ?? p.audioBitrateKbps) ===
                        'number' &&
                      Array.isArray(p.resolution) &&
                      p.resolution.length === 2 &&
                      typeof p.resolution[0] === 'number' &&
                      typeof p.resolution[1] === 'number' &&
                      typeof p.framerate === 'number'
                    ) {
                      presets.push({
                        name: p.name,
                        videoBitrateKbps:
                          p.video_bitrate_kbps ?? p.videoBitrateKbps,
                        audioBitrateKbps:
                          p.audio_bitrate_kbps ?? p.audioBitrateKbps,
                        resolution: [p.resolution[0], p.resolution[1]],
                        framerate: p.framerate,
                      });
                    }
                  }
                  if (presets.length > 0) {
                    const defaults: {
                      preview?: string;
                      streaming?: string;
                      recording?: string;
                    } = {};
                    if (
                      qualityCap.defaults &&
                      typeof qualityCap.defaults === 'object'
                    ) {
                      const d = qualityCap.defaults;
                      if (typeof d.preview === 'string')
                        defaults.preview = d.preview;
                      if (typeof d.streaming === 'string')
                        defaults.streaming = d.streaming;
                      if (typeof d.recording === 'string')
                        defaults.recording = d.recording;
                    }
                    capabilitiesUpdate.quality = {
                      presets,
                      ...(Object.keys(defaults).length > 0 ? { defaults } : {}),
                    };
                  }
                }
              }

              // Extract sources from payload.sources
              if (payload.sources) {
                const videoSourceObjects: any[] = [];
                const audioSourceObjects: any[] = [];
                const videoSources: string[] = [];
                const audioSources: string[] = [];

                // Extract video sources
                if (Array.isArray(payload.sources.video)) {
                  payload.sources.video.forEach((source: any) => {
                    if (source.identifier) {
                      videoSources.push(source.identifier);
                    }
                    videoSourceObjects.push({
                      id: source.id,
                      identifier: source.identifier,
                      name: source.name || source.identifier,
                      path: source.path,
                      resolution: source.resolution,
                      framerate: source.framerate,
                      available: source.available !== false,
                    });
                  });
                }

                // Extract audio sources
                if (Array.isArray(payload.sources.audio)) {
                  payload.sources.audio.forEach((source: any) => {
                    if (source.identifier) {
                      audioSources.push(source.identifier);
                    }
                    audioSourceObjects.push({
                      id: source.id,
                      identifier: source.identifier,
                      name: source.name || source.identifier,
                      channels: source.channels,
                      sample_rate: source.sample_rate,
                      available: source.available !== false,
                    });
                  });
                }

                // Merge sources into capabilities
                if (videoSources.length > 0 || audioSources.length > 0) {
                  capabilitiesUpdate = {
                    ...capabilitiesUpdate,
                    videoSources:
                      videoSources.length > 0 ? videoSources : undefined,
                    audioSources:
                      audioSources.length > 0 ? audioSources : undefined,
                    videoSourceObjects:
                      videoSourceObjects.length > 0
                        ? videoSourceObjects
                        : undefined,
                    audioSourceObjects:
                      audioSourceObjects.length > 0
                        ? audioSourceObjects
                        : undefined,
                  };
                }
              }

              // Update capabilities if we extracted any
              if (capabilitiesUpdate !== undefined) {
                statusUpdate.capabilities = capabilitiesUpdate;
                console.log(
                  `[DeviceConnectionStatus] Capabilities extracted from device.connected:`,
                  {
                    hasPipCapabilities: !!capabilitiesUpdate.pipCapabilities,
                    hasAudioMixingCapabilities:
                      !!capabilitiesUpdate.audioMixingCapabilities,
                    hasHardwareEncodingCapabilities:
                      !!capabilitiesUpdate.hardwareEncodingCapabilities,
                    hasQualityPresets:
                      !!capabilitiesUpdate.quality?.presets?.length,
                    videoSourcesCount:
                      capabilitiesUpdate.videoSourceObjects?.length || 0,
                    audioSourcesCount:
                      capabilitiesUpdate.audioSourceObjects?.length || 0,
                  }
                );
              }
            }

            updateDeviceStatus(deviceUuid, statusUpdate);
          }

          // Handle device disconnection events
          if (
            message.type === 'control' &&
            message.event === 'device.disconnected'
          ) {
            console.log(
              `[DeviceConnectionStatus] Device disconnected: ${deviceUuid}`
            );
            updateDeviceStatus(deviceUuid, { connected: false });
          }

          // Handle manual recording events
          if (message.type === 'event') {
            if (message.event === 'record.started') {
              console.log(
                `[DeviceConnectionStatus] Manual recording started: ${deviceUuid}`,
                message.payload
              );
              const payload = message.payload;
              updateDeviceStatus(deviceUuid, {
                manualRecording: {
                  isRecording: true,
                  recordingId: payload.recording_id || null,
                  startedAt:
                    payload.metadata?.started_at || new Date().toISOString(),
                  filePath: payload.metadata?.file_path || null,
                },
              });
            } else if (message.event === 'record.stopped') {
              console.log(
                `[DeviceConnectionStatus] Manual recording stopped: ${deviceUuid}`,
                message.payload
              );
              updateDeviceStatus(deviceUuid, {
                manualRecording: {
                  isRecording: false,
                  recordingId: null,
                  startedAt: null,
                  filePath: null,
                },
              });
            } else if (message.event === 'sources.changed') {
              const payload = message.payload;
              if (
                payload &&
                (payload.video !== undefined || payload.audio !== undefined)
              ) {
                const current = deviceStatuses.value.get(deviceUuid);
                const video =
                  payload.video !== undefined
                    ? { id: 0, identifier: payload.video, name: payload.video }
                    : (current?.activeSources?.video ?? null);
                const audio =
                  payload.audio !== undefined
                    ? { id: 0, identifier: payload.audio, name: payload.audio }
                    : (current?.activeSources?.audio ?? null);
                updateDeviceStatus(deviceUuid, {
                  activeSources: { video, audio },
                });
              }
            } else if (message.event === 'streaming.rtmp.started') {
              const payload = message.payload ?? {};
              updateDeviceStatus(deviceUuid, {
                streaming: {
                  active: true,
                  platform: payload.platform,
                  url: payload.url,
                  quality: payload.quality,
                  error: undefined,
                  retryCount: undefined,
                },
              });
            } else if (message.event === 'streaming.rtmp.stopped') {
              const current = deviceStatuses.value.get(deviceUuid);
              updateDeviceStatus(deviceUuid, {
                streaming: {
                  active: false,
                  platform: current?.streaming?.platform,
                  error: undefined,
                  retryCount: undefined,
                },
              });
            } else if (message.event === 'streaming.rtmp.connection_failed') {
              const payload = message.payload ?? {};
              const current = deviceStatuses.value.get(deviceUuid);
              updateDeviceStatus(deviceUuid, {
                streaming: {
                  active: false,
                  platform: payload.platform ?? current?.streaming?.platform,
                  error: payload.error,
                  retryCount: payload.retry_count ?? payload.retryCount,
                },
              });
            }
          }

          // Forward preview messages to preview composable via custom event
          if (
            message.type === 'preview.offer' ||
            message.type === 'preview.answer' ||
            message.type === 'preview.ice_candidate' ||
            (message.type === 'event' &&
              (message.event === 'preview.started' ||
                message.event === 'preview.stopped'))
          ) {
            // Emit custom event for preview composable
            const eventName = `preview-message-${deviceUuid}`;
            console.log(
              `[DeviceConnectionStatus] Forwarding preview message to preview composable: ${message.type}`,
              { deviceUuid, eventName, messageId: message.id }
            );
            const customEvent = new CustomEvent(eventName, {
              detail: message,
            });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(customEvent);
              console.log(
                `[DeviceConnectionStatus] Custom event '${eventName}' dispatched for ${message.type}`
              );
            }
          }
        } catch (error) {
          console.error(
            '[DeviceConnectionStatus] Error parsing message:',
            error,
            'Raw message:',
            event.data
          );
        }
      };

      ws.onerror = (error) => {
        console.error(
          `[DeviceConnectionStatus] WebSocket error for device ${deviceUuid}:`,
          error
        );
        activeConnections.value.delete(deviceUuid);
        connectingDevices.value.delete(deviceUuid);
        // Don't delete from pendingConnections here - let finally() handle it
        updateDeviceStatus(deviceUuid, { connected: false });

        // Increment retry count
        const currentRetries = connectionRetries.value.get(deviceUuid) || 0;
        connectionRetries.value.set(deviceUuid, currentRetries + 1);

        if (connectionReject) {
          connectionReject(error);
        }
      };

      ws.onclose = (event) => {
        console.log(
          `[DeviceConnectionStatus] Disconnected from device room: ${deviceUuid}`,
          `Code: ${event.code}, Reason: ${event.reason || 'none'}`
        );
        activeConnections.value.delete(deviceUuid);
        connectingDevices.value.delete(deviceUuid);
        // Don't delete from pendingConnections here - let finally() handle it
        updateDeviceStatus(deviceUuid, { connected: false });

        // Only retry if it wasn't a clean close (code 1000) and we haven't exceeded max retries
        const currentRetries = connectionRetries.value.get(deviceUuid) || 0;
        if (event.code !== 1000 && currentRetries < MAX_RETRY_ATTEMPTS) {
          const retryDelay =
            RETRY_DELAYS[currentRetries] ||
            RETRY_DELAYS[RETRY_DELAYS.length - 1];
          console.log(
            `[DeviceConnectionStatus] Will retry connection to ${deviceUuid} in ${retryDelay}ms (attempt ${currentRetries + 1}/${MAX_RETRY_ATTEMPTS})`
          );

          // Retry after delay (but don't block - let the promise resolve/reject)
          setTimeout(() => {
            // Only retry if still not connected and not already connecting
            if (
              !activeConnections.value.has(deviceUuid) &&
              !connectingDevices.value.has(deviceUuid)
            ) {
              connectToDeviceRoom(deviceUuid).catch((err) => {
                console.error(
                  `[DeviceConnectionStatus] Retry failed for ${deviceUuid}:`,
                  err
                );
              });
            }
          }, retryDelay);
        } else if (currentRetries >= MAX_RETRY_ATTEMPTS) {
          console.warn(
            `[DeviceConnectionStatus] Max retry attempts reached for ${deviceUuid}, giving up`
          );
        }
      };
    } catch (error) {
      console.error(
        `[DeviceConnectionStatus] Failed to create WebSocket for device ${deviceUuid}:`,
        error
      );
      connectingDevices.value.delete(deviceUuid);

      // Increment retry count
      const currentRetries = connectionRetries.value.get(deviceUuid) || 0;
      connectionRetries.value.set(deviceUuid, currentRetries + 1);

      if (connectionReject) {
        connectionReject(error);
      }
    }
  });

  // Store the promise IMMEDIATELY (synchronously) so concurrent calls can reuse it
  // This prevents race conditions where multiple calls all create their own promises
  // IMPORTANT: Do this synchronously, before any async operations
  pendingConnections.set(deviceUuid, connectionPromise);

  // Clean up the promise from pending connections once it resolves/rejects
  connectionPromise.finally(() => {
    // Only remove if it's still the same promise (not replaced by another)
    if (pendingConnections.get(deviceUuid) === connectionPromise) {
      pendingConnections.delete(deviceUuid);
    }
  });

  return connectionPromise;
}

/**
 * Update device status
 * Only updates if values actually changed to prevent unnecessary reactivity
 */
function updateDeviceStatus(
  deviceUuid: string,
  updates: Partial<DeviceConnectionStatus>
): void {
  const current = deviceStatuses.value.get(deviceUuid) || { connected: false };

  // Check if any values actually changed (prevent unnecessary object recreation)
  let hasChanges = false;
  for (const [key, value] of Object.entries(updates)) {
    const currentValue = (current as any)[key];
    // Deep comparison for nested objects (like health, activeSources, pip)
    if (key === 'health' && value) {
      const currentHealth = currentValue as any;
      const newHealth = value as any;
      if (
        !currentHealth ||
        currentHealth.score !== newHealth.score ||
        currentHealth.status !== newHealth.status ||
        currentHealth.metrics?.cpuPercent !== newHealth.metrics?.cpuPercent ||
        currentHealth.metrics?.memoryPercent !==
          newHealth.metrics?.memoryPercent ||
        currentHealth.metrics?.diskPercent !== newHealth.metrics?.diskPercent ||
        currentHealth.networkConnected !== newHealth.networkConnected
      ) {
        hasChanges = true;
        break;
      }
    } else if (key === 'activeSources' && value) {
      // Deep comparison for activeSources
      const currentActive = currentValue as ActiveSources | undefined;
      const newActive = value as ActiveSources;
      if (
        !currentActive ||
        JSON.stringify(currentActive.video) !==
          JSON.stringify(newActive.video) ||
        JSON.stringify(currentActive.audio) !== JSON.stringify(newActive.audio)
      ) {
        hasChanges = true;
        break;
      }
    } else if (key === 'pip' && value) {
      // Deep comparison for pip configuration
      const currentPip = currentValue as PiPConfiguration | undefined;
      const newPip = value as PiPConfiguration;
      if (
        !currentPip ||
        currentPip.enabled !== newPip.enabled ||
        currentPip.position !== newPip.position ||
        JSON.stringify(currentPip.pipSource) !==
          JSON.stringify(newPip.pipSource) ||
        JSON.stringify(currentPip.mainSource) !==
          JSON.stringify(newPip.mainSource) ||
        JSON.stringify(currentPip.size) !== JSON.stringify(newPip.size)
      ) {
        hasChanges = true;
        break;
      }
    } else if (key === 'capabilities' && value) {
      // Deep comparison for capabilities
      const currentCapabilities = currentValue as any;
      const newCapabilities = value as any;
      if (
        !currentCapabilities ||
        JSON.stringify(currentCapabilities.videoSources) !==
          JSON.stringify(newCapabilities.videoSources) ||
        JSON.stringify(currentCapabilities.audioSources) !==
          JSON.stringify(newCapabilities.audioSources) ||
        JSON.stringify(currentCapabilities.videoSourceObjects) !==
          JSON.stringify(newCapabilities.videoSourceObjects) ||
        JSON.stringify(currentCapabilities.audioSourceObjects) !==
          JSON.stringify(newCapabilities.audioSourceObjects) ||
        currentCapabilities.pipSupported !== newCapabilities.pipSupported ||
        currentCapabilities.maxResolution !== newCapabilities.maxResolution ||
        currentCapabilities.hardwareEncoding !==
          newCapabilities.hardwareEncoding ||
        JSON.stringify(currentCapabilities.quality) !==
          JSON.stringify(newCapabilities.quality)
      ) {
        hasChanges = true;
        break;
      }
    } else if (key === 'streaming' && value) {
      const currentStreaming = currentValue as any;
      const newStreaming = value as any;
      if (
        !currentStreaming ||
        currentStreaming.active !== newStreaming.active ||
        currentStreaming.platform !== newStreaming.platform ||
        currentStreaming.url !== newStreaming.url ||
        currentStreaming.error !== newStreaming.error ||
        currentStreaming.retryCount !== newStreaming.retryCount
      ) {
        hasChanges = true;
        break;
      }
    } else if (currentValue !== value) {
      hasChanges = true;
      break;
    }
  }

  // Only update if values actually changed
  if (hasChanges) {
    deviceStatuses.value.set(deviceUuid, { ...current, ...updates });
  }
}

/**
 * Disconnect from a device room
 * Uses reference counting - only closes connection when ref count reaches 0
 */
function disconnectFromDeviceRoom(deviceUuid: string): void {
  const currentRefCount = connectionRefCounts.value.get(deviceUuid) || 0;
  const newRefCount = Math.max(0, currentRefCount - 1);

  console.log(
    `[DeviceConnectionStatus] Disconnect requested for ${deviceUuid}, ref count: ${currentRefCount} -> ${newRefCount}`
  );

  if (newRefCount === 0) {
    // No more components using this connection, close it
    const ws = activeConnections.value.get(deviceUuid);
    if (ws) {
      console.log(
        `[DeviceConnectionStatus] Closing WebSocket for ${deviceUuid} (ref count reached 0)`
      );
      ws.close(1000, 'Client disconnecting'); // Clean close
      activeConnections.value.delete(deviceUuid);
      deviceStatuses.value.delete(deviceUuid);
    }
    // Also clear connecting state and retry count
    connectingDevices.value.delete(deviceUuid);
    connectionRetries.value.delete(deviceUuid);
    connectionRefCounts.value.delete(deviceUuid);
  } else {
    // Other components still using this connection, just decrement ref count
    connectionRefCounts.value.set(deviceUuid, newRefCount);
    console.log(
      `[DeviceConnectionStatus] Keeping connection open for ${deviceUuid} (${newRefCount} components still using it)`
    );
  }
}

/**
 * Get connection status for a device
 */
export function useDeviceConnectionStatus(deviceUuid?: string | null) {
  // Track the currently subscribed UUID (may differ from initial deviceUuid)
  const subscribedUuid = ref<string | null>(deviceUuid || null);

  const status = computed(() => {
    const uuid = subscribedUuid.value || deviceUuid;
    if (!uuid) {
      return { connected: false } as DeviceConnectionStatus;
    }
    return deviceStatuses.value.get(uuid) || { connected: false };
  });

  const isConnected = computed(() => status.value.connected);

  /**
   * Subscribe to device connection status
   * Call this when mounting a component that needs to monitor a device
   */
  const subscribe = async (uuid: string) => {
    if (!uuid) return;
    subscribedUuid.value = uuid;
    await connectToDeviceRoom(uuid);
  };

  /**
   * Unsubscribe from device connection status
   * Call this when unmounting a component
   */
  const unsubscribe = (uuid: string) => {
    if (!uuid) return;
    if (subscribedUuid.value === uuid) {
      subscribedUuid.value = null;
    }
    disconnectFromDeviceRoom(uuid);
  };

  // Auto-subscribe/unsubscribe if deviceUuid is provided and reactive
  if (deviceUuid && process.client) {
    subscribe(deviceUuid);

    onUnmounted(() => {
      unsubscribe(deviceUuid);
    });
  }

  // Get WebSocket connection for this device
  const wsConnection = computed(() => {
    const uuid = subscribedUuid.value || deviceUuid;
    if (!uuid) return null;
    return activeConnections.value.get(uuid) || null;
  });

  return {
    status,
    isConnected,
    subscribe,
    unsubscribe,
    wsConnection, // Expose WebSocket connection for preview and other features
  };
}

/**
 * Get connection status for multiple devices (for list pages)
 */
export function useDeviceConnectionStatuses(
  deviceUuids: Ref<string[]> | string[]
) {
  const uuidsRef = Array.isArray(deviceUuids) ? ref(deviceUuids) : deviceUuids;

  const statuses = computed(() => {
    const result = new Map<string, DeviceConnectionStatus>();
    for (const uuid of uuidsRef.value) {
      result.set(uuid, deviceStatuses.value.get(uuid) || { connected: false });
    }
    return result;
  });

  /**
   * Subscribe to multiple devices
   */
  const subscribeAll = async () => {
    await Promise.all(uuidsRef.value.map((uuid) => connectToDeviceRoom(uuid)));
  };

  /**
   * Unsubscribe from all devices
   */
  const unsubscribeAll = () => {
    uuidsRef.value.forEach((uuid) => disconnectFromDeviceRoom(uuid));
  };

  // Auto-subscribe/unsubscribe when device list changes
  if (process.client) {
    watch(
      uuidsRef,
      (newUuids, oldUuids) => {
        // Unsubscribe from removed devices
        if (oldUuids) {
          oldUuids.forEach((uuid) => {
            if (!newUuids.includes(uuid)) {
              disconnectFromDeviceRoom(uuid);
            }
          });
        }
        // Subscribe to new devices
        newUuids.forEach((uuid) => {
          if (!oldUuids || !oldUuids.includes(uuid)) {
            connectToDeviceRoom(uuid);
          }
        });
      },
      { immediate: true }
    );

    onUnmounted(() => {
      unsubscribeAll();
    });
  }

  return {
    statuses,
    subscribeAll,
    unsubscribeAll,
  };
}
