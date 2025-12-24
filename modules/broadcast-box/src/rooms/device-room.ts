/**
 * Device Room Implementation
 *
 * Manages WebSocket room for Broadcast Box device connections
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn } from '@civicpress/core';
import type {
  RealtimeServer,
  RoomConfig,
  RoomState,
  ClientConnection,
  Room,
  RoomFactory,
} from '@civicpress/realtime';

export class DeviceRoom implements Room {
  public readonly roomId: string;
  public readonly roomType: string = 'device';
  private clients: Map<string, ClientConnection> = new Map();
  private logger: Logger;
  private server: RealtimeServer;
  private deviceId: string;
  private createdAt: number;
  private lastActivity: number;
  private version: number = 0;

  constructor(
    roomId: string,
    config: RoomConfig,
    logger: Logger,
    server: RealtimeServer
  ) {
    this.roomId = roomId;
    this.logger = logger;
    this.server = server;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    // Extract deviceId from roomId (format: "device:<deviceId>")
    const parts = roomId.split(':');
    if (parts.length !== 2 || parts[0] !== 'device') {
      throw new Error(`Invalid device room ID format: ${roomId}`);
    }
    this.deviceId = parts[1];

    coreInfo('DeviceRoom created', {
      operation: 'broadcast-box:device-room:created',
      roomId,
      deviceId: this.deviceId,
    });
  }

  /**
   * Add client to room
   */
  addClient(clientId: string, connection: ClientConnection): void {
    this.clients.set(clientId, connection);
    this.lastActivity = Date.now();
    this.version++;

    coreInfo('Client added to device room', {
      operation: 'broadcast-box:device-room:client-added',
      roomId: this.roomId,
      deviceId: this.deviceId,
      clientId,
    });
  }

  /**
   * Remove client from room
   */
  removeClient(clientId: string): void {
    const removed = this.clients.delete(clientId);
    if (removed) {
      this.lastActivity = Date.now();
      this.version++;

      coreInfo('Client removed from device room', {
        operation: 'broadcast-box:device-room:client-removed',
        roomId: this.roomId,
        deviceId: this.deviceId,
        clientId,
      });
    }
  }

  /**
   * Broadcast message to all clients in room
   */
  broadcast(message: any, excludeClientId?: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (clientId !== excludeClientId) {
        // Get WebSocket connection from server
        const ws = (this.server as any).connections?.get(clientId);
        if (ws && ws.readyState === 1) {
          // WebSocket.OPEN = 1
          try {
            ws.send(JSON.stringify(message));
          } catch (error) {
            coreWarn('Failed to send message to device client', {
              operation: 'broadcast-box:device-room:broadcast-error',
              roomId: this.roomId,
              deviceId: this.deviceId,
              clientId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }
  }

  /**
   * Get current room state
   */
  getState(): RoomState {
    return {
      roomId: this.roomId,
      roomType: this.roomType,
      participants: Array.from(this.clients.values()),
      version: this.version,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Destroy room and cleanup
   */
  async destroy(): Promise<void> {
    this.clients.clear();
    coreInfo('DeviceRoom destroyed', {
      operation: 'broadcast-box:device-room:destroyed',
      roomId: this.roomId,
      deviceId: this.deviceId,
    });
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

/**
 * Device Room Factory
 */
export function createDeviceRoomFactory(
  logger: Logger,
  server: RealtimeServer
): RoomFactory {
  return {
    createRoom: (roomId: string, config: RoomConfig) => {
      return new DeviceRoom(roomId, config, logger, server);
    },
    supportsRoomType: (roomType: string) => roomType === 'device',
  };
}
