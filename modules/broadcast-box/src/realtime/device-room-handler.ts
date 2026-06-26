/**
 * Device Room Handler
 *
 * Implements the RoomTypeHandler interface for device WebSocket connections.
 * This handler manages authentication, message routing, and connection tracking
 * for Broadcast Box device connections.
 *
 * This decouples device-specific logic from the realtime server, allowing
 * the broadcast-box module to fully own device connection handling.
 */

import type { Logger, AuthService } from '@civicpress/core';
import { coreInfo, coreWarn, coreError, coreDebug } from '@civicpress/core';
import type {
  RoomTypeHandler,
  ConnectionContext,
  MessageContext,
  DisconnectContext,
  AuthResult,
} from '@civicpress/realtime';
import type { DeviceAuthService } from '../services/device-auth.js';
import type { DeviceManager } from '../services/device-manager.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { DeviceCommandService } from '../services/device-command-service.js';
import type { SessionController } from '../services/session-controller.js';
import { DeviceEventModel } from '../models/device-event.js';
import {
  authenticateDeviceConnection,
  authenticateUserObservingDevice,
  DeviceAuthenticationError,
  DevicePermissionError,
} from '../services/device-websocket-auth.js';
import {
  EventHandlerRegistry,
  createDefaultEventHandlers,
} from '../websocket/event-handlers.js';

/**
 * Configuration for the device room handler
 */
export interface DeviceRoomHandlerConfig {
  /**
   * Device authentication service
   */
  deviceAuthService: DeviceAuthService;

  /**
   * Device manager service
   */
  deviceManager: DeviceManager;

  /**
   * Device connection tracker
   */
  connectionTracker: DeviceConnectionTracker;

  /**
   * Device command service (for handling ack responses)
   */
  deviceCommandService: DeviceCommandService;

  /**
   * Device event model (for logging events)
   */
  deviceEventModel: DeviceEventModel;

  /**
   * Auth service for user authentication
   */
  authService: AuthService;

  /**
   * Session controller — applies device `session.manifest` frames (capture
   * block + segment-level visibility) to the CivicPress session record.
   * Optional: when absent, manifests are accepted but not persisted.
   */
  sessionController?: SessionController;

  /**
   * Logger instance
   */
  logger: Logger;
}

/**
 * Device Room Handler
 *
 * Handles device connections to the realtime server.
 */
export class DeviceRoomHandler implements RoomTypeHandler {
  public readonly roomType = 'device';
  // Devices authenticate with device tokens (not user sessions), so onConnect
  // is the authoritative auth — the realtime server skips its user-session gate.
  public readonly authenticatesConnection = true;

  private eventHandlerRegistry: EventHandlerRegistry;

  constructor(private config: DeviceRoomHandlerConfig) {
    // Initialize event handlers
    this.eventHandlerRegistry = createDefaultEventHandlers(config.logger);
  }

  /**
   * Authenticate device or user connection
   */
  async onConnect(context: ConnectionContext): Promise<AuthResult> {
    const {
      clientId,
      clientIp,
      token,
      roomId: deviceUuid,
      fullRoomId,
    } = context;

    coreInfo('Device room connection attempt', {
      operation: 'broadcast-box:device-handler:connect:attempt',
      clientId,
      deviceUuid,
      fullRoomId,
    });

    // Try device authentication first
    try {
      coreDebug('Attempting device authentication', {
        operation: 'broadcast-box:device-handler:device-auth:attempt',
        clientId,
        deviceUuid,
      });

      const deviceAuth = await authenticateDeviceConnection(
        token,
        deviceUuid,
        this.config.deviceAuthService,
        this.config.deviceManager,
        this.config.logger
      );

      // Register connection in tracker
      await this.config.connectionTracker.registerConnection(
        String(deviceAuth.deviceId),
        clientId,
        'cloud' // TODO: determine endpoint type
      );

      coreInfo('Device authenticated successfully', {
        operation: 'broadcast-box:device-handler:device-auth:success',
        clientId,
        deviceId: deviceAuth.deviceId,
        deviceUuid: deviceAuth.deviceUuid,
      });

      return {
        success: true,
        deviceAuth: {
          deviceId: String(deviceAuth.deviceId),
          deviceUuid: deviceAuth.deviceUuid,
          organizationId: deviceAuth.organizationId,
        },
        clientMetadata: {
          isDevice: true,
          deviceId: deviceAuth.deviceId,
          deviceUuid: deviceAuth.deviceUuid,
          organizationId: deviceAuth.organizationId,
          connectedAt: Date.now(),
        },
      };
    } catch (deviceAuthError: any) {
      // If device authentication fails, try user authentication
      // This allows users to observe device rooms
      if (
        deviceAuthError instanceof DeviceAuthenticationError ||
        deviceAuthError?.code === 'AUTH_FAILED' ||
        deviceAuthError?.message?.includes('authentication') ||
        deviceAuthError?.message?.includes('not found')
      ) {
        coreInfo(
          'Device auth failed, trying user authentication for observation',
          {
            operation: 'broadcast-box:device-handler:user-auth:attempt',
            clientId,
            deviceUuid,
            deviceAuthError: deviceAuthError.message,
          }
        );

        try {
          const userAuth = await authenticateUserObservingDevice(
            token,
            deviceUuid,
            this.config.authService,
            this.config.deviceManager,
            this.config.logger
          );

          coreInfo('User authenticated for device observation', {
            operation: 'broadcast-box:device-handler:user-auth:success',
            clientId,
            userId: userAuth.user.id,
            deviceUuid,
          });

          return {
            success: true,
            userAuth: {
              userId: userAuth.user.id,
              username:
                userAuth.user.username || userAuth.user.name || 'Unknown',
              role: userAuth.user.role,
              permissions: userAuth.permissions,
            },
            clientMetadata: {
              isDevice: false,
              isObserver: true,
              userId: userAuth.user.id,
              username:
                userAuth.user.username || userAuth.user.name || 'Unknown',
              deviceUuid,
              connectedAt: Date.now(),
            },
          };
        } catch (userAuthError: any) {
          coreWarn('User authentication also failed', {
            operation: 'broadcast-box:device-handler:auth:failed',
            clientId,
            deviceUuid,
            deviceAuthError: deviceAuthError.message,
            userAuthError: userAuthError.message,
          });

          return {
            success: false,
            error: userAuthError.message || 'Authentication failed',
            errorCode: userAuthError.code || 'AUTH_FAILED',
          };
        }
      }

      // Non-authentication error, re-throw
      throw deviceAuthError;
    }
  }

  /**
   * Handle post-connection setup
   */
  async onPostConnect(
    context: ConnectionContext,
    auth: AuthResult
  ): Promise<void> {
    const { clientId, fullRoomId } = context;
    const isDevice = auth.clientMetadata?.isDevice === true;

    if (isDevice && auth.deviceAuth) {
      // Send connection acknowledgment for device
      coreInfo('Device connection established', {
        operation: 'broadcast-box:device-handler:device:connected',
        clientId,
        deviceId: auth.deviceAuth.deviceId,
        deviceUuid: auth.deviceAuth.deviceUuid,
        roomId: fullRoomId,
      });
    } else if (auth.userAuth) {
      // User observer connected
      coreInfo('User observer connected to device room', {
        operation: 'broadcast-box:device-handler:observer:connected',
        clientId,
        userId: auth.userAuth.userId,
        roomId: fullRoomId,
      });
    }
  }

  /**
   * Handle incoming messages
   */
  async onMessage(context: MessageContext): Promise<void> {
    const { clientId, message, auth, sendError, broadcastToRoom } = context;
    const isDevice = auth.clientMetadata?.isDevice === true;

    try {
      const msg = message as any;

      // Handle ping/pong (exempt from rate limiting)
      if (msg.type === 'ping') {
        // Realtime server handles ping/pong
        return;
      }

      if (isDevice) {
        await this.handleDeviceMessage(context, msg);
      } else {
        await this.handleObserverMessage(context, msg);
      }
    } catch (error) {
      coreError(
        error instanceof Error ? error : new Error(String(error)),
        'DEVICE_MESSAGE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'broadcast-box:device-handler:message:error',
          clientId,
          isDevice,
        }
      );
      sendError(
        error instanceof Error ? error : new Error('Message processing failed')
      );
    }
  }

  /**
   * Handle device disconnect
   */
  onDisconnect(context: DisconnectContext): void {
    const { clientId, auth, room } = context;
    const isDevice = auth.clientMetadata?.isDevice === true;

    if (isDevice && auth.deviceAuth) {
      // Unregister device connection
      this.config.connectionTracker.unregisterConnection(
        auth.deviceAuth.deviceId,
        clientId
      );

      // Broadcast disconnect to observers
      const disconnectMessage = {
        type: 'control',
        event: 'device.disconnected',
        deviceId: auth.deviceAuth.deviceId,
        deviceUuid: auth.deviceAuth.deviceUuid,
        timestamp: Date.now(),
      };

      // Get room participants and notify observers
      const state = room.getState();
      for (const participant of state.participants) {
        if (participant.id !== clientId) {
          // This will be handled by the realtime server's connection map
          // We just need to log it here
        }
      }

      coreInfo('Device disconnected', {
        operation: 'broadcast-box:device-handler:device:disconnected',
        clientId,
        deviceId: auth.deviceAuth.deviceId,
        deviceUuid: auth.deviceAuth.deviceUuid,
      });
    } else if (auth.userAuth) {
      coreInfo('User observer disconnected', {
        operation: 'broadcast-box:device-handler:observer:disconnected',
        clientId,
        userId: auth.userAuth.userId,
      });
    }
  }

  /**
   * Handle messages from devices
   */
  private async handleDeviceMessage(
    context: MessageContext,
    message: any
  ): Promise<void> {
    const { clientId, auth, broadcastToRoom } = context;
    const deviceAuth = auth.deviceAuth!;

    // Handle ack messages - route to DeviceCommandService
    const isAckMessage =
      message.type === 'ack' ||
      (message.commandId &&
        (message.success !== undefined ||
          message.payload?.success !== undefined));

    if (isAckMessage) {
      await this.handleAckMessage(message, deviceAuth);
    }

    // Handle status messages
    if (message.type === 'status' && message.payload) {
      await this.handleStatusMessage(message, clientId, deviceAuth);
    }

    // Handle event messages
    if (message.type === 'event' && message.event) {
      await this.handleEventMessage(message, clientId, deviceAuth);
    }

    // Handle session.manifest — binds the recording to its CivicPress session
    // record and carries segment-level visibility (in-camera exclusion).
    if (message.type === 'session.manifest' && message.payload) {
      await this.handleManifestMessage(message, deviceAuth);
    }

    // Handle preview WebRTC messages
    if (
      message.type === 'preview.offer' ||
      message.type === 'preview.ice_candidate'
    ) {
      // These are routed to observers by the realtime server
      broadcastToRoom(message, clientId);
      return;
    }

    // Broadcast other messages to room (including observers)
    broadcastToRoom(message, clientId);
  }

  /**
   * Handle messages from observers (users)
   */
  private async handleObserverMessage(
    context: MessageContext,
    message: any
  ): Promise<void> {
    const { broadcastToRoom, clientId } = context;

    // Observers can send preview.answer and preview.ice_candidate
    if (
      message.type === 'preview.answer' ||
      message.type === 'preview.ice_candidate'
    ) {
      // Route to device
      broadcastToRoom(message, clientId);
      return;
    }

    // Observers are read-only for all other message types
    coreDebug('Observer message ignored (read-only)', {
      operation: 'broadcast-box:device-handler:observer:message-ignored',
      clientId,
      messageType: message.type,
    });
  }

  /**
   * Handle ack messages from devices
   */
  private async handleAckMessage(
    message: any,
    deviceAuth: NonNullable<AuthResult['deviceAuth']>
  ): Promise<void> {
    try {
      // Normalize ack message format
      const commandId =
        message.commandId ||
        message.payload?.commandId ||
        message.payload?.command_id;

      let success: boolean;
      if (message.status !== undefined) {
        success = message.status === 'success';
      } else if (message.success !== undefined) {
        success = Boolean(message.success);
      } else if (message.payload?.success !== undefined) {
        success = message.payload.success;
      } else {
        success = true;
      }

      const payload =
        message.result ||
        message.payload?.result ||
        message.payload?.payload ||
        message.payload;

      const ackMessage = {
        type: 'ack',
        id: message.id || message.payload?.id,
        timestamp: message.timestamp || message.payload?.timestamp,
        commandId,
        success,
        error:
          message.error?.message ||
          message.error ||
          message.payload?.error ||
          message.payload?.message,
        errorCode:
          message.error?.code ||
          message.errorCode ||
          message.payload?.errorCode ||
          message.payload?.error_code,
        payload,
      };

      // Route to command service
      if (
        commandId &&
        typeof this.config.deviceCommandService.handleAckResponse === 'function'
      ) {
        this.config.deviceCommandService.handleAckResponse(ackMessage as any);
      }

      coreDebug('Ack message processed', {
        operation: 'broadcast-box:device-handler:ack:processed',
        deviceId: deviceAuth.deviceId,
        commandId,
        success,
      });
    } catch (error) {
      coreWarn('Failed to process ack message', {
        operation: 'broadcast-box:device-handler:ack:error',
        deviceId: deviceAuth.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle status messages from devices
   */
  private async handleStatusMessage(
    message: any,
    clientId: string,
    deviceAuth: NonNullable<AuthResult['deviceAuth']>
  ): Promise<void> {
    const payload = message.payload;

    // Create event context for the status handler
    const eventContext = {
      deviceId: deviceAuth.deviceId,
      clientId,
      connectionTracker: this.config.connectionTracker,
      deviceManager: this.config.deviceManager,
      deviceEventModel: this.config.deviceEventModel,
      logger: this.config.logger,
    };

    // Process status through event handler registry
    await this.eventHandlerRegistry.handleEvent(
      {
        type: 'event',
        id: message.id || `status-${Date.now()}`,
        event: 'status',
        payload,
        timestamp: message.timestamp || new Date().toISOString(),
      } as any,
      eventContext
    );
  }

  /**
   * Handle event messages from devices
   */
  private async handleEventMessage(
    message: any,
    clientId: string,
    deviceAuth: NonNullable<AuthResult['deviceAuth']>
  ): Promise<void> {
    const eventContext = {
      deviceId: deviceAuth.deviceId,
      clientId,
      connectionTracker: this.config.connectionTracker,
      deviceManager: this.config.deviceManager,
      deviceEventModel: this.config.deviceEventModel,
      logger: this.config.logger,
    };

    await this.eventHandlerRegistry.handleEvent(message, eventContext);
  }

  /**
   * Handle a device `session.manifest`: persist the capture block (incl.
   * segment-level visibility) onto the CivicPress session record. The
   * `session_id` is the session record id pushed to the device via the schedule.
   */
  private async handleManifestMessage(
    message: any,
    deviceAuth: NonNullable<AuthResult['deviceAuth']>
  ): Promise<void> {
    const sessionId = message.payload?.session_id;
    const capture = message.payload?.capture;
    if (!sessionId || !capture) {
      coreWarn('session.manifest missing session_id/capture — ignored', {
        operation: 'broadcast-box:device-handler:manifest:invalid',
        deviceId: deviceAuth.deviceId,
      });
      return;
    }

    if (!this.config.sessionController) {
      coreWarn('session.manifest received but no SessionController — dropped', {
        operation: 'broadcast-box:device-handler:manifest:no-controller',
        deviceId: deviceAuth.deviceId,
        sessionId,
      });
      return;
    }

    try {
      await this.config.sessionController.applySessionManifest(
        sessionId,
        capture
      );
      coreInfo('session.manifest applied to session record', {
        operation: 'broadcast-box:device-handler:manifest:applied',
        deviceId: deviceAuth.deviceId,
        sessionId,
        segments: Array.isArray(capture.segments) ? capture.segments.length : 0,
      });
    } catch (error) {
      coreError(
        error instanceof Error ? error : new Error(String(error)),
        'SESSION_MANIFEST_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'broadcast-box:device-handler:manifest:error',
          deviceId: deviceAuth.deviceId,
          sessionId,
        }
      );
    }
  }
}

/**
 * Create a device room handler instance
 */
export function createDeviceRoomHandler(
  config: DeviceRoomHandlerConfig
): DeviceRoomHandler {
  return new DeviceRoomHandler(config);
}
