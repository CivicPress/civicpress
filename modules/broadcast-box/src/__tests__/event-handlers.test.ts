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
        recordMessageReceived: vi.fn(),
        resetStatusFailures: vi.fn(),
        updateExtendedStatus: vi.fn(),
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
        recordMessageReceived: vi.fn(),
        resetStatusFailures: vi.fn(),
        updateExtendedStatus: vi.fn(),
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

  it('should persist quality presets from device.connected payload', async () => {
    const updateDevice = vi.fn().mockResolvedValue(undefined);
    mockContext.deviceManager = {
      getDevice: vi.fn().mockResolvedValue({
        id: 'device-id',
        capabilities: {},
      }),
      updateDevice,
    };

    const event: EventMessage = {
      type: 'event',
      id: 'event-id',
      timestamp: new Date().toISOString(),
      event: 'device.connected',
      payload: {
        deviceId: 'device-id',
        version: '1.0.0',
        capabilities: {
          quality: {
            presets: [
              {
                name: 'standard',
                video_bitrate_kbps: 4000,
                audio_bitrate_kbps: 192,
                resolution: [1920, 1080],
                framerate: 30,
              },
              {
                name: 'high',
                video_bitrate_kbps: 8000,
                audio_bitrate_kbps: 256,
                resolution: [1920, 1080],
                framerate: 60,
              },
            ],
            defaults: { recording: 'high' },
          },
        },
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(updateDevice).toHaveBeenCalledWith('device-id', {
      capabilities: expect.objectContaining({
        quality: {
          presets: [
            {
              name: 'standard',
              videoBitrateKbps: 4000,
              audioBitrateKbps: 192,
              resolution: [1920, 1080],
              framerate: 30,
            },
            {
              name: 'high',
              videoBitrateKbps: 8000,
              audioBitrateKbps: 256,
              resolution: [1920, 1080],
              framerate: 60,
            },
          ],
          defaults: { recording: 'high' },
        },
      }),
    });
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

  it('should persist pip config from status with sources.pip.configured', async () => {
    const updateDevice = vi.fn().mockResolvedValue(undefined);
    mockContext.deviceManager = {
      getDevice: vi.fn().mockResolvedValue({
        id: 'device-id',
        capabilities: {
          videoSourceObjects: [
            { id: 0, identifier: 'hdmi1', name: 'HDMI 1' },
            { id: 1, identifier: 'hdmi2', name: 'HDMI 2' },
          ],
        },
      }),
      updateDevice,
    };

    // Use payload.pip (not payload.sources.pip) so only the pip block runs and updateDevice is called once with pipConfig
    const event: EventMessage = {
      type: 'status',
      id: 'status-id',
      timestamp: new Date().toISOString(),
      event: 'status',
      payload: {
        device_id: 'device-id',
        pip: {
          configured: true,
          supported: true,
          pip_source: 'hdmi2',
          main_source: 'hdmi1',
          position: 'top_right',
          size: 0.25,
        },
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(updateDevice).toHaveBeenCalledWith(
      'device-id',
      expect.objectContaining({
        pipConfig: expect.objectContaining({
          configured: true,
          supported: true,
          position: 'top_right',
          size: 0.25,
        }),
      })
    );
    const pipConfig = updateDevice.mock.calls[0][1].pipConfig;
    expect(pipConfig.pipSource).toBeDefined();
    expect(pipConfig.pipSource?.identifier).toBe('hdmi2');
    expect(pipConfig.mainSource).toBeDefined();
    expect(pipConfig.mainSource?.identifier).toBe('hdmi1');
  });

  it('should map pip.enabled to configured for backward compat in status', async () => {
    const updateDevice = vi.fn().mockResolvedValue(undefined);
    mockContext.deviceManager = {
      getDevice: vi.fn().mockResolvedValue({
        id: 'device-id',
        capabilities: { videoSourceObjects: [] },
      }),
      updateDevice,
    };

    const event: EventMessage = {
      type: 'status',
      id: 'status-id',
      timestamp: new Date().toISOString(),
      event: 'status',
      payload: {
        device_id: 'device-id',
        sources: {
          pip: {
            enabled: true,
            supported: true,
            pip_source: { id: 1, identifier: 'hdmi2' },
            main_source: { id: 0, identifier: 'hdmi1' },
            position: 'top_right',
            size: 0.25,
          },
        },
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(updateDevice).toHaveBeenCalledWith(
      'device-id',
      expect.objectContaining({
        pipConfig: expect.objectContaining({
          configured: true,
        }),
      })
    );
  });

  it('should update active sources from status and treat pip as active when video is pip', async () => {
    const updateDevice = vi.fn().mockResolvedValue(undefined);
    mockContext.deviceManager = {
      getDevice: vi.fn().mockResolvedValue({
        id: 'device-id',
        capabilities: {
          videoSourceObjects: [
            { id: 0, identifier: 'hdmi1', name: 'HDMI 1' },
            { id: 1, identifier: 'pip', name: 'Picture-in-Picture' },
          ],
          audioSourceObjects: [
            { id: 0, identifier: 'usb_audio', name: 'USB Audio' },
          ],
        },
      }),
      updateDevice,
    };

    const event: EventMessage = {
      type: 'status',
      id: 'status-id',
      timestamp: new Date().toISOString(),
      event: 'status',
      payload: {
        device_id: 'device-id',
        sources: {
          active: {
            video: { id: 1, identifier: 'pip' },
            audio: { id: 0, identifier: 'usb_audio' },
          },
        },
      },
    };

    await registry.handleEvent(event, mockContext);

    expect(updateDevice).toHaveBeenCalledWith(
      'device-id',
      expect.objectContaining({
        activeSources: expect.objectContaining({
          video: expect.objectContaining({ identifier: 'pip' }),
          audio: expect.objectContaining({ identifier: 'usb_audio' }),
        }),
      })
    );
  });
});
