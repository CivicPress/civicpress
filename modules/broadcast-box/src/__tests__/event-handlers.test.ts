/**
 * Event Handlers Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventHandlerRegistry,
  createDefaultEventHandlers,
} from '../websocket/event-handlers.js';
import type { Logger } from '@civicpress/core';
import type { EventMessage } from '../types/index.js';

describe('EventHandlerRegistry', () => {
  let registry: EventHandlerRegistry;
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
      connectionTracker: {
        updateDeviceState: vi.fn(),
      },
      deviceManager: {},
      deviceEventModel: {
        create: vi.fn().mockResolvedValue(undefined),
      },
      logger: mockLogger,
    };

    registry = new EventHandlerRegistry(mockLogger);
  });

  describe('registerHandler', () => {
    it('should register an event handler', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('test.event', handler);

      expect(registry.getRegisteredHandlers()).toContain('test.event');
    });
  });

  describe('handleEvent', () => {
    it('should handle registered event', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.registerHandler('test.event', handler);

      const event: EventMessage = {
        type: 'event',
        id: 'event-id',
        timestamp: new Date().toISOString(),
        event: 'test.event',
        payload: {},
      };

      await registry.handleEvent(event, mockContext);

      expect(handler).toHaveBeenCalledWith(event, mockContext);
    });

    it('should ignore unknown events', async () => {
      const event: EventMessage = {
        type: 'event',
        id: 'event-id',
        timestamp: new Date().toISOString(),
        event: 'unknown.event',
        payload: {},
      };

      await registry.handleEvent(event, mockContext);

      // Should not throw, just log warning (coreWarn is used internally)
      // The registry uses coreWarn, not the logger directly
      expect(mockContext.deviceEventModel.create).not.toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      registry.registerHandler('test.event', handler);

      const event: EventMessage = {
        type: 'event',
        id: 'event-id',
        timestamp: new Date().toISOString(),
        event: 'test.event',
        payload: {},
      };

      // Should not throw
      await expect(
        registry.handleEvent(event, mockContext)
      ).resolves.not.toThrow();

      // Handler should have been called
      expect(handler).toHaveBeenCalled();
    });
  });
});

describe('createDefaultEventHandlers', () => {
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
      connectionTracker: {
        updateDeviceState: vi.fn(),
      },
      deviceManager: {},
      deviceEventModel: {
        create: vi.fn().mockResolvedValue(undefined),
      },
      logger: mockLogger,
    };

    registry = createDefaultEventHandlers(mockLogger);
  });

  it('should handle device.connected event', async () => {
    const event: EventMessage = {
      type: 'event',
      id: 'event-id',
      timestamp: new Date().toISOString(),
      event: 'device.connected',
      payload: {
        deviceId: 'device-id',
        version: '1.0.0',
        capabilities: [],
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(mockContext.deviceEventModel.create).toHaveBeenCalled();
  });

  it('should handle session.started event', async () => {
    const event: EventMessage = {
      type: 'event',
      id: 'event-id',
      timestamp: new Date().toISOString(),
      event: 'session.started',
      payload: {
        sessionId: 'session-id',
        state: 'recording',
        startedAt: new Date().toISOString(),
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(
      mockContext.connectionTracker.updateDeviceState
    ).toHaveBeenCalledWith('device-id', {
      status: 'recording',
      activeSessionId: 'session-id',
    });
    expect(mockContext.deviceEventModel.create).toHaveBeenCalled();
  });

  it('should handle session.complete event', async () => {
    const event: EventMessage = {
      type: 'event',
      id: 'event-id',
      timestamp: new Date().toISOString(),
      event: 'session.complete',
      payload: {
        sessionId: 'session-id',
        filePath: '/path/to/file.mp4',
        fileSize: 1000000,
        hash: 'file-hash',
        durationSeconds: 3600,
        completedAt: new Date().toISOString(),
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(
      mockContext.connectionTracker.updateDeviceState
    ).toHaveBeenCalledWith('device-id', {
      status: 'idle',
      activeSessionId: undefined,
    });
    expect(mockContext.deviceEventModel.create).toHaveBeenCalled();
  });

  it('should handle health.update event', async () => {
    const event: EventMessage = {
      type: 'event',
      id: 'event-id',
      timestamp: new Date().toISOString(),
      event: 'health.update',
      payload: {
        health: {
          score: 95,
          status: 'healthy',
          metrics: {
            cpuPercent: 30,
            memoryPercent: 45,
            diskPercent: 60,
          },
        },
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(mockContext.deviceEventModel.create).toHaveBeenCalled();
  });
});
