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

export interface DeviceConnectionState {
  deviceId: string;
  connected: boolean;
  clientId?: string;
  endpoint?: 'cloud' | 'local';
  lastHeartbeat?: Date;
  connectedAt?: Date;
  state: {
    status: 'idle' | 'recording' | 'encoding' | 'uploading';
    activeSessionId?: string;
  };
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
   * Cleanup stale connections (devices that haven't sent heartbeat in timeout period)
   */
  async cleanupStaleConnections(
    timeoutMs: number = 5 * 60 * 1000
  ): Promise<void> {
    const now = Date.now();
    const staleDevices: string[] = [];

    for (const [deviceId, connection] of this.connections.entries()) {
      if (!connection.lastHeartbeat) {
        continue;
      }

      const timeSinceHeartbeat = now - connection.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > timeoutMs) {
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
