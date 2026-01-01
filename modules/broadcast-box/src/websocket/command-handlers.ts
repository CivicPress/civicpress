/**
 * Command Handlers
 *
 * Handles commands sent from CivicPress to Broadcast Box devices
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import type { CommandMessage, AckMessage } from '../types/index.js';
import type { ProtocolHandler } from './protocol.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { Room } from '@civicpress/realtime';

export interface CommandHandlerContext {
  deviceId: string;
  clientId: string;
  room: Room;
  connectionTracker: DeviceConnectionTracker;
  protocol: ProtocolHandler;
  logger: Logger;
}

export type CommandHandler = (
  command: CommandMessage,
  context: CommandHandlerContext
) => Promise<AckMessage>;

export class CommandHandlerRegistry {
  private handlers: Map<string, CommandHandler> = new Map();

  constructor(private logger: Logger) {}

  /**
   * Register a command handler
   */
  registerHandler(action: string, handler: CommandHandler): void {
    this.handlers.set(action, handler);
    coreInfo('Command handler registered', {
      operation: 'broadcast-box:command:registered',
      action,
    });
  }

  /**
   * Handle command message
   */
  async handleCommand(
    command: CommandMessage,
    context: CommandHandlerContext
  ): Promise<AckMessage | null> {
    const handler = this.handlers.get(command.action);

    if (!handler) {
      coreWarn('Unknown command action', {
        operation: 'broadcast-box:command:unknown',
        action: command.action,
        deviceId: context.deviceId,
      });

      return context.protocol.createAck(
        command.id,
        false,
        `Unknown command action: ${command.action}`
      );
    }

    try {
      const ack = await handler(command, context);
      return ack;
    } catch (error) {
      coreError(
        'Command handler error',
        'broadcast-box:command:error',
        error instanceof Error ? error.message : String(error),
        {
          operation: 'broadcast-box:command:error',
          action: command.action,
          deviceId: context.deviceId,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      return context.protocol.createAck(
        command.id,
        false,
        error instanceof Error ? error.message : 'Command execution failed'
      );
    }
  }

  /**
   * Get registered handlers
   */
  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create default command handlers
 */
export function createDefaultCommandHandlers(
  logger: Logger
): CommandHandlerRegistry {
  const registry = new CommandHandlerRegistry(logger);

  // Register start_session handler
  registry.registerHandler('start_session', async (command, context) => {
    const { sessionId, civicpressSessionId, config } = command.payload;

    if (!sessionId || !civicpressSessionId) {
      return context.protocol.createAck(
        command.id,
        false,
        'Missing required fields: sessionId or civicpressSessionId'
      );
    }

    // Update device state to recording
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'recording',
      activeSessionId: sessionId,
    });

    coreInfo('Start session command processed', {
      operation: 'broadcast-box:command:start-session',
      deviceId: context.deviceId,
      sessionId,
      civicpressSessionId,
    });

    return context.protocol.createAck(command.id, true, undefined, {
      sessionId,
      state: 'recording',
    });
  });

  // Register stop_session handler
  registry.registerHandler('stop_session', async (command, context) => {
    const { sessionId } = command.payload;

    if (!sessionId) {
      return context.protocol.createAck(
        command.id,
        false,
        'Missing required field: sessionId'
      );
    }

    // Update device state to encoding
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'encoding',
      activeSessionId: sessionId,
    });

    coreInfo('Stop session command processed', {
      operation: 'broadcast-box:command:stop-session',
      deviceId: context.deviceId,
      sessionId,
    });

    return context.protocol.createAck(command.id, true, undefined, {
      sessionId,
      state: 'stopping',
    });
  });

  // Register update_config handler
  registry.registerHandler('update_config', async (command, context) => {
    const { config } = command.payload;

    if (!config) {
      return context.protocol.createAck(
        command.id,
        false,
        'Missing required field: config'
      );
    }

    coreInfo('Update config command processed', {
      operation: 'broadcast-box:command:update-config',
      deviceId: context.deviceId,
    });

    return context.protocol.createAck(command.id, true, undefined, {
      config,
    });
  });

  // Register get_status handler
  registry.registerHandler('get_status', async (command, context) => {
    const connectionState = context.connectionTracker.getConnectionState(
      context.deviceId
    );

    coreInfo('Get status command processed', {
      operation: 'broadcast-box:command:get-status',
      deviceId: context.deviceId,
    });

    return context.protocol.createAck(command.id, true, undefined, {
      state: connectionState?.state || { status: 'idle' },
      connected: connectionState?.connected || false,
      lastHeartbeat: connectionState?.lastHeartbeat?.toISOString(),
    });
  });

  // Register heartbeat handler
  registry.registerHandler('heartbeat', async (command, context) => {
    // Update heartbeat timestamp
    await context.connectionTracker.updateHeartbeat(context.deviceId);

    return context.protocol.createAck(command.id, true);
  });

  return registry;
}
