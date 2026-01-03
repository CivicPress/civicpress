/**
 * Device Command Service
 *
 * Unified command execution layer for device control.
 * Supports commands from UI, API, workflows, and future scheduler.
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import { v4 as uuidv4 } from 'uuid';
import type { RoomManager } from '@civicpress/realtime';
import type { ProtocolHandler } from '../websocket/protocol.js';
import type { CommandMessage, AckMessage, DeviceConfig } from '../types/index.js';
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
 * Command execution response
 */
export interface CommandResponse {
  success: boolean;
  commandId: string;
  ack?: AckMessage;
  error?: string;
  timestamp: Date;
}

/**
 * Default command timeout (5 seconds)
 */
const DEFAULT_COMMAND_TIMEOUT = 5000;

/**
 * Device Command Service
 *
 * Provides unified command execution for all command sources.
 * Handles validation, transport, response, and audit logging.
 */
export class DeviceCommandService {
  // Map of pending commands: commandId -> { resolve, reject, timeout }
  private pendingCommands: Map<
    string,
    {
      resolve: (ack: AckMessage) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  constructor(
    private roomManager: RoomManager | null,
    private protocol: ProtocolHandler,
    private connectionTracker: DeviceConnectionTracker,
    private deviceEventModel: DeviceEventModel,
    private deviceManager: DeviceManager,
    private logger: Logger
  ) {}

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
        const connectionState = this.connectionTracker.getConnectionState(deviceDatabaseId);
        
        this.logger.warn('Device connection check failed', {
          operation: 'broadcast-box:command:device-not-connected',
          requestDeviceId: request.deviceId,
          deviceUuid: device.deviceUuid,
          deviceDatabaseId,
          deviceIdType: typeof device.id,
          isConnected,
          connectionState: connectionState ? {
            connected: connectionState.connected,
            clientId: connectionState.clientId,
            lastHeartbeat: connectionState.lastHeartbeat?.toISOString(),
          } : null,
          connectedDevices,
          connectedDevicesCount: connectedDevices.length,
        });
        throw new Error(`Device ${request.deviceId} is not connected`);
      }

      // Create command message
      const command: CommandMessage = this.protocol.createCommand(
        request.action,
        request.payload,
        commandId
      );

      // Log command execution (audit trail)
      await this.logCommand(request, commandId, 'pending');

      // Send command via WebSocket (using UUID for room lookup)
      const ack = await this.sendCommandViaWebSocket(
        request.deviceId, // UUID for room lookup
        command,
        request.timeout || DEFAULT_COMMAND_TIMEOUT
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Try to get database ID for logging (may fail if device not found)
      let deviceDatabaseId = request.deviceId;
      try {
        const device = await this.deviceManager.getDeviceByUuid(request.deviceId);
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
        }
      );

      return {
        success: false,
        commandId,
        error: errorMessage,
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
    if (!this.roomManager) {
      throw new Error(
        'RoomManager not available - realtime module required for device commands'
      );
    }

    // Get device room
    const room = this.roomManager.getRoom(`device:${deviceId}`);
    if (!room) {
      throw new Error(`Device room not found: device:${deviceId}`);
    }

    // Set up promise for ack response
    return new Promise<AckMessage>((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingCommands.delete(command.id);
        reject(
          new Error(
            `Command timeout after ${timeout}ms: ${command.action}`
          )
        );
      }, timeout);

      // Store promise resolvers
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
      });

      // Send command
      try {
        room.broadcast(command);
        coreInfo('Command sent to device', {
          operation: 'broadcast-box:command:sent',
          deviceId,
          action: command.action,
          commandId: command.id,
        });
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
    const pending = this.pendingCommands.get(ack.commandId);
    if (pending) {
      if (ack.success) {
        pending.resolve(ack);
      } else {
        pending.reject(
          new Error(ack.error || 'Command failed on device')
        );
      }
    } else {
      coreWarn('Received ack for unknown command', {
        operation: 'broadcast-box:command:unknown-ack',
        commandId: ack.commandId,
      });
    }
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
   * Switch video/audio source on device
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

