/**
 * Device Connection Tracker
 *
 * Tracks device WebSocket connections and connection state
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn } from '@civicpress/core';
import type { DeviceManager } from './device-manager.js';
import type { DeviceEventModel } from '../models/device-event.js';
import { v4 as uuidv4 } from 'uuid';

export type ConnectionHealthState = 'online' | 'degraded' | 'offline';

export interface DeviceConnectionState {
  deviceId: string;
  connected: boolean;
  clientId?: string;
  endpoint?: 'cloud' | 'local';
  lastHeartbeat?: Date;
  connectedAt?: Date;
  connectionHealth: ConnectionHealthState;
  lastMessageAt?: Date;
  consecutiveStatusFailures: number;
  state: {
    status: 'idle' | 'recording' | 'encoding' | 'uploading';
    activeSessionId?: string;
    health?: any;
  };
  storage?: Record<string, unknown>;
  upload?: Record<string, unknown>;
  connectionInfo?: Record<string, unknown>;
  streaming?: Record<string, unknown>;
}

export class DeviceConnectionTracker {
  private connections: Map<string, DeviceConnectionState> = new Map();
  // Map clientId to deviceId for quick lookup
  private clientToDevice: Map<string, string> = new Map();

  constructor(
    private deviceManager: DeviceManager,
    private deviceEventModel: DeviceEventModel,
    private logger: Logger
  ) {}

  /**
   * Register device connection
   */
  async registerConnection(
    deviceId: string,
    clientId: string,
    endpoint?: 'cloud' | 'local'
  ): Promise<void> {
    const now = new Date();

    // Check if this is the first connection (device is enrolled but not active)
    const device = await this.deviceManager.getDevice(deviceId);
    const isFirstConnection = device && device.status === 'enrolled';

    const connectionState: DeviceConnectionState = {
      deviceId,
      connected: true,
      clientId,
      endpoint,
      lastHeartbeat: now,
      connectedAt: now,
      connectionHealth: 'online',
      lastMessageAt: now,
      consecutiveStatusFailures: 0,
      state: {
        status: 'idle',
      },
    };

    this.connections.set(deviceId, connectionState);
    this.clientToDevice.set(clientId, deviceId);

    // Activate device on first connection (if enrolled)
    if (isFirstConnection) {
      try {
        await this.deviceManager.activateDevice(deviceId);
        coreInfo('Device activated on first connection', {
          operation: 'broadcast-box:connection:activated',
          deviceId,
          clientId,
        });
      } catch (error) {
        coreWarn('Failed to activate device on first connection', {
          operation: 'broadcast-box:connection:activation-failed',
          deviceId,
          clientId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with connection registration even if activation fails
      }
    }

    // Update device last seen
    await this.deviceManager.updateLastSeen(deviceId);

    // Log connection event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId,
      eventType: 'device.connected',
      eventData: {
        clientId,
        endpoint,
        connectedAt: now.toISOString(),
        activated: isFirstConnection,
      },
    });

    coreInfo('Device connection registered', {
      operation: 'broadcast-box:connection:registered',
      deviceId,
      clientId,
      activated: isFirstConnection,
    });
  }

  /**
   * Unregister device connection
   */
  async unregisterConnection(
    deviceId: string,
    clientId?: string
  ): Promise<void> {
    const connection = this.connections.get(deviceId);
    if (!connection) {
      return;
    }

    // Remove from maps
    this.connections.delete(deviceId);
    if (clientId) {
      this.clientToDevice.delete(clientId);
    } else if (connection.clientId) {
      this.clientToDevice.delete(connection.clientId);
    }

    // Log disconnection event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId,
      eventType: 'device.disconnected',
      eventData: {
        clientId: clientId || connection.clientId,
        disconnectedAt: new Date().toISOString(),
        duration: connection.connectedAt
          ? Math.floor((Date.now() - connection.connectedAt.getTime()) / 1000)
          : undefined,
      },
    });

    coreInfo('Device connection unregistered', {
      operation: 'broadcast-box:connection:unregistered',
      deviceId,
      clientId: clientId || connection.clientId,
    });
  }

  /**
   * Update device heartbeat
   */
  async updateHeartbeat(deviceId: string): Promise<void> {
    const connection = this.connections.get(deviceId);
    if (!connection) {
      coreWarn('Heartbeat received for unregistered device', {
        operation: 'broadcast-box:connection:heartbeat-unknown',
        deviceId,
      });
      return;
    }

    connection.lastHeartbeat = new Date();
    this.connections.set(deviceId, connection);

    // Update device last seen
    await this.deviceManager.updateLastSeen(deviceId);
  }

  /**
   * Update device state
   */
  updateDeviceState(
    deviceId: string,
    state: Partial<DeviceConnectionState['state']>
  ): void {
    const connection = this.connections.get(deviceId);
    if (!connection) {
      return;
    }

    connection.state = {
      ...connection.state,
      ...state,
    };

    this.connections.set(deviceId, connection);
  }

  /**
   * Get connection state for device
   */
  getConnectionState(deviceId: string): DeviceConnectionState | null {
    return this.connections.get(deviceId) || null;
  }

  /**
   * Get device ID from client ID
   */
  getDeviceIdFromClient(clientId: string): string | null {
    return this.clientToDevice.get(clientId) || null;
  }

  /**
   * Check if device is connected
   */
  isConnected(deviceId: string): boolean {
    const connection = this.connections.get(deviceId);
    return connection?.connected === true;
  }

  /**
   * Get all connected devices
   */
  getConnectedDevices(): string[] {
    return Array.from(this.connections.keys()).filter((deviceId) =>
      this.isConnected(deviceId)
    );
  }

  /**
   * Record that a message was received from a device (updates lastMessageAt).
   */
  recordMessageReceived(deviceId: string): void {
    const connection = this.connections.get(deviceId);
    if (!connection) return;
    connection.lastMessageAt = new Date();
    if (connection.connectionHealth === 'degraded') {
      connection.connectionHealth = 'online';
    }
    this.connections.set(deviceId, connection);
  }

  /**
   * Record a status report failure (e.g. unparseable status message).
   * After 3 consecutive failures, mark connection health as offline.
   */
  recordStatusFailure(deviceId: string): void {
    const connection = this.connections.get(deviceId);
    if (!connection) return;
    connection.consecutiveStatusFailures += 1;
    if (connection.consecutiveStatusFailures >= 3) {
      connection.connectionHealth = 'offline';
    }
    this.connections.set(deviceId, connection);
  }

  /**
   * Reset status failure counter (called on successful status parse).
   */
  resetStatusFailures(deviceId: string): void {
    const connection = this.connections.get(deviceId);
    if (!connection) return;
    connection.consecutiveStatusFailures = 0;
    if (connection.connectionHealth === 'offline') {
      connection.connectionHealth = 'online';
    }
    this.connections.set(deviceId, connection);
  }

  /**
   * Update extended status sections (storage, upload, connection info, streaming).
   */
  updateExtendedStatus(
    deviceId: string,
    sections: {
      storage?: Record<string, unknown>;
      upload?: Record<string, unknown>;
      connectionInfo?: Record<string, unknown>;
      streaming?: Record<string, unknown>;
    }
  ): void {
    const connection = this.connections.get(deviceId);
    if (!connection) return;
    if (sections.storage !== undefined) connection.storage = sections.storage;
    if (sections.upload !== undefined) connection.upload = sections.upload;
    if (sections.connectionInfo !== undefined)
      connection.connectionInfo = sections.connectionInfo;
    if (sections.streaming !== undefined)
      connection.streaming = sections.streaming;
    this.connections.set(deviceId, connection);
  }

  private healthMonitorInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start periodic health monitoring.
   * Checks staleness: >90s without message → offline, >60s → degraded.
   */
  startHealthMonitor(intervalMs: number = 15000): void {
    this.stopHealthMonitor();
    this.healthMonitorInterval = setInterval(() => {
      const now = Date.now();
      for (const [, connection] of this.connections.entries()) {
        if (!connection.connected) continue;
        const lastMsg = connection.lastMessageAt ?? connection.lastHeartbeat;
        if (!lastMsg) continue;
        const elapsed = now - lastMsg.getTime();
        if (elapsed > 90_000) {
          connection.connectionHealth = 'offline';
        } else if (elapsed > 60_000) {
          connection.connectionHealth = 'degraded';
        }
      }
    }, intervalMs);
  }

  /**
   * Stop periodic health monitoring.
   */
  stopHealthMonitor(): void {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = null;
    }
  }

  /**
   * Cleanup stale connections (devices that haven't sent heartbeat in timeout period)
   */
  async cleanupStaleConnections(timeoutMs: number = 90 * 1000): Promise<void> {
    const now = Date.now();
    const staleDevices: string[] = [];

    for (const [deviceId, connection] of this.connections.entries()) {
      const lastActivity = connection.lastMessageAt ?? connection.lastHeartbeat;
      if (!lastActivity) {
        continue;
      }

      const timeSinceActivity = now - lastActivity.getTime();
      if (timeSinceActivity > timeoutMs) {
        staleDevices.push(deviceId);
      }
    }

    for (const deviceId of staleDevices) {
      await this.unregisterConnection(deviceId);
    }

    if (staleDevices.length > 0) {
      coreInfo('Cleaned up stale device connections', {
        operation: 'broadcast-box:connection:cleanup',
        count: staleDevices.length,
        devices: staleDevices,
      });
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    connectedDevices: number;
    devices: Array<{
      deviceId: string;
      connected: boolean;
      lastHeartbeat?: Date;
    }>;
  } {
    const devices = Array.from(this.connections.entries()).map(
      ([deviceId, connection]) => ({
        deviceId,
        connected: connection.connected,
        lastHeartbeat: connection.lastHeartbeat,
      })
    );

    return {
      totalConnections: this.connections.size,
      connectedDevices: devices.filter((d) => d.connected).length,
      devices,
    };
  }
}
