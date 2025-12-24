/**
 * Command Handlers Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CommandHandlerRegistry,
  createDefaultCommandHandlers,
} from '../websocket/command-handlers.js';
import type { Logger } from '@civicpress/core';
import type { CommandMessage } from '../types/index.js';

describe('CommandHandlerRegistry', () => {
  let registry: CommandHandlerRegistry;
  let mockLogger: Logger;
  let mockContext: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    mockContext = {
      deviceId: 'device-id',
      clientId: 'client-id',
      room: {
        broadcast: vi.fn(),
      },
      connectionTracker: {
        updateDeviceState: vi.fn(),
        getConnectionState: vi.fn().mockReturnValue({
          state: { status: 'idle' },
        }),
      },
      protocol: {
        createAck: vi
          .fn()
          .mockImplementation((id, success, error, payload) => ({
            type: 'ack',
            id: 'ack-id',
            commandId: id,
            success,
            error,
            payload,
          })),
      },
      logger: mockLogger,
    };

    registry = new CommandHandlerRegistry(mockLogger);
  });

  describe('registerHandler', () => {
    it('should register a command handler', () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      registry.registerHandler('test_action', handler);

      expect(registry.getRegisteredHandlers()).toContain('test_action');
    });
  });

  describe('handleCommand', () => {
    it('should handle registered command', async () => {
      const handler = vi.fn().mockResolvedValue({
        type: 'ack',
        id: 'ack-id',
        commandId: 'cmd-id',
        success: true,
      });

      registry.registerHandler('test_action', handler);

      const command: CommandMessage = {
        type: 'command',
        id: 'cmd-id',
        timestamp: new Date().toISOString(),
        action: 'test_action',
        payload: {},
      };

      const result = await registry.handleCommand(command, mockContext);

      expect(handler).toHaveBeenCalledWith(command, mockContext);
      expect(result).toBeDefined();
    });

    it('should return error ack for unknown command', async () => {
      const command: CommandMessage = {
        type: 'command',
        id: 'cmd-id',
        timestamp: new Date().toISOString(),
        action: 'unknown_action',
        payload: {},
      };

      const result = await registry.handleCommand(command, mockContext);

      expect(result).toBeDefined();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('Unknown command action');
    });

    it('should handle handler errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      registry.registerHandler('test_action', handler);

      const command: CommandMessage = {
        type: 'command',
        id: 'cmd-id',
        timestamp: new Date().toISOString(),
        action: 'test_action',
        payload: {},
      };

      const result = await registry.handleCommand(command, mockContext);

      expect(result).toBeDefined();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('Handler error');
    });
  });
});

describe('createDefaultCommandHandlers', () => {
  let registry: any;
  let mockContext: any;

  beforeEach(() => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    mockContext = {
      deviceId: 'device-id',
      clientId: 'client-id',
      room: {
        broadcast: vi.fn(),
      },
      connectionTracker: {
        updateDeviceState: vi.fn(),
        getConnectionState: vi.fn().mockReturnValue({
          state: { status: 'idle' },
        }),
      },
      protocol: {
        createAck: vi
          .fn()
          .mockImplementation((id, success, error, payload) => ({
            type: 'ack',
            id: 'ack-id',
            commandId: id,
            success,
            error,
            payload,
          })),
      },
      logger: mockLogger,
    };

    registry = createDefaultCommandHandlers(mockLogger);
  });

  it('should register start_session handler', async () => {
    const command: CommandMessage = {
      type: 'command',
      id: 'cmd-id',
      timestamp: new Date().toISOString(),
      action: 'start_session',
      payload: {
        sessionId: 'session-id',
        civicpressSessionId: 'civicpress-session-id',
      },
    };

    const result = await registry.handleCommand(command, mockContext);

    expect(result?.success).toBe(true);
    expect(
      mockContext.connectionTracker.updateDeviceState
    ).toHaveBeenCalledWith('device-id', {
      status: 'recording',
      activeSessionId: 'session-id',
    });
  });

  it('should register stop_session handler', async () => {
    const command: CommandMessage = {
      type: 'command',
      id: 'cmd-id',
      timestamp: new Date().toISOString(),
      action: 'stop_session',
      payload: {
        sessionId: 'session-id',
      },
    };

    const result = await registry.handleCommand(command, mockContext);

    expect(result?.success).toBe(true);
    expect(
      mockContext.connectionTracker.updateDeviceState
    ).toHaveBeenCalledWith('device-id', {
      status: 'encoding',
      activeSessionId: 'session-id',
    });
  });

  it('should register get_status handler', async () => {
    const command: CommandMessage = {
      type: 'command',
      id: 'cmd-id',
      timestamp: new Date().toISOString(),
      action: 'get_status',
      payload: {},
    };

    const result = await registry.handleCommand(command, mockContext);

    expect(result?.success).toBe(true);
    expect(result?.payload).toBeDefined();
    expect(result?.payload.state).toBeDefined();
  });

  it('should register heartbeat handler', async () => {
    const command: CommandMessage = {
      type: 'command',
      id: 'cmd-id',
      timestamp: new Date().toISOString(),
      action: 'heartbeat',
      payload: {},
    };

    // Mock updateHeartbeat - it's async
    mockContext.connectionTracker.updateHeartbeat = vi
      .fn()
      .mockResolvedValue(undefined);

    const result = await registry.handleCommand(command, mockContext);

    expect(result).toBeDefined();
    expect(result?.success).toBe(true);
    expect(mockContext.connectionTracker.updateHeartbeat).toHaveBeenCalledWith(
      'device-id'
    );
  });
});
