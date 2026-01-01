/**
 * Device Connection Status Composable
 *
 * Manages real-time WebSocket connections to device rooms for monitoring
 * device connection status. Only connects when needed (list/detail pages).
 */

import { ref, computed, onUnmounted, watch, type Ref } from 'vue';
import { useAuthStore } from '~/stores/auth';

export interface DeviceConnectionStatus {
  connected: boolean;
  lastSeenAt?: string;
  state?: 'idle' | 'recording' | 'encoding' | 'uploading';
  sessionId?: string | null;
  health?: {
    score: number;
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    network_connected: boolean;
  };
}

const deviceStatuses = ref<Map<string, DeviceConnectionStatus>>(new Map());
const activeConnections = ref<Map<string, WebSocket>>(new Map());
const config = useRuntimeConfig();

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
  if (activeConnections.value.has(deviceUuid)) {
    return activeConnections.value.get(deviceUuid) || null;
  }

  const authStore = useAuthStore();
  if (!authStore.isAuthenticated || !authStore.token) {
    console.warn(
      '[DeviceConnectionStatus] Not authenticated, cannot connect to device room'
    );
    return null;
  }

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
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

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

          // Handle device status messages
          if (message.type === 'status') {
            const payload = message.payload;
            updateDeviceStatus(deviceUuid, {
              connected: true,
              lastSeenAt: message.timestamp || new Date().toISOString(),
              state: payload?.state || 'idle',
              sessionId: payload?.session_id || null,
              health: payload?.health,
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
            error
          );
        }
      };

      ws.onerror = (error) => {
        console.error(
          `[DeviceConnectionStatus] WebSocket error for device ${deviceUuid}:`,
          error
        );
        activeConnections.value.delete(deviceUuid);
        updateDeviceStatus(deviceUuid, { connected: false });
        reject(error);
      };

      ws.onclose = () => {
        console.log(
          `[DeviceConnectionStatus] Disconnected from device room: ${deviceUuid}`
        );
        activeConnections.value.delete(deviceUuid);
        updateDeviceStatus(deviceUuid, { connected: false });
      };
    } catch (error) {
      console.error(
        `[DeviceConnectionStatus] Failed to create WebSocket for device ${deviceUuid}:`,
        error
      );
      reject(error);
    }
  });
}

/**
 * Update device status
 */
function updateDeviceStatus(
  deviceUuid: string,
  updates: Partial<DeviceConnectionStatus>
): void {
  const current = deviceStatuses.value.get(deviceUuid) || { connected: false };
  deviceStatuses.value.set(deviceUuid, { ...current, ...updates });
}

/**
 * Disconnect from a device room
 */
function disconnectFromDeviceRoom(deviceUuid: string): void {
  const ws = activeConnections.value.get(deviceUuid);
  if (ws) {
    ws.close();
    activeConnections.value.delete(deviceUuid);
    deviceStatuses.value.delete(deviceUuid);
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
