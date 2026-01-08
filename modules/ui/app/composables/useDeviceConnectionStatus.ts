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
}

const deviceStatuses = ref<Map<string, DeviceConnectionStatus>>(new Map());
const activeConnections = ref<Map<string, WebSocket>>(new Map());
const connectingDevices = ref<Set<string>>(new Set()); // Track devices currently connecting
const connectionRetries = ref<Map<string, number>>(new Map()); // Track retry counts
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
async function connectToDeviceRoom(
  deviceUuid: string
): Promise<WebSocket | null> {
  // Check if already connected
  const existingConnection = activeConnections.value.get(deviceUuid);
  if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
    return existingConnection;
  }

  // Check if already connecting (prevent duplicate connection attempts)
  if (connectingDevices.value.has(deviceUuid)) {
    console.log(
      `[DeviceConnectionStatus] Already connecting to device room: ${deviceUuid}`
    );
    return null;
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

  // Mark as connecting
  connectingDevices.value.add(deviceUuid);

  const token = authStore.token; // TypeScript now knows this is string (not null)
  const realtimeUrl = getRealtimeUrl();
  const wsUrl = `${realtimeUrl}/realtime/devices/${deviceUuid}`;

  return new Promise((resolve, reject) => {
    try {
      // Use subprotocol for authentication (browser-compatible)
      // The realtime server extracts the token from the Sec-WebSocket-Protocol header
      const ws = new WebSocket(wsUrl, token);

      ws.onopen = () => {
        console.log(
          `[DeviceConnectionStatus] Connected to device room: ${deviceUuid}`
        );
        activeConnections.value.set(deviceUuid, ws);
        connectingDevices.value.delete(deviceUuid);
        connectionRetries.value.delete(deviceUuid); // Reset retry count on success
        resolve(ws);
      };

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

            // Extract active sources
            const activeSources: ActiveSources | undefined =
              payload.active_sources
                ? {
                    video: payload.active_sources.video || null,
                    audio: payload.active_sources.audio || null,
                  }
                : undefined;

            // Extract PiP configuration
            const pip: PiPConfiguration | undefined = payload.pip
              ? {
                  enabled: payload.pip.enabled || false,
                  pipSource: payload.pip.pip_source || null,
                  mainSource: payload.pip.main_source || null,
                  position: payload.pip.position || 'top_right',
                  size: payload.pip.size || { width: 320, height: 240 },
                }
              : undefined;

            // Map state: "capturing" → "recording" to match internal state enum
            let deviceState:
              | 'idle'
              | 'recording'
              | 'encoding'
              | 'uploading'
              | undefined;
            if (payload?.state) {
              deviceState =
                payload.state === 'idle'
                  ? 'idle'
                  : payload.state === 'capturing'
                    ? 'recording' // Map capturing → recording
                    : payload.state === 'recording'
                      ? 'recording'
                      : payload.state === 'encoding'
                        ? 'encoding'
                        : payload.state === 'uploading'
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
              }
            );

            updateDeviceStatus(deviceUuid, {
              connected: true,
              lastSeenAt: message.timestamp || new Date().toISOString(),
              state: deviceState || 'idle',
              sessionId:
                payload?.session_id ||
                payload?.active_session?.session_id ||
                null,
              health,
              activeSources,
              pip,
            });
          }

          // Handle health.update events
          if (message.type === 'event' && message.event === 'health.update') {
            const payload = message.payload;
            const health = extractHealthData(payload);
            console.log(
              `[DeviceConnectionStatus] Health update received for ${deviceUuid}:`,
              health
            );
            updateDeviceStatus(deviceUuid, {
              connected: true,
              lastSeenAt: message.timestamp || new Date().toISOString(),
              health,
            });
          }

          // Handle device connection events
          if (
            message.type === 'control' &&
            message.event === 'device.connected'
          ) {
            console.log(
              `[DeviceConnectionStatus] Device connected: ${deviceUuid}`
            );
            updateDeviceStatus(deviceUuid, { connected: true });
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
        updateDeviceStatus(deviceUuid, { connected: false });

        // Increment retry count
        const currentRetries = connectionRetries.value.get(deviceUuid) || 0;
        connectionRetries.value.set(deviceUuid, currentRetries + 1);

        reject(error);
      };

      ws.onclose = (event) => {
        console.log(
          `[DeviceConnectionStatus] Disconnected from device room: ${deviceUuid}`,
          `Code: ${event.code}, Reason: ${event.reason || 'none'}`
        );
        activeConnections.value.delete(deviceUuid);
        connectingDevices.value.delete(deviceUuid);
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

      reject(error);
    }
  });
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
 */
function disconnectFromDeviceRoom(deviceUuid: string): void {
  const ws = activeConnections.value.get(deviceUuid);
  if (ws) {
    ws.close(1000, 'Client disconnecting'); // Clean close
    activeConnections.value.delete(deviceUuid);
    deviceStatuses.value.delete(deviceUuid);
  }
  // Also clear connecting state and retry count
  connectingDevices.value.delete(deviceUuid);
  connectionRetries.value.delete(deviceUuid);
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

  return {
    status,
    isConnected,
    subscribe,
    unsubscribe,
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
