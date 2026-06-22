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

// Type for WebSocket connection (compatible with ws package)
type WebSocketConnection = {
  send(data: string): void;
  readyState: number;
};

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
        const serverAny = this.server as any;
        const connections = serverAny.connections as
          | Map<string, { send(data: string): void; readyState: number }>
          | undefined;
        if (!connections) continue;

        const ws = connections.get(clientId);
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
   * Send message directly to device only (not to observers)
   * This is used for commands that should only go to the device
   */
  sendToDevice(message: any): boolean {
    // Access realtime server's clientToDevice map to find device client
    const serverAny = this.server as any;
    const clientToDevice = serverAny.clientToDevice as
      | Map<
          string,
          { deviceId: string; deviceUuid: string; organizationId: string }
        >
      | undefined;
    const connections = serverAny.connections as
      | Map<string, { send(data: string): void; readyState: number }>
      | undefined;

    if (!clientToDevice || !connections) {
      coreWarn(
        'Cannot send to device: realtime server connections not available',
        {
          operation: 'broadcast-box:device-room:send-to-device-error',
          roomId: this.roomId,
          deviceId: this.deviceId,
        }
      );
      return false;
    }

    // At this point, clientToDevice and connections are guaranteed to be defined
    // Find the device's clientId by matching deviceUuid
    // Note: this.deviceId in DeviceRoom is actually the device UUID (from roomId format: "device:<uuid>")
    // The clientToDevice map stores: { deviceId: databaseId, deviceUuid: uuid, organizationId: orgId }
    // IMPORTANT: There may be multiple connections for the same device (if device reconnected)
    // We need to find the one that is actually OPEN and active

    // Log all clientToDevice entries for debugging
    const allDeviceConnections = Array.from(clientToDevice.entries()).map(
      ([id, info]) => ({
        clientId: id,
        deviceId: info.deviceId,
        deviceUuid: info.deviceUuid,
      })
    );

    console.log('[DeviceRoom] 🔍 Searching for device in clientToDevice map:', {
      targetDeviceUuid: this.deviceId,
      totalConnections: clientToDevice.size,
      allConnections: allDeviceConnections,
    });

    // Find ALL matching device connections (there may be multiple if device reconnected)
    const matchingConnections: Array<{
      clientId: string;
      ws: any;
      readyState: number;
    }> = [];

    for (const [clientId, deviceInfo] of clientToDevice.entries()) {
      if (deviceInfo.deviceUuid === this.deviceId) {
        // Found matching device - check if connection exists and is open
        const ws = connections.get(clientId);
        if (ws) {
          const readyStateNames: Record<number, string> = {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSING',
            3: 'CLOSED',
          };

          console.log('[DeviceRoom] Found matching device connection:', {
            clientId,
            deviceUuid: deviceInfo.deviceUuid,
            deviceId: deviceInfo.deviceId,
            wsReadyState: ws.readyState,
            wsReadyStateName: readyStateNames[ws.readyState] || 'UNKNOWN',
            isOpen: ws.readyState === 1,
          });

          matchingConnections.push({
            clientId,
            ws,
            readyState: ws.readyState,
          });
        }
      }
    }

    if (matchingConnections.length === 0) {
      // No matching connections found
      coreWarn('❌ Device client not found in clientToDevice map', {
        operation: 'broadcast-box:device-room:device-client-not-found',
        roomId: this.roomId,
        deviceId: this.deviceId,
        roomClients: Array.from(this.clients.keys()),
        clientToDeviceEntries: allDeviceConnections,
      });

      console.error(
        '[DeviceRoom] ❌ Device not found - troubleshooting info:',
        {
          targetDeviceUuid: this.deviceId,
          roomId: this.roomId,
          roomClients: Array.from(this.clients.keys()),
          availableDeviceConnections: allDeviceConnections,
          possibleCauses: [
            'Device not connected to WebSocket',
            'Device connected but not authenticated',
            'Device UUID mismatch',
            'Device connected to different room',
          ],
        }
      );

      return false;
    }

    // Filter to only OPEN connections (readyState === 1)
    const openConnections = matchingConnections.filter(
      (conn) => conn.ws.readyState === 1
    );

    if (openConnections.length === 0) {
      // Found connections but none are OPEN
      coreWarn('❌ Device connections found but none are OPEN', {
        operation: 'broadcast-box:device-room:device-ws-not-open',
        roomId: this.roomId,
        deviceId: this.deviceId,
        totalMatchingConnections: matchingConnections.length,
        connectionsStatus: matchingConnections.map((conn) => ({
          clientId: conn.clientId,
          readyState: conn.readyState,
        })),
      });

      console.error('[DeviceRoom] ❌ All device connections are not OPEN:', {
        totalConnections: matchingConnections.length,
        connections: matchingConnections.map((conn) => ({
          clientId: conn.clientId,
          readyState: conn.readyState,
        })),
        possibleCauses: [
          'All WebSocket connections are closed or closing',
          'Device reconnected but old connections not cleaned up',
        ],
      });

      return false;
    }

    // Get connection metadata from realtime server for quality scoring
    const deviceConnectionMetadata = (this.server as any)
      .deviceConnectionMetadata as Map<string, any> | undefined;

    // Score and sort connections by quality (highest score first)
    const scoredConnections = openConnections
      .map((conn) => {
        const metadata = deviceConnectionMetadata?.get(conn.clientId);

        // Recalculate score if metadata exists
        let score = 0;
        if (metadata) {
          score = this.calculateConnectionScore(metadata);
          // Update metadata with recalculated score (for consistency)
          metadata.connectionScore = score;
        }

        return {
          ...conn,
          metadata,
          score,
        };
      })
      .sort((a, b) => b.score - a.score); // Sort descending (highest score first)

    // Use highest-scored connection
    const primaryConnection = scoredConnections[0];
    const fallbackConnections = scoredConnections.slice(1);
    const { clientId: deviceClientId, ws } = primaryConnection;

    // Log multiple connections with detailed metadata
    if (scoredConnections.length > 1) {
      const connectionDetails = scoredConnections.map((conn, idx) => {
        const metadata = conn.metadata;
        return {
          clientId: conn.clientId,
          score: conn.score.toFixed(3),
          selected: idx === 0,
          connectedAt: metadata?.connectedAt
            ? new Date(metadata.connectedAt).toISOString()
            : 'unknown',
          ageMinutes: metadata?.connectedAt
            ? Math.round((Date.now() - metadata.connectedAt) / 60000)
            : 'unknown',
          lastMessageAt: metadata?.lastMessageAt
            ? new Date(metadata.lastMessageAt).toISOString()
            : 'unknown',
          inactivityMinutes: metadata?.lastMessageAt
            ? Math.round((Date.now() - metadata.lastMessageAt) / 60000)
            : 'unknown',
          messageCount: metadata?.messageCount || 0,
        };
      });

      coreWarn(
        '⚠️ Multiple OPEN connections found for device - using highest-scored connection',
        {
          operation: 'broadcast-box:device-room:multiple-connections-detected',
          roomId: this.roomId,
          deviceId: this.deviceId,
          totalOpenConnections: scoredConnections.length,
          selectedClientId: deviceClientId,
          selectedScore: primaryConnection.score.toFixed(3),
          connectionDetails,
        }
      );

      console.warn(
        '[DeviceRoom] ⚠️ Multiple OPEN connections for device - using highest-scored connection:',
        {
          deviceUuid: this.deviceId,
          totalOpenConnections: scoredConnections.length,
          selectedClientId: deviceClientId,
          selectedScore: primaryConnection.score.toFixed(3),
          connections: connectionDetails,
          note: 'Connection selected based on recency, activity, and message volume',
        }
      );
    }

    // Try sending to connections in order of quality (fallback on failure)
    let lastError: Error | null = null;
    let attemptCount = 0;
    const allAttempts = [primaryConnection, ...fallbackConnections];

    for (const connection of allAttempts) {
      attemptCount++;
      const { clientId: attemptClientId, ws: attemptWs, score } = connection;

      try {
        const messageJson = JSON.stringify(message);

        // Update metadata on send (track lastMessageFromServer)
        const deviceConnectionMetadata = (this.server as any)
          .deviceConnectionMetadata as Map<string, any> | undefined;
        const metadata = deviceConnectionMetadata?.get(attemptClientId);
        if (
          metadata &&
          typeof (this.server as any).updateDeviceConnectionMetadataOnSend ===
            'function'
        ) {
          (this.server as any).updateDeviceConnectionMetadataOnSend(
            attemptClientId
          );
        }

        coreInfo('Attempting to send command to connection', {
          operation: 'broadcast-box:device-room:command-send-attempt',
          roomId: this.roomId,
          deviceId: this.deviceId,
          clientId: attemptClientId,
          attempt: attemptCount,
          totalAttempts: allAttempts.length,
          connectionScore: score.toFixed(3),
          messageType: message.type,
          messageAction: message.action,
          commandId: message.id,
        });

        console.log(
          '[DeviceRoom] 📤 Sending command to device WebSocket (attempt ' +
            attemptCount +
            '/' +
            allAttempts.length +
            '):',
          {
            deviceClientId: attemptClientId,
            wsReadyState: attemptWs.readyState,
            connectionScore: score.toFixed(3),
            messageType: message.type,
            action: message.action,
            commandId: message.id,
            messageSize: messageJson.length,
            messagePreview: messageJson.substring(0, 200),
            totalOpenConnections: scoredConnections.length,
          }
        );

        attemptWs.send(messageJson);

        // Success - log and return
        const commandDetails = {
          operation: 'broadcast-box:device-room:command-sent-to-device',
          roomId: this.roomId,
          deviceId: this.deviceId,
          deviceClientId: attemptClientId,
          attempt: attemptCount,
          connectionScore: score.toFixed(3),
          messageType: message.type,
          messageAction: message.action,
          commandId: message.id,
          timestamp: message.timestamp,
          payload: message.payload,
          messageSize: messageJson.length,
          totalOpenConnections: scoredConnections.length,
          usedFallback: attemptCount > 1,
        };

        coreInfo(
          '📤 Command sent directly to device via WebSocket',
          commandDetails
        );

        console.log('[DeviceRoom] ✅ Command successfully sent to device:', {
          action: message.action,
          commandId: message.id,
          deviceId: this.deviceId,
          deviceClientId: attemptClientId,
          attempt: attemptCount,
          connectionScore: score.toFixed(3),
          usedFallback: attemptCount > 1,
          payload: message.payload,
          messageSize: messageJson.length,
          timestamp: message.timestamp,
          fullMessage: messageJson,
          totalOpenConnections: scoredConnections.length,
        });

        return true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        coreWarn('Command send attempt failed, trying next connection', {
          operation: 'broadcast-box:device-room:command-send-attempt-failed',
          roomId: this.roomId,
          deviceId: this.deviceId,
          clientId: attemptClientId,
          attempt: attemptCount,
          totalAttempts: allAttempts.length,
          connectionScore: score.toFixed(3),
          error: lastError.message,
          remainingAttempts: allAttempts.length - attemptCount,
        });

        console.error(
          '[DeviceRoom] ❌ Command send attempt ' + attemptCount + ' failed:',
          {
            deviceClientId: attemptClientId,
            connectionScore: score.toFixed(3),
            error: lastError.message,
            remainingAttempts: allAttempts.length - attemptCount,
            possibleCauses: [
              'WebSocket connection closed during send',
              'Message too large',
              'Network error',
            ],
          }
        );

        // Continue to next connection if available
        if (attemptCount < allAttempts.length) {
          console.warn(
            '[DeviceRoom] ⚠️ Retrying with next available connection (attempt ' +
              (attemptCount + 1) +
              '/' +
              allAttempts.length +
              ')...'
          );
        }
      }
    }

    // All attempts failed
    coreWarn('All connection attempts failed', {
      operation: 'broadcast-box:device-room:command-send-all-failed',
      roomId: this.roomId,
      deviceId: this.deviceId,
      totalAttempts: attemptCount,
      lastError: lastError?.message,
      allConnectionScores: scoredConnections.map((c) => ({
        clientId: c.clientId,
        score: c.score.toFixed(3),
      })),
    });

    console.error('[DeviceRoom] ❌ All connection attempts failed:', {
      deviceUuid: this.deviceId,
      totalAttempts: attemptCount,
      lastError: lastError?.message,
      connectionDetails: scoredConnections.map((c) => ({
        clientId: c.clientId,
        score: c.score.toFixed(3),
        readyState: c.ws.readyState,
      })),
    });

    return false;
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
   * Calculate connection quality score (mirror of server-side algorithm)
   * Higher score = better connection (more recent, more active)
   */
  private calculateConnectionScore(metadata: {
    connectedAt: number;
    lastMessageAt: number;
    messageCount: number;
  }): number {
    const now = Date.now();
    const ageMs = now - metadata.connectedAt;
    const activityMs = now - metadata.lastMessageAt;

    // Recent connections score higher (decay over 10 minutes = 600000ms)
    const recencyScore = Math.max(0, 1 - ageMs / 600000);

    // Active connections score higher (decay over 5 minutes = 300000ms)
    const activityScore = Math.max(0, 1 - activityMs / 300000);

    // Connections with more messages score slightly higher (log scale, capped at 1.0)
    const volumeScore = Math.min(1, Math.log10(metadata.messageCount + 1) / 2);

    // Weighted combination: 40% recency, 40% activity, 20% volume
    return recencyScore * 0.4 + activityScore * 0.4 + volumeScore * 0.2;
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
