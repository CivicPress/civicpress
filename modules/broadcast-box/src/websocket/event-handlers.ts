/**
 * Event Handlers
 *
 * Handles events sent from Broadcast Box devices to CivicPress
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import type { EventMessage } from '../types/index.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { DeviceManager } from '../services/device-manager.js';
import { DeviceEventModel } from '../models/device-event.js';
import { v4 as uuidv4 } from 'uuid';

export interface EventHandlerContext {
  deviceId: string;
  clientId: string;
  connectionTracker: DeviceConnectionTracker;
  deviceManager: DeviceManager;
  deviceEventModel: DeviceEventModel;
  logger: Logger;
}

export type EventHandler = (
  event: EventMessage,
  context: EventHandlerContext
) => Promise<void>;

export class EventHandlerRegistry {
  private handlers: Map<string, EventHandler> = new Map();

  constructor(private logger: Logger) {}

  /**
   * Register an event handler
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
    coreInfo('Event handler registered', {
      operation: 'broadcast-box:event:registered',
      eventType,
    });
  }

  /**
   * Handle event message
   */
  async handleEvent(
    event: EventMessage,
    context: EventHandlerContext
  ): Promise<void> {
    const handler = this.handlers.get(event.event);

    if (!handler) {
      coreWarn('Unknown event type', {
        operation: 'broadcast-box:event:unknown',
        eventType: event.event,
        deviceId: context.deviceId,
      });
      return;
    }

    try {
      await handler(event, context);
    } catch (error) {
      coreError(
        'Event handler error',
        'broadcast-box:event:error',
        error instanceof Error ? error.message : String(error),
        {
          operation: 'broadcast-box:event:error',
          eventType: event.event,
          deviceId: context.deviceId,
          error: error instanceof Error ? error.message : String(error),
        }
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
 * Create default event handlers
 */
export function createDefaultEventHandlers(
  logger: Logger
): EventHandlerRegistry {
  const registry = new EventHandlerRegistry(logger);

  // Register device.connected handler
  registry.registerHandler('device.connected', async (event, context) => {
    // Support both protocol format (nested eventType/eventData) and current format (flat payload)
    let eventData: any;
    let version: string | undefined;
    let capabilities: any;
    let sources: any;
    let configuration: any;

    if (
      event.payload.eventType === 'device.connected' &&
      event.payload.eventData
    ) {
      // Protocol format: nested structure
      eventData = event.payload.eventData;
      version = eventData.version;
      capabilities = eventData.capabilities;
      sources = eventData.sources;
      configuration = eventData.configuration;
    } else {
      // Current format: flat structure
      eventData = event.payload;
      version = event.payload.version;
      capabilities = event.payload.capabilities;
      sources = event.payload.sources;
      configuration = event.payload.configuration;
    }

    // Update device capabilities with detailed source information if available
    if (sources) {
      try {
        const device = await context.deviceManager.getDevice(context.deviceId);
        if (device) {
          // Extract source names from detailed source objects for backward compatibility
          const videoSourceNames =
            sources.video?.map(
              (s: any) => s.name || s.path || `Source ${s.id}`
            ) || [];
          const audioSourceNames =
            sources.audio?.map((s: any) => s.name || `Source ${s.id}`) || [];

          // Update device capabilities with both detailed objects and string arrays
          const updatedCapabilities = {
            ...device.capabilities,
            videoSources:
              videoSourceNames.length > 0
                ? videoSourceNames
                : device.capabilities.videoSources,
            audioSources:
              audioSourceNames.length > 0
                ? audioSourceNames
                : device.capabilities.audioSources,
            videoSourceObjects:
              sources.video || device.capabilities.videoSourceObjects,
            audioSourceObjects:
              sources.audio || device.capabilities.audioSourceObjects,
          };

          // Update device if capabilities changed
          if (
            JSON.stringify(updatedCapabilities) !==
            JSON.stringify(device.capabilities)
          ) {
            await context.deviceManager.updateDevice(context.deviceId, {
              capabilities: updatedCapabilities as any,
            });
            coreInfo(
              'Device capabilities updated from device.connected event',
              {
                operation: 'broadcast-box:event:capabilities-updated',
                deviceId: context.deviceId,
              }
            );
          }
        }
      } catch (error) {
        coreWarn(
          'Failed to update device capabilities from device.connected event',
          {
            operation: 'broadcast-box:event:capabilities-update-error',
            deviceId: context.deviceId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    // Check if device needs activation (enrolled but not active)
    // Note: Activation is also handled in DeviceConnectionTracker.registerConnection,
    // but we check here as well for redundancy
    try {
      const device = await context.deviceManager.getDevice(context.deviceId);
      if (device && device.status === 'enrolled') {
        await context.deviceManager.activateDevice(context.deviceId);
        coreInfo('Device activated via device.connected event', {
          operation: 'broadcast-box:event:device-activated',
          deviceId: context.deviceId,
        });
      }
    } catch (error) {
      // Log but don't fail the event processing
      coreWarn('Failed to activate device in device.connected handler', {
        operation: 'broadcast-box:event:activation-error',
        deviceId: context.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Log device connection event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'device.connected',
      eventData: {
        version,
        capabilities,
        sources,
        configuration,
        connectedAt: new Date().toISOString(),
      },
    });

    coreInfo('Device connected event processed', {
      operation: 'broadcast-box:event:device-connected',
      deviceId: context.deviceId,
      version,
      hasDetailedSources: !!(sources?.video || sources?.audio),
    });
  });

  // Register session.started handler
  registry.registerHandler('session.started', async (event, context) => {
    const { sessionId, state, startedAt } = event.payload;

    // Update device state
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'recording',
      activeSessionId: sessionId,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.started',
      eventData: {
        sessionId,
        state,
        startedAt,
      },
    });

    coreInfo('Session started event processed', {
      operation: 'broadcast-box:event:session-started',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register session.stopped handler
  registry.registerHandler('session.stopped', async (event, context) => {
    const { sessionId, state, stoppedAt } = event.payload;

    // Update device state
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'encoding',
      activeSessionId: sessionId,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.stopped',
      eventData: {
        sessionId,
        state,
        stoppedAt,
      },
    });

    coreInfo('Session stopped event processed', {
      operation: 'broadcast-box:event:session-stopped',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register session.complete handler
  registry.registerHandler('session.complete', async (event, context) => {
    const {
      sessionId,
      filePath,
      fileSize,
      durationSeconds,
      hash,
      completedAt,
    } = event.payload;

    // Update device state to idle
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.complete',
      eventData: {
        sessionId,
        filePath,
        fileSize,
        durationSeconds,
        hash,
        completedAt,
      },
    });

    coreInfo('Session complete event processed', {
      operation: 'broadcast-box:event:session-complete',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register session.failed handler
  registry.registerHandler('session.failed', async (event, context) => {
    const { sessionId, error } = event.payload;

    // Update device state to idle
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.failed',
      eventData: {
        sessionId,
        error,
      },
    });

    coreWarn('Session failed event processed', {
      operation: 'broadcast-box:event:session-failed',
      deviceId: context.deviceId,
      sessionId,
      error,
    });
  });

  // Register health.update handler
  registry.registerHandler('health.update', async (event, context) => {
    // Support both protocol format and current format
    const health =
      event.payload.health || event.payload.eventData?.health || event.payload;

    // Log health update event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'health.update',
      eventData: {
        health,
        updatedAt: new Date().toISOString(),
      },
    });

    coreInfo('Health update event processed', {
      operation: 'broadcast-box:event:health-update',
      deviceId: context.deviceId,
      healthScore: health?.score,
    });
  });

  // Register status event handler (device sends type="status" with payload)
  registry.registerHandler('status', async (event, context) => {
    // Device format: payload contains health, capabilities, state, session_id directly
    const payload = event.payload.eventData || event.payload;

    // Verify device_id matches (security check)
    if (payload.device_id && payload.device_id !== context.deviceId) {
      logger.warn('Status message device_id mismatch', {
        operation: 'broadcast-box:event:status-device-id-mismatch',
        expectedDeviceId: context.deviceId,
        receivedDeviceId: payload.device_id,
      });
      // Continue processing but log the mismatch
    }

    // Update device state from payload.state and payload.session_id
    // Map "capturing" to "recording" to match internal state enum
    if (payload.state !== undefined) {
      const deviceState =
        payload.state === 'idle'
          ? 'idle'
          : payload.state === 'capturing'
            ? 'recording' // Map capturing → recording
            : payload.state === 'recording'
              ? 'recording'
              : payload.state === 'encoding'
                ? 'encoding'
                : payload.state === 'uploading'
                  ? 'uploading'
                  : 'idle';

      context.connectionTracker.updateDeviceState(context.deviceId, {
        status: deviceState as any,
        activeSessionId: payload.session_id || undefined,
      });
    }

    // Update health if provided (device sends: health.score, health.cpu_usage, health.memory_usage, health.disk_usage)
    if (payload.health) {
      const health = {
        score: payload.health.score ?? 100,
        status:
          (payload.health.score ?? 100) >= 80
            ? ('healthy' as const)
            : (payload.health.score ?? 100) >= 50
              ? ('degraded' as const)
              : ('unhealthy' as const),
        metrics: {
          // Map device format (cpu_usage) to internal format (cpuPercent)
          cpuPercent:
            payload.health.cpu_usage ?? payload.health.cpuPercent ?? 0,
          memoryPercent:
            payload.health.memory_usage ?? payload.health.memoryPercent ?? 0,
          diskPercent:
            payload.health.disk_usage ?? payload.health.diskPercent ?? 0,
        },
        networkConnected:
          payload.health.network_connected ??
          payload.health.networkConnected ??
          true,
      };

      // Update connection state with health
      context.connectionTracker.updateDeviceState(context.deviceId, {
        health,
      } as any);
    }

    // Extract and store active sources from payload.active_sources
    if (payload.active_sources !== undefined) {
      try {
        const activeSources = {
          video: payload.active_sources.video || null,
          audio: payload.active_sources.audio || null,
        };

        await context.deviceManager.updateDevice(context.deviceId, {
          activeSources: activeSources as any,
        });

        coreInfo('Device active sources updated from status', {
          operation: 'broadcast-box:event:status-active-sources-updated',
          deviceId: context.deviceId,
          hasVideoSource: !!activeSources.video,
          hasAudioSource: !!activeSources.audio,
        });
      } catch (error) {
        coreWarn('Failed to update device active sources from status event', {
          operation: 'broadcast-box:event:status-active-sources-update-error',
          deviceId: context.deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Extract and store PiP configuration from payload.pip
    if (payload.pip !== undefined) {
      try {
        const pipConfig = {
          enabled: payload.pip.enabled || false,
          pipSource: payload.pip.pip_source || null,
          mainSource: payload.pip.main_source || null,
          position: payload.pip.position || 'top_right',
          size: payload.pip.size || { width: 320, height: 240 },
        };

        await context.deviceManager.updateDevice(context.deviceId, {
          pipConfig: pipConfig as any,
        });

        coreInfo('Device PiP configuration updated from status', {
          operation: 'broadcast-box:event:status-pip-config-updated',
          deviceId: context.deviceId,
          pipEnabled: pipConfig.enabled,
        });
      } catch (error) {
        coreWarn(
          'Failed to update device PiP configuration from status event',
          {
            operation: 'broadcast-box:event:status-pip-config-update-error',
            deviceId: context.deviceId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    // Update capabilities if provided (device sends: capabilities.video_sources, capabilities.audio_sources, capabilities.pip, capabilities.hardware_encoding)
    if (payload.capabilities) {
      try {
        const device = await context.deviceManager.getDevice(context.deviceId);
        if (device) {
          const videoSources =
            payload.capabilities.video_sources ||
            payload.capabilities.videoSources ||
            [];
          const audioSources =
            payload.capabilities.audio_sources ||
            payload.capabilities.audioSources ||
            [];
          const pipSupported =
            payload.capabilities.pip !== undefined
              ? payload.capabilities.pip
              : payload.capabilities.pipSupported !== undefined
                ? payload.capabilities.pipSupported
                : device.capabilities?.pipSupported;
          const hardwareEncoding =
            payload.capabilities.hardware_encoding !== undefined
              ? payload.capabilities.hardware_encoding
              : payload.capabilities.hardwareEncoding !== undefined
                ? payload.capabilities.hardwareEncoding
                : device.capabilities?.hardwareEncoding;

          const updatedCapabilities = {
            ...device.capabilities,
            videoSources:
              videoSources.length > 0
                ? videoSources
                : device.capabilities?.videoSources || [],
            audioSources:
              audioSources.length > 0
                ? audioSources
                : device.capabilities?.audioSources || [],
            pipSupported:
              pipSupported !== undefined
                ? pipSupported
                : device.capabilities?.pipSupported,
            hardwareEncoding:
              hardwareEncoding !== undefined
                ? hardwareEncoding
                : device.capabilities?.hardwareEncoding,
            // Preserve existing source objects if they exist
            videoSourceObjects: device.capabilities?.videoSourceObjects || [],
            audioSourceObjects: device.capabilities?.audioSourceObjects || [],
          };

          await context.deviceManager.updateDevice(context.deviceId, {
            capabilities: updatedCapabilities as any,
          });

          coreInfo('Device capabilities updated from status', {
            operation: 'broadcast-box:event:status-capabilities-updated',
            deviceId: context.deviceId,
            videoSourcesCount: videoSources.length,
            audioSourcesCount: audioSources.length,
            pipSupported,
            hardwareEncoding,
          });
        }
      } catch (error) {
        coreWarn('Failed to update device capabilities from status event', {
          operation: 'broadcast-box:event:status-capabilities-update-error',
          deviceId: context.deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Log status event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'status',
      eventData: {
        state: payload.state,
        session_id: payload.session_id,
        health: payload.health,
        capabilities: payload.capabilities,
        active_sources: payload.active_sources,
        pip: payload.pip,
        timestamp: payload.timestamp || new Date().toISOString(),
      },
    });

    coreInfo('Status event processed', {
      operation: 'broadcast-box:event:status',
      deviceId: context.deviceId,
      state: payload.state,
      healthScore: payload.health?.score,
    });
  });

  // Register upload.progress handler
  registry.registerHandler('upload.progress', async (event, context) => {
    const { sessionId, progress } = event.payload;

    // Update device state to uploading
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'uploading',
      activeSessionId: sessionId,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'upload.progress',
      eventData: {
        sessionId,
        progress,
      },
    });
  });

  // Register upload.complete handler
  registry.registerHandler('upload.complete', async (event, context) => {
    const { sessionId, uploadedAt, durationSeconds } = event.payload;

    // Update device state to idle
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'upload.complete',
      eventData: {
        sessionId,
        uploadedAt,
        durationSeconds,
      },
    });

    coreInfo('Upload complete event processed', {
      operation: 'broadcast-box:event:upload-complete',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register device.error handler
  registry.registerHandler('device.error', async (event, context) => {
    const { severity, error } = event.payload;

    // Log error event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'device.error',
      eventData: {
        severity,
        error,
        occurredAt: new Date().toISOString(),
      },
    });

    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as any).code
        : undefined;
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? (error as any).message
        : typeof error === 'string'
          ? error
          : String(error);

    if (severity === 'critical' || severity === 'error') {
      coreError(
        'Device error event processed',
        'broadcast-box:event:device-error',
        errorMessage,
        {
          operation: 'broadcast-box:event:device-error',
          deviceId: context.deviceId,
          severity,
          errorCode,
          errorMessage,
        }
      );
    } else {
      coreWarn('Device warning event processed', {
        operation: 'broadcast-box:event:device-warning',
        deviceId: context.deviceId,
        severity,
        errorCode,
        errorMessage,
      });
    }
  });

  return registry;
}
