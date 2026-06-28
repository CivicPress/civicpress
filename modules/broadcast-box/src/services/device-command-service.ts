/**
 * Device Command Service
 *
 * Unified command execution layer for device control.
 * Supports commands from UI, API, workflows, and future scheduler.
 */

import type { Logger, ServiceContainer } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import { v4 as uuidv4 } from 'uuid';
import type { RoomManager } from '@civicpress/realtime';
import type { ProtocolHandler } from '../websocket/protocol.js';
import type {
  CommandMessage,
  AckMessage,
  DeviceConfig,
} from '../types/index.js';
import {
  BroadcastBoxError,
  BroadcastBoxErrorCode,
  isBroadcastBoxError,
  toStructuredError,
  inferErrorCode,
} from '../types/errors.js';
import type { DeviceManager } from './device-manager.js';
import type { DeviceConnectionTracker } from './device-connection-tracker.js';
import type { DeviceEventModel } from '../models/device-event.js';

/**
 * Command source tracking for audit trail
 */
export interface CommandSource {
  type: 'user' | 'scheduler' | 'workflow' | 'api';
  userId?: number;
  schedulerId?: string;
  workflowId?: string;
  metadata?: Record<string, any>;
}

/**
 * Command execution request
 */
export interface CommandRequest {
  deviceId: string;
  action: string;
  payload: any;
  source: CommandSource;
  timeout?: number; // Optional timeout override (default: 5000ms)
}

/**
 * Command execution response.
 * On failure, error/code/type/details allow programmatic handling.
 */
export interface CommandResponse {
  success: boolean;
  commandId: string;
  ack?: AckMessage;
  error?: string;
  errorCode?: string;
  errorType?: string;
  errorDetails?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Default command timeout (5 seconds)
 * Preview commands need more time for WebRTC offer creation (20 seconds)
 * Source commands can take longer on some devices (re-enumeration, driver latency)
 */
const DEFAULT_COMMAND_TIMEOUT = 5000;
const PREVIEW_COMMAND_TIMEOUT = 20000; // 20 seconds for preview.start/stop (WebRTC setup + network latency)
const SOURCE_COMMAND_TIMEOUT = 15000; // 15 seconds for sources.set / switch_source (device re-enumeration)

/**
 * Device Command Service
 *
 * Provides unified command execution for all command sources.
 * Handles validation, transport, response, and audit logging.
 */
export class DeviceCommandService {
  // Map of pending commands: commandId -> { resolve, reject, timeout, action }
  private pendingCommands: Map<
    string,
    {
      resolve: (ack: AckMessage) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
      action?: string; // Track command action for processing ACK responses
    }
  > = new Map();

  // Lazy-loaded RoomManager (resolved on first use)
  private _roomManager: RoomManager | null = null;
  private _roomManagerResolved: boolean = false;

  constructor(
    private protocol: ProtocolHandler,
    private connectionTracker: DeviceConnectionTracker,
    private deviceEventModel: DeviceEventModel,
    private deviceManager: DeviceManager,
    private logger: Logger,
    private container: ServiceContainer | null = null
  ) {}

  /**
   * Get RoomManager, resolving it lazily on first use
   * This allows realtime server to initialize after service registration
   */
  private getRoomManager(): RoomManager | null {
    if (this._roomManagerResolved) {
      return this._roomManager;
    }

    this._roomManagerResolved = true;

    if (!this.container) {
      this.logger.warn(
        'Container not available for lazy RoomManager resolution'
      );
      return null;
    }

    try {
      this._roomManager = this.container.resolve<RoomManager>(
        'realtimeRoomManager'
      );
      this.logger.info('RoomManager resolved successfully (lazy)', {
        operation:
          'broadcast-box:services:device-command-service:room-manager-resolved',
      });
      return this._roomManager;
    } catch (e: any) {
      this.logger.error(
        'RoomManager not available for DeviceCommandService - device commands will fail',
        {
          operation:
            'broadcast-box:services:device-command-service:room-manager-unavailable',
          error: e?.message || 'unknown',
          errorCode: e?.code,
          note: 'DeviceCommandService requires RoomManager to send commands; ensure the realtime module is loaded and initialized.',
        }
      );
      return null;
    }
  }

  /**
   * Execute a command on a device
   * Unified entry point for all command sources
   *
   * @param request - Command request. deviceId can be either UUID or database ID.
   *                  For room lookup, UUID is used. For connection checking, database ID is used.
   */
  async executeCommand(request: CommandRequest): Promise<CommandResponse> {
    const commandId = uuidv4();
    const timestamp = new Date();

    try {
      // Validate command
      this.validateCommand(request.deviceId, request.action, request.payload);

      // Convert deviceId (could be UUID or database ID) to database ID for connection checking
      // Device rooms use UUID, but connection tracker uses database ID (which is also a UUID string)
      let device = await this.deviceManager.getDeviceByUuid(request.deviceId);

      // If not found by UUID, try by database ID (for backward compatibility)
      if (!device) {
        device = await this.deviceManager.getDevice(request.deviceId);
      }

      if (!device) {
        throw new Error(`Device not found: ${request.deviceId}`);
      }

      // Use device.id (database primary key, which is a UUID string) for connection checking
      const deviceDatabaseId = String(device.id); // Ensure string format

      // Check device connection (using database ID)
      const isConnected = this.connectionTracker.isConnected(deviceDatabaseId);
      if (!isConnected) {
        // Log for debugging - include all relevant IDs
        const connectedDevices = this.connectionTracker.getConnectedDevices();
        const connectionState =
          this.connectionTracker.getConnectionState(deviceDatabaseId);

        this.logger.warn('Device connection check failed', {
          operation: 'broadcast-box:command:device-not-connected',
          requestDeviceId: request.deviceId,
          deviceUuid: device.deviceUuid,
          deviceDatabaseId,
          deviceIdType: typeof device.id,
          isConnected,
          connectionState: connectionState
            ? {
                connected: connectionState.connected,
                clientId: connectionState.clientId,
                lastHeartbeat: connectionState.lastHeartbeat?.toISOString(),
              }
            : null,
          connectedDevices,
          connectedDevicesCount: connectedDevices.length,
        });
        throw new Error(`Device ${request.deviceId} is not connected`);
      }

      // Sanitize payload for commands that no longer accept source fields (use sources.set instead)
      const payload = this.sanitizeCommandPayload(
        request.action,
        request.payload
      );

      // Create command message
      const command: CommandMessage = this.protocol.createCommand(
        request.action,
        payload,
        commandId
      );

      // Log command execution (audit trail)
      await this.logCommand(request, commandId, 'pending');

      // Determine timeout - preview and source commands may need more time
      const isPreviewCommand =
        request.action === 'preview.start' || request.action === 'preview.stop';
      const isSourceCommand =
        request.action === 'sources.set' || request.action === 'switch_source';
      const commandTimeout =
        request.timeout ||
        (isPreviewCommand
          ? PREVIEW_COMMAND_TIMEOUT
          : isSourceCommand
            ? SOURCE_COMMAND_TIMEOUT
            : DEFAULT_COMMAND_TIMEOUT);

      // Send command via WebSocket (using UUID for room lookup)
      const ack = await this.sendCommandViaWebSocket(
        request.deviceId, // UUID for room lookup
        command,
        commandTimeout
      );

      // Log successful response (using database ID for logging)
      await this.logCommand(
        { ...request, deviceId: deviceDatabaseId },
        commandId,
        'success',
        ack
      );

      return {
        success: true,
        commandId,
        ack,
        timestamp,
      };
    } catch (error) {
      const structured = isBroadcastBoxError(error)
        ? error.toDict()
        : toStructuredError(error);
      const errorMessage = structured.message;

      // Try to get database ID for logging (may fail if device not found)
      let deviceDatabaseId = request.deviceId;
      try {
        const device = await this.deviceManager.getDeviceByUuid(
          request.deviceId
        );
        if (device) {
          deviceDatabaseId = device.id.toString();
        }
      } catch {
        // Ignore - use original deviceId for logging
      }

      // Log failed command (using database ID if available)
      await this.logCommand(
        { ...request, deviceId: deviceDatabaseId },
        commandId,
        'failed',
        undefined,
        errorMessage
      );

      // Publish command.error for monitoring (structured payload)
      try {
        await this.deviceEventModel.create({
          id: uuidv4(),
          deviceId: deviceDatabaseId,
          eventType: 'command.error',
          eventData: {
            commandId,
            action: request.action,
            deviceId: request.deviceId,
            code: structured.code,
            message: errorMessage,
            type: structured.type,
            details: structured.details,
            source: request.source,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (publishErr) {
        coreWarn('Failed to publish command.error event', {
          operation: 'broadcast-box:command:error-publish-failed',
          deviceId: request.deviceId,
          commandId,
          error:
            publishErr instanceof Error
              ? publishErr.message
              : String(publishErr),
        });
      }

      coreError(
        'Command execution failed',
        'broadcast-box:command:execution-failed',
        errorMessage,
        {
          operation: 'broadcast-box:command:execution-failed',
          deviceId: request.deviceId,
          action: request.action,
          commandId,
          source: request.source,
          errorCode: structured.code,
        }
      );

      return {
        success: false,
        commandId,
        error: errorMessage,
        errorCode: structured.code,
        errorType: structured.type,
        errorDetails: structured.details,
        timestamp,
      };
    }
  }

  /**
   * Send command via WebSocket and wait for ack response
   */
  private async sendCommandViaWebSocket(
    deviceId: string,
    command: CommandMessage,
    timeout: number
  ): Promise<AckMessage> {
    const roomManager = this.getRoomManager();
    if (!roomManager) {
      throw new Error(
        'RoomManager not available - realtime module required for device commands'
      );
    }

    // Get or create device room (room is created when device connects; create on demand if missing)
    const roomId = `device:${deviceId}`;
    const room =
      roomManager.getRoom(roomId) ??
      roomManager.getOrCreateRoom(roomId, 'device', {});

    // Set up promise for ack response
    return new Promise<AckMessage>((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingCommands.delete(command.id);
        reject(
          new Error(`Command timeout after ${timeout}ms: ${command.action}`)
        );
      }, timeout);

      // Store promise resolvers using command.id as key
      // Debug: log what we're storing
      coreInfo('Storing pending command', {
        operation: 'broadcast-box:command:store-pending',
        commandId: command.id,
        commandIdType: typeof command.id,
        action: command.action,
        commandKeys: Object.keys(command),
        commandFull: JSON.stringify(command),
      });

      this.pendingCommands.set(command.id, {
        resolve: (ack: AckMessage) => {
          clearTimeout(timeoutHandle);
          this.pendingCommands.delete(command.id);
          resolve(ack);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutHandle);
          this.pendingCommands.delete(command.id);
          reject(error);
        },
        timeout: timeoutHandle,
        action: command.action, // Store action for ACK processing
      });

      // Send command directly to device only (not to observers)
      // Commands should only go to the device, not be broadcast to all clients
      try {
        // Check if room has sendToDevice method (DeviceRoom implementation)
        if (typeof (room as any).sendToDevice === 'function') {
          const sent = (room as any).sendToDevice(command);
          if (!sent) {
            throw new Error(`Failed to send command to device ${deviceId}`);
          }
        } else {
          // Fallback to broadcast if sendToDevice not available (shouldn't happen)
          coreWarn(
            'Room does not support sendToDevice, falling back to broadcast',
            {
              operation: 'broadcast-box:command:fallback-broadcast',
              deviceId,
              roomType: (room as any).roomType,
            }
          );
          room.broadcast(command);
        }

        // Command will be logged in DeviceRoom.sendToDevice() when actually sent via WebSocket
        // No need to log here - the actual send happens in DeviceRoom
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingCommands.delete(command.id);
        throw error;
      }
    });
  }

  /**
   * Handle ack response from device
   * Called by WebSocket message handler when ack is received
   */
  handleAckResponse(ack: AckMessage): void {
    // Debug: log all pending command IDs and the received ack
    const pendingCommandIds = Array.from(this.pendingCommands.keys());
    coreInfo('Handling ack response', {
      operation: 'broadcast-box:command:ack-received',
      ackCommandId: ack.commandId,
      pendingCommandIds,
      pendingCount: this.pendingCommands.size,
      ackSuccess: ack.success,
    });

    const pending = this.pendingCommands.get(ack.commandId);
    if (pending) {
      if (ack.success) {
        pending.resolve(ack);
      } else {
        const code =
          (ack.errorCode as BroadcastBoxErrorCode) ||
          inferErrorCode(ack.error || '');
        pending.reject(
          new BroadcastBoxError(
            code,
            ack.error || 'Command failed on device',
            ack.errorDetails
          )
        );
      }
    } else {
      coreWarn('Received ack for unknown command', {
        operation: 'broadcast-box:command:unknown-ack',
        commandId: ack.commandId,
        pendingCommandIds,
        pendingCount: this.pendingCommands.size,
        ackMessage: JSON.stringify(ack),
      });
    }
  }

  /**
   * Sanitize payload for commands that no longer accept video/audio source fields.
   * Sources are set via sources.set and used by preview, record, and session.
   */
  private sanitizeCommandPayload(action: string, payload: any): any {
    if (action === 'preview.start') {
      return { quality: payload?.quality };
    }
    if (action === 'record.start') {
      return { config: { quality: payload?.config?.quality } };
    }
    if (action === 'start_session') {
      return {
        sessionId: payload?.sessionId,
        civicpressSessionId: payload?.civicpressSessionId,
        config: { quality: payload?.config?.quality },
      };
    }
    if (action === 'stream.start') {
      return { quality: payload?.quality };
    }
    return payload;
  }

  /**
   * Validate command before execution
   */
  private validateCommand(
    deviceId: string,
    action: string,
    payload: any
  ): void {
    // Validate action is not empty
    if (!action || typeof action !== 'string') {
      throw new Error('Command action is required and must be a string');
    }

    // Validate deviceId
    if (!deviceId || typeof deviceId !== 'string') {
      throw new Error('Device ID is required and must be a string');
    }

    // Validate payload is object (if provided)
    if (payload !== undefined && typeof payload !== 'object') {
      throw new Error('Command payload must be an object');
    }

    // Additional validation can be added here based on action type
    // For now, we rely on command handlers to validate action-specific payloads
  }

  /**
   * Log command execution for audit trail
   */
  private async logCommand(
    request: CommandRequest,
    commandId: string,
    status: 'pending' | 'success' | 'failed',
    ack?: AckMessage,
    error?: string
  ): Promise<void> {
    try {
      await this.deviceEventModel.create({
        id: uuidv4(),
        deviceId: request.deviceId,
        eventType: `command.${request.action}.${status}`,
        eventData: {
          commandId,
          action: request.action,
          payload: request.payload,
          source: request.source,
          status,
          ack: ack
            ? {
                success: ack.success,
                error: ack.error,
                payload: ack.payload,
              }
            : undefined,
          error,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      // Log error but don't fail command execution
      coreWarn('Failed to log command execution', {
        operation: 'broadcast-box:command:log-failed',
        deviceId: request.deviceId,
        commandId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set active video/audio sources on device (primary API).
   * Sources persist across sessions and are used by preview, record, and session commands.
   */
  async setSources(
    deviceId: string,
    payload: { video?: string; audio?: string },
    source: CommandSource
  ): Promise<CommandResponse> {
    if (!payload.video && !payload.audio) {
      throw new Error(
        'At least one of video or audio must be provided for sources.set'
      );
    }
    return this.executeCommand({
      deviceId,
      action: 'sources.set',
      payload: { video: payload.video, audio: payload.audio },
      source,
    });
  }

  /**
   * Configure RTMP streaming destination (url, stream key, platform). Persisted on device.
   */
  async configureStream(
    deviceId: string,
    payload: { url: string; stream_key: string; platform?: string },
    source: CommandSource
  ): Promise<CommandResponse> {
    if (!payload.url || !payload.stream_key) {
      throw new Error('url and stream_key are required for stream.configure');
    }
    return this.executeCommand({
      deviceId,
      action: 'stream.configure',
      payload: {
        url: payload.url,
        stream_key: payload.stream_key,
        platform: payload.platform ?? 'generic',
      },
      source,
    });
  }

  /**
   * Start RTMP streaming (uses saved config; optional quality).
   */
  async startStream(
    deviceId: string,
    quality: string | undefined,
    source: CommandSource
  ): Promise<CommandResponse> {
    const payload = quality ? { quality } : {};
    return this.executeCommand({
      deviceId,
      action: 'stream.start',
      payload,
      source,
    });
  }

  /**
   * Stop RTMP streaming.
   */
  async stopStream(
    deviceId: string,
    source: CommandSource
  ): Promise<CommandResponse> {
    return this.executeCommand({
      deviceId,
      action: 'stream.stop',
      payload: {},
      source,
    });
  }

  /**
   * Switch video/audio source on device (deprecated: use setSources instead).
   */
  async switchSource(
    deviceId: string,
    videoSource: string | undefined,
    audioSource: string | undefined,
    source: CommandSource
  ): Promise<CommandResponse> {
    return this.executeCommand({
      deviceId,
      action: 'switch_source',
      payload: {
        videoSource,
        audioSource,
      },
      source,
    });
  }

  /**
   * Update device configuration
   */
  async updateConfig(
    deviceId: string,
    config: DeviceConfig,
    source: CommandSource
  ): Promise<CommandResponse> {
    return this.executeCommand({
      deviceId,
      action: 'update_config',
      payload: {
        config,
      },
      source,
    });
  }

  /**
   * Get device status
   */
  async getStatus(
    deviceId: string,
    source: CommandSource
  ): Promise<CommandResponse> {
    return this.executeCommand({
      deviceId,
      action: 'get_status',
      payload: {},
      source,
    });
  }

  /**
   * List available sources on device
   */
  async listSources(
    deviceId: string,
    source: CommandSource
  ): Promise<CommandResponse> {
    return this.executeCommand({
      deviceId,
      action: 'list_sources',
      payload: {},
      source,
    });
  }
}
