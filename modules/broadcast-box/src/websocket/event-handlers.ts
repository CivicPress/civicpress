/**
 * Event Handlers
 *
 * Handles events sent from Broadcast Box devices to CivicPress
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import type {
  EventMessage,
  QualityCapabilities,
  QualityPreset,
  QualityDefaults,
} from '../types/index.js';
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

/**
 * Normalize capabilities.quality from device payload (snake_case) to QualityCapabilities (camelCase).
 */
function normalizeQualityFromPayload(
  qualityCap: any
): QualityCapabilities | undefined {
  if (
    qualityCap == null ||
    typeof qualityCap !== 'object' ||
    !Array.isArray(qualityCap.presets)
  ) {
    return undefined;
  }
  const presets: QualityPreset[] = [];
  for (const p of qualityCap.presets) {
    if (
      p &&
      typeof p.name === 'string' &&
      typeof (p.video_bitrate_kbps ?? p.videoBitrateKbps) === 'number' &&
      typeof (p.audio_bitrate_kbps ?? p.audioBitrateKbps) === 'number' &&
      Array.isArray(p.resolution) &&
      p.resolution.length === 2 &&
      typeof p.resolution[0] === 'number' &&
      typeof p.resolution[1] === 'number' &&
      typeof p.framerate === 'number'
    ) {
      presets.push({
        name: p.name,
        videoBitrateKbps: p.video_bitrate_kbps ?? p.videoBitrateKbps,
        audioBitrateKbps: p.audio_bitrate_kbps ?? p.audioBitrateKbps,
        resolution: [p.resolution[0], p.resolution[1]],
        framerate: p.framerate,
      });
    }
  }
  if (presets.length === 0) return undefined;
  const defaults: QualityDefaults = {};
  if (qualityCap.defaults && typeof qualityCap.defaults === 'object') {
    const d = qualityCap.defaults;
    if (typeof d.preview === 'string') defaults.preview = d.preview;
    if (typeof d.streaming === 'string') defaults.streaming = d.streaming;
    if (typeof d.recording === 'string') defaults.recording = d.recording;
  }
  return {
    presets,
    ...(Object.keys(defaults).length > 0 ? { defaults } : {}),
  };
}

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

    // Update device capabilities from the new `capabilities` object (sent in device.connected)
    // This message is sent once per connection and contains the full capability spec.
    if (capabilities && typeof capabilities === 'object') {
      try {
        const device = await context.deviceManager.getDevice(context.deviceId);
        if (device) {
          const updatedCapabilities: any = { ...device.capabilities };

          // PiP capabilities: object (new) or boolean (legacy)
          const pipCap = (capabilities as any).pip;
          if (pipCap !== undefined) {
            if (typeof pipCap === 'object' && pipCap !== null) {
              updatedCapabilities.pipCapabilities = {
                supported: Boolean(pipCap.supported),
                maxSources:
                  typeof pipCap.max_sources === 'number'
                    ? pipCap.max_sources
                    : undefined,
                supportedPositions: Array.isArray(pipCap.supported_positions)
                  ? pipCap.supported_positions
                  : undefined,
                minSize:
                  pipCap.min_size &&
                  typeof pipCap.min_size.width === 'number' &&
                  typeof pipCap.min_size.height === 'number'
                    ? {
                        width: pipCap.min_size.width,
                        height: pipCap.min_size.height,
                      }
                    : undefined,
                maxSize:
                  pipCap.max_size &&
                  typeof pipCap.max_size.width === 'number' &&
                  typeof pipCap.max_size.height === 'number'
                    ? {
                        width: pipCap.max_size.width,
                        height: pipCap.max_size.height,
                      }
                    : undefined,
              };
              updatedCapabilities.pipSupported = Boolean(pipCap.supported);
            } else if (typeof pipCap === 'boolean') {
              updatedCapabilities.pipCapabilities = { supported: pipCap };
              updatedCapabilities.pipSupported = pipCap;
            }
          }

          // Audio mixing capabilities
          const audioMixingCap = (capabilities as any).audio_mixing;
          if (audioMixingCap !== undefined) {
            if (typeof audioMixingCap === 'object' && audioMixingCap !== null) {
              updatedCapabilities.audioMixingCapabilities = {
                supported: Boolean(audioMixingCap.supported),
                maxInputs:
                  typeof audioMixingCap.max_inputs === 'number'
                    ? audioMixingCap.max_inputs
                    : undefined,
              };
            } else if (typeof audioMixingCap === 'boolean') {
              updatedCapabilities.audioMixingCapabilities = {
                supported: audioMixingCap,
              };
            }
          }

          // Hardware encoding capabilities: object (new) or boolean (legacy)
          const hwEncCap = (capabilities as any).hardware_encoding;
          if (hwEncCap !== undefined) {
            if (typeof hwEncCap === 'object' && hwEncCap !== null) {
              updatedCapabilities.hardwareEncodingCapabilities = {
                supported: Boolean(hwEncCap.supported),
              };
              updatedCapabilities.hardwareEncoding = Boolean(
                hwEncCap.supported
              );
            } else if (typeof hwEncCap === 'boolean') {
              updatedCapabilities.hardwareEncodingCapabilities = {
                supported: hwEncCap,
              };
              updatedCapabilities.hardwareEncoding = hwEncCap;
            }
          }

          // Quality presets and defaults (capabilities.quality)
          const qualityNorm = normalizeQualityFromPayload(
            (capabilities as any).quality
          );
          if (qualityNorm) {
            updatedCapabilities.quality = qualityNorm;
          }

          // Streaming capabilities (capabilities.streaming)
          const streamingCap = (capabilities as any).streaming;
          if (streamingCap !== undefined) {
            if (typeof streamingCap === 'object' && streamingCap !== null) {
              updatedCapabilities.streamingCapabilities = {
                supported: Boolean(streamingCap.supported),
                protocols: Array.isArray(streamingCap.protocols)
                  ? streamingCap.protocols
                  : undefined,
                maxBitrateKbps:
                  typeof streamingCap.max_bitrate_kbps === 'number'
                    ? streamingCap.max_bitrate_kbps
                    : undefined,
              };
            } else if (typeof streamingCap === 'boolean') {
              updatedCapabilities.streamingCapabilities = {
                supported: streamingCap,
              };
            }
          }

          const capabilitiesChanged =
            JSON.stringify(updatedCapabilities) !==
            JSON.stringify(device.capabilities);

          if (capabilitiesChanged) {
            await context.deviceManager.updateDevice(context.deviceId, {
              capabilities: updatedCapabilities,
            });

            coreInfo(
              'Device capabilities updated from device.connected capabilities object',
              {
                operation:
                  'broadcast-box:event:device-connected-capabilities-updated',
                deviceId: context.deviceId,
                pipSupported: updatedCapabilities.pipSupported,
                hasPipCapabilities: !!updatedCapabilities.pipCapabilities,
                hasAudioMixingCapabilities:
                  !!updatedCapabilities.audioMixingCapabilities,
                hardwareEncoding: updatedCapabilities.hardwareEncoding,
                hasQualityPresets:
                  !!updatedCapabilities.quality?.presets?.length,
              }
            );
          }
        }
      } catch (error) {
        coreWarn(
          'Failed to update device capabilities from device.connected capabilities object',
          {
            operation:
              'broadcast-box:event:device-connected-capabilities-update-error',
            deviceId: context.deviceId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
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

          // Validate and clean up device config if capabilities changed
          let configUpdates: any = {};
          const currentConfig = device.config || {};

          // Check if defaultVideoSource is still valid
          if (currentConfig.defaultVideoSource) {
            const isValidVideoSource =
              videoSourceNames.includes(currentConfig.defaultVideoSource) ||
              sources.video?.some(
                (s: any) =>
                  s.identifier === currentConfig.defaultVideoSource ||
                  s.name === currentConfig.defaultVideoSource
              );

            if (!isValidVideoSource) {
              configUpdates.defaultVideoSource = undefined;
              coreWarn(
                'Default video source no longer available, clearing from config',
                {
                  operation: 'broadcast-box:event:config-cleanup',
                  deviceId: context.deviceId,
                  invalidSource: currentConfig.defaultVideoSource,
                  availableSources: videoSourceNames,
                }
              );
            }
          }

          // Check if defaultVideoSourceId is still valid
          if (currentConfig.defaultVideoSourceId !== undefined) {
            const isValidVideoSourceId = sources.video?.some(
              (s: any) => s.id === currentConfig.defaultVideoSourceId
            );

            if (!isValidVideoSourceId) {
              configUpdates.defaultVideoSourceId = undefined;
              coreWarn(
                'Default video source ID no longer available, clearing from config',
                {
                  operation: 'broadcast-box:event:config-cleanup',
                  deviceId: context.deviceId,
                  invalidSourceId: currentConfig.defaultVideoSourceId,
                  availableSourceIds:
                    sources.video?.map((s: any) => s.id) || [],
                }
              );
            }
          }

          // Check if defaultAudioSource is still valid
          if (currentConfig.defaultAudioSource) {
            const isValidAudioSource =
              audioSourceNames.includes(currentConfig.defaultAudioSource) ||
              sources.audio?.some(
                (s: any) =>
                  s.identifier === currentConfig.defaultAudioSource ||
                  s.name === currentConfig.defaultAudioSource
              );

            if (!isValidAudioSource) {
              configUpdates.defaultAudioSource = undefined;
              coreWarn(
                'Default audio source no longer available, clearing from config',
                {
                  operation: 'broadcast-box:event:config-cleanup',
                  deviceId: context.deviceId,
                  invalidSource: currentConfig.defaultAudioSource,
                  availableSources: audioSourceNames,
                }
              );
            }
          }

          // Check if defaultAudioSourceId is still valid
          if (currentConfig.defaultAudioSourceId !== undefined) {
            const isValidAudioSourceId = sources.audio?.some(
              (s: any) => s.id === currentConfig.defaultAudioSourceId
            );

            if (!isValidAudioSourceId) {
              configUpdates.defaultAudioSourceId = undefined;
              coreWarn(
                'Default audio source ID no longer available, clearing from config',
                {
                  operation: 'broadcast-box:event:config-cleanup',
                  deviceId: context.deviceId,
                  invalidSourceId: currentConfig.defaultAudioSourceId,
                  availableSourceIds:
                    sources.audio?.map((s: any) => s.id) || [],
                }
              );
            }
          }

          // Update device if capabilities changed or config needs cleanup
          const capabilitiesChanged =
            JSON.stringify(updatedCapabilities) !==
            JSON.stringify(device.capabilities);
          const configNeedsCleanup = Object.keys(configUpdates).length > 0;

          if (capabilitiesChanged || configNeedsCleanup) {
            const updateData: any = {};

            if (capabilitiesChanged) {
              updateData.capabilities = updatedCapabilities;
            }

            if (configNeedsCleanup) {
              // Merge config updates (clearing invalid values)
              updateData.config = {
                ...currentConfig,
                ...configUpdates,
              };
            }

            await context.deviceManager.updateDevice(
              context.deviceId,
              updateData
            );

            if (capabilitiesChanged) {
              coreInfo(
                'Device capabilities updated from device.connected event',
                {
                  operation: 'broadcast-box:event:capabilities-updated',
                  deviceId: context.deviceId,
                }
              );
            }

            if (configNeedsCleanup) {
              coreInfo('Device config cleaned up (invalid sources removed)', {
                operation: 'broadcast-box:event:config-cleaned',
                deviceId: context.deviceId,
                clearedFields: Object.keys(configUpdates),
              });
            }
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

  // Register preview.started handler
  registry.registerHandler('preview.started', async (event, context) => {
    const { quality } = event.payload || {};

    // Log preview started event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'preview.started',
      eventData: {
        quality,
        startedAt: new Date().toISOString(),
      },
    });

    coreInfo('Preview started event processed', {
      operation: 'broadcast-box:event:preview-started',
      deviceId: context.deviceId,
      quality,
    });
  });

  // Register preview.stopped handler
  registry.registerHandler('preview.stopped', async (event, context) => {
    // Log preview stopped event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'preview.stopped',
      eventData: {
        stoppedAt: new Date().toISOString(),
      },
    });

    coreInfo('Preview stopped event processed', {
      operation: 'broadcast-box:event:preview-stopped',
      deviceId: context.deviceId,
    });
  });

  // Register sources.changed handler (published when sources are updated via sources.set)
  registry.registerHandler('sources.changed', async (event, context) => {
    const payload = event.payload?.eventData ?? event.payload;
    const videoIdentifier = payload?.video;
    const audioIdentifier = payload?.audio;

    if (videoIdentifier === undefined && audioIdentifier === undefined) {
      return;
    }

    try {
      const device = await context.deviceManager.getDevice(context.deviceId);
      if (!device) {
        return;
      }

      const videoSourceObjects = device.capabilities?.videoSourceObjects ?? [];
      const audioSourceObjects = device.capabilities?.audioSourceObjects ?? [];

      const resolveVideo = (identifier: string | undefined): any => {
        if (!identifier) return null;
        if (identifier === 'pip') {
          return { id: 0, identifier: 'pip', name: 'PiP' };
        }
        const obj = videoSourceObjects.find(
          (s: any) =>
            s.identifier === identifier ||
            s.identifier?.toLowerCase() === identifier.toLowerCase() ||
            s.name === identifier ||
            s.name?.toLowerCase() === identifier.toLowerCase()
        );
        if (obj) {
          return {
            id: obj.id,
            identifier: obj.identifier ?? obj.name ?? identifier,
            name: obj.name ?? obj.identifier ?? identifier,
            path: obj.path,
            resolution: obj.resolution,
            framerate: obj.framerate,
            available: obj.available !== false,
          };
        }
        return { id: 0, identifier, name: identifier };
      };

      const resolveAudio = (identifier: string | undefined): any => {
        if (!identifier) return null;
        const obj = audioSourceObjects.find(
          (s: any) =>
            s.identifier === identifier ||
            s.identifier?.toLowerCase() === identifier.toLowerCase() ||
            s.name === identifier ||
            s.name?.toLowerCase() === identifier.toLowerCase()
        );
        if (obj) {
          return {
            id: obj.id,
            identifier: obj.identifier ?? obj.name ?? identifier,
            name: obj.name ?? obj.identifier ?? identifier,
            available: obj.available !== false,
          };
        }
        return { id: 0, identifier, name: identifier };
      };

      const deviceActiveSources = await context.deviceManager
        .getDevice(context.deviceId)
        .then((d) => d?.activeSources ?? { video: null, audio: null });

      const activeVideo =
        videoIdentifier !== undefined
          ? resolveVideo(videoIdentifier)
          : (deviceActiveSources?.video ?? null);
      const activeAudio =
        audioIdentifier !== undefined
          ? resolveAudio(audioIdentifier)
          : (deviceActiveSources?.audio ?? null);

      await context.deviceManager.updateDevice(context.deviceId, {
        activeSources: { video: activeVideo, audio: activeAudio } as any,
      });

      coreInfo('Device active sources updated from sources.changed', {
        operation: 'broadcast-box:event:sources-changed',
        deviceId: context.deviceId,
        video: videoIdentifier,
        audio: audioIdentifier,
      });
    } catch (error) {
      coreWarn('Failed to update device active sources from sources.changed', {
        operation: 'broadcast-box:event:sources-changed-error',
        deviceId: context.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Register streaming.rtmp.started handler
  registry.registerHandler('streaming.rtmp.started', async (event, context) => {
    const payload = event.payload?.eventData ?? event.payload;
    coreInfo('RTMP streaming started', {
      operation: 'broadcast-box:event:streaming-rtmp-started',
      deviceId: context.deviceId,
      platform: payload?.platform,
      url: payload?.url,
    });
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'streaming.rtmp.started',
      eventData: {
        platform: payload?.platform,
        url: payload?.url,
        startedAt: new Date().toISOString(),
      },
    });
  });

  // Register streaming.rtmp.stopped handler
  registry.registerHandler('streaming.rtmp.stopped', async (event, context) => {
    const payload = event.payload?.eventData ?? event.payload;
    coreInfo('RTMP streaming stopped', {
      operation: 'broadcast-box:event:streaming-rtmp-stopped',
      deviceId: context.deviceId,
      platform: payload?.platform,
    });
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'streaming.rtmp.stopped',
      eventData: {
        platform: payload?.platform,
        stoppedAt: new Date().toISOString(),
      },
    });
  });

  // Register streaming.rtmp.connection_failed handler
  registry.registerHandler(
    'streaming.rtmp.connection_failed',
    async (event, context) => {
      const payload = event.payload?.eventData ?? event.payload;
      coreWarn('RTMP connection failed', {
        operation: 'broadcast-box:event:streaming-rtmp-connection-failed',
        deviceId: context.deviceId,
        platform: payload?.platform,
        error: payload?.error,
        retry_count: payload?.retry_count,
      });
      await context.deviceEventModel.create({
        id: uuidv4(),
        deviceId: context.deviceId,
        eventType: 'streaming.rtmp.connection_failed',
        eventData: {
          platform: payload?.platform,
          error: payload?.error,
          retry_count: payload?.retry_count,
          failedAt: new Date().toISOString(),
        },
      });
    }
  );

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

    // Extract and store extended status sections (storage, upload, connection, streaming)
    const extendedSections: Record<string, Record<string, unknown>> = {};
    if (payload.storage && typeof payload.storage === 'object') {
      extendedSections.storage = payload.storage;
    }
    if (payload.upload && typeof payload.upload === 'object') {
      extendedSections.upload = payload.upload;
    }
    if (payload.connection && typeof payload.connection === 'object') {
      extendedSections.connectionInfo = payload.connection;
    }
    if (payload.streaming && typeof payload.streaming === 'object') {
      extendedSections.streaming = payload.streaming;
    }
    if (Object.keys(extendedSections).length > 0) {
      context.connectionTracker.updateExtendedStatus(
        context.deviceId,
        extendedSections
      );
    }

    // Record successful message receipt and reset status failure counter
    context.connectionTracker.recordMessageReceived(context.deviceId);
    context.connectionTracker.resetStatusFailures(context.deviceId);

    // Log session metadata if present
    if (payload.session?.metadata) {
      coreInfo('Status event contains session metadata', {
        operation: 'broadcast-box:event:status-session-metadata',
        deviceId: context.deviceId,
        metadata: payload.session.metadata,
      });
    }

    // Extract and store active sources.
    // Devices may send any of these formats:
    // - payload.active_sources (full objects)
    // - payload.active (id + identifier only)
    // - payload.sources.active (nested under sources in current status payloads)
    const activeSourcesPayload =
      payload.active_sources || payload.active || payload.sources?.active;
    if (activeSourcesPayload !== undefined) {
      try {
        const device = await context.deviceManager.getDevice(context.deviceId);
        if (!device) {
          return;
        }

        // Helper to enrich source object from capabilities if it only has id/identifier
        const enrichSource = (
          source: any,
          sourceObjects: any[] | undefined,
          sourceType: 'video' | 'audio'
        ): any => {
          if (!source) return null;

          // If source already has full info (name, path, etc.), use it as-is
          if (source.name || source.path) {
            return source;
          }

          // Otherwise, look up full source object from capabilities
          if (source.id !== undefined && sourceObjects) {
            const fullSource = sourceObjects.find(
              (s: any) => s.id === source.id
            );
            if (fullSource) {
              // Merge: use identifier from status if provided, otherwise from capabilities
              return {
                id: fullSource.id,
                identifier:
                  source.identifier || fullSource.identifier || fullSource.name,
                name:
                  fullSource.name || source.identifier || fullSource.identifier,
                path: fullSource.path,
                resolution: fullSource.resolution,
                framerate: fullSource.framerate,
                available: fullSource.available !== false,
              };
            }
          }

          // If we have identifier but no full object, try to find by identifier
          if (source.identifier && sourceObjects) {
            const fullSource = sourceObjects.find(
              (s: any) =>
                s.identifier === source.identifier ||
                s.name === source.identifier
            );
            if (fullSource) {
              return {
                id: fullSource.id,
                identifier: fullSource.identifier || source.identifier,
                name: fullSource.name || source.identifier,
                path: fullSource.path,
                resolution: fullSource.resolution,
                framerate: fullSource.framerate,
                available: fullSource.available !== false,
              };
            }
          }

          // If we can't enrich, return what we have (at least id and identifier)
          return source;
        };

        const activeVideo = activeSourcesPayload.video
          ? enrichSource(
              activeSourcesPayload.video,
              device.capabilities?.videoSourceObjects,
              'video'
            )
          : null;

        const activeAudio = activeSourcesPayload.audio
          ? enrichSource(
              activeSourcesPayload.audio,
              device.capabilities?.audioSourceObjects,
              'audio'
            )
          : null;

        const activeSources = {
          video: activeVideo,
          audio: activeAudio,
        };

        await context.deviceManager.updateDevice(context.deviceId, {
          activeSources: activeSources as any,
        });

        coreInfo('Device active sources updated from status', {
          operation: 'broadcast-box:event:status-active-sources-updated',
          deviceId: context.deviceId,
          hasVideoSource: !!activeSources.video,
          hasAudioSource: !!activeSources.audio,
          videoSourceId: activeSources.video?.id,
          audioSourceId: activeSources.audio?.id,
          videoSourceIdentifier: activeSources.video?.identifier,
          audioSourceIdentifier: activeSources.audio?.identifier,
        });
      } catch (error) {
        coreWarn('Failed to update device active sources from status event', {
          operation: 'broadcast-box:event:status-active-sources-update-error',
          deviceId: context.deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Extract and store PiP configuration.
    // New devices send this under payload.sources.pip, older devices may use payload.pip.
    const pipPayload = payload.pip || payload.sources?.pip;
    if (pipPayload !== undefined) {
      try {
        const device = await context.deviceManager.getDevice(context.deviceId);
        if (!device) {
          return;
        }

        const resolveVideoSource = (identifier: string | null | undefined) => {
          if (!identifier) return null;
          const sourceObjects = device.capabilities?.videoSourceObjects || [];
          const match = sourceObjects.find(
            (s: any) =>
              s.identifier === identifier ||
              s.identifier?.toLowerCase?.() === identifier.toLowerCase() ||
              s.name === identifier ||
              s.name?.toLowerCase?.() === identifier.toLowerCase()
          );
          if (match) {
            return match;
          }
          // Preserve identifier even if we can't resolve it to an ID
          return {
            id: -1,
            identifier,
            name: identifier,
            available: true,
          };
        };

        const pipConfig = {
          supported:
            pipPayload.supported !== undefined
              ? Boolean(pipPayload.supported)
              : true,
          configured: Boolean(
            pipPayload.configured ?? pipPayload.enabled ?? false
          ),
          pipSource: resolveVideoSource(pipPayload.pip_source),
          mainSource: resolveVideoSource(pipPayload.main_source),
          position: pipPayload.position || 'top_right',
          size: pipPayload.size || { width: 320, height: 240 },
        };

        await context.deviceManager.updateDevice(context.deviceId, {
          pipConfig: pipConfig as any,
        });

        coreInfo('Device PiP configuration updated from status', {
          operation: 'broadcast-box:event:status-pip-config-updated',
          deviceId: context.deviceId,
          pipConfigured: pipConfig.configured,
          pipSupported: pipConfig.supported,
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

    // Update capabilities from payload.sources if provided (device sends sources.video and sources.audio arrays)
    // This is the primary way devices send source information in status messages
    if (payload.sources) {
      try {
        const device = await context.deviceManager.getDevice(context.deviceId);
        if (device) {
          // Extract source names from detailed source objects for backward compatibility
          const videoSourceNames =
            payload.sources.video?.map(
              (s: any) => s.identifier || s.name || s.path || `Source ${s.id}`
            ) || [];
          const audioSourceNames =
            payload.sources.audio?.map(
              (s: any) => s.identifier || s.name || `Source ${s.id}`
            ) || [];

          const updatedCapabilities = {
            ...device.capabilities,
            videoSources:
              videoSourceNames.length > 0
                ? videoSourceNames
                : device.capabilities?.videoSources || [],
            audioSources:
              audioSourceNames.length > 0
                ? audioSourceNames
                : device.capabilities?.audioSources || [],
            videoSourceObjects:
              payload.sources.video ||
              device.capabilities?.videoSourceObjects ||
              [],
            audioSourceObjects:
              payload.sources.audio ||
              device.capabilities?.audioSourceObjects ||
              [],
            // Quick PiP support indicator (new devices send this in status as sources.pip.supported)
            pipSupported:
              payload.sources.pip?.supported !== undefined
                ? Boolean(payload.sources.pip.supported)
                : device.capabilities?.pipSupported,
          };

          // Validate and clean up device config if capabilities changed
          let configUpdates: any = {};
          const currentConfig = device.config || {};
          const capabilitiesChanged =
            JSON.stringify(updatedCapabilities) !==
            JSON.stringify(device.capabilities);

          // Only validate config if capabilities actually changed
          if (capabilitiesChanged) {
            // Check if defaultVideoSource is still valid
            if (currentConfig.defaultVideoSource) {
              const isValidVideoSource =
                videoSourceNames.includes(currentConfig.defaultVideoSource) ||
                payload.sources.video?.some(
                  (s: any) =>
                    s.identifier === currentConfig.defaultVideoSource ||
                    s.name === currentConfig.defaultVideoSource
                );

              if (!isValidVideoSource) {
                configUpdates.defaultVideoSource = undefined;
                coreWarn(
                  'Default video source no longer available, clearing from config',
                  {
                    operation:
                      'broadcast-box:event:status-sources-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSource: currentConfig.defaultVideoSource,
                    availableSources: videoSourceNames,
                  }
                );
              }
            }

            // Check if defaultVideoSourceId is still valid
            if (currentConfig.defaultVideoSourceId !== undefined) {
              const isValidVideoSourceId = payload.sources.video?.some(
                (s: any) => s.id === currentConfig.defaultVideoSourceId
              );

              if (!isValidVideoSourceId) {
                configUpdates.defaultVideoSourceId = undefined;
                coreWarn(
                  'Default video source ID no longer available, clearing from config',
                  {
                    operation:
                      'broadcast-box:event:status-sources-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSourceId: currentConfig.defaultVideoSourceId,
                    availableSourceIds:
                      payload.sources.video?.map((s: any) => s.id) || [],
                  }
                );
              }
            }

            // Check if defaultAudioSource is still valid
            if (currentConfig.defaultAudioSource) {
              const isValidAudioSource =
                audioSourceNames.includes(currentConfig.defaultAudioSource) ||
                payload.sources.audio?.some(
                  (s: any) =>
                    s.identifier === currentConfig.defaultAudioSource ||
                    s.name === currentConfig.defaultAudioSource
                );

              if (!isValidAudioSource) {
                configUpdates.defaultAudioSource = undefined;
                coreWarn(
                  'Default audio source no longer available, clearing from config',
                  {
                    operation:
                      'broadcast-box:event:status-sources-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSource: currentConfig.defaultAudioSource,
                    availableSources: audioSourceNames,
                  }
                );
              }
            }

            // Check if defaultAudioSourceId is still valid
            if (currentConfig.defaultAudioSourceId !== undefined) {
              const isValidAudioSourceId = payload.sources.audio?.some(
                (s: any) => s.id === currentConfig.defaultAudioSourceId
              );

              if (!isValidAudioSourceId) {
                configUpdates.defaultAudioSourceId = undefined;
                coreWarn(
                  'Default audio source ID no longer available, clearing from config',
                  {
                    operation:
                      'broadcast-box:event:status-sources-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSourceId: currentConfig.defaultAudioSourceId,
                    availableSourceIds:
                      payload.sources.audio?.map((s: any) => s.id) || [],
                  }
                );
              }
            }
          }

          // Update device if capabilities changed or config needs cleanup
          const configNeedsCleanup = Object.keys(configUpdates).length > 0;
          const updateData: any = {};

          if (capabilitiesChanged) {
            updateData.capabilities = updatedCapabilities;
          }

          if (configNeedsCleanup) {
            // Merge config updates (clearing invalid values)
            updateData.config = {
              ...currentConfig,
              ...configUpdates,
            };
          }

          if (capabilitiesChanged || configNeedsCleanup) {
            await context.deviceManager.updateDevice(
              context.deviceId,
              updateData
            );

            if (capabilitiesChanged) {
              coreInfo('Device capabilities updated from status (sources)', {
                operation:
                  'broadcast-box:event:status-sources-capabilities-updated',
                deviceId: context.deviceId,
                videoSourcesCount: videoSourceNames.length,
                audioSourcesCount: audioSourceNames.length,
              });
            }

            if (configNeedsCleanup) {
              coreInfo('Device config cleaned up (invalid sources removed)', {
                operation: 'broadcast-box:event:status-sources-config-cleaned',
                deviceId: context.deviceId,
                clearedFields: Object.keys(configUpdates),
              });
            }
          }
        }
      } catch (error) {
        coreWarn('Failed to update device capabilities from status sources', {
          operation: 'broadcast-box:event:status-sources-update-error',
          deviceId: context.deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update capabilities if provided (device sends: capabilities.video_sources, capabilities.audio_sources, capabilities.pip, capabilities.hardware_encoding)
    // This is a fallback format - most devices send sources directly
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
              ? typeof payload.capabilities.pip === 'object' &&
                payload.capabilities.pip !== null
                ? Boolean(payload.capabilities.pip.supported)
                : Boolean(payload.capabilities.pip)
              : payload.capabilities.pipSupported !== undefined
                ? Boolean(payload.capabilities.pipSupported)
                : device.capabilities?.pipSupported;

          const hardwareEncoding =
            payload.capabilities.hardware_encoding !== undefined
              ? typeof payload.capabilities.hardware_encoding === 'object' &&
                payload.capabilities.hardware_encoding !== null
                ? Boolean(payload.capabilities.hardware_encoding.supported)
                : Boolean(payload.capabilities.hardware_encoding)
              : payload.capabilities.hardwareEncoding !== undefined
                ? Boolean(payload.capabilities.hardwareEncoding)
                : device.capabilities?.hardwareEncoding;

          // Optional: audio mixing capability object (new devices send this in device.connected)
          const audioMixing =
            payload.capabilities.audio_mixing !== undefined &&
            typeof payload.capabilities.audio_mixing === 'object' &&
            payload.capabilities.audio_mixing !== null
              ? {
                  supported: Boolean(
                    payload.capabilities.audio_mixing.supported
                  ),
                  maxInputs:
                    typeof payload.capabilities.audio_mixing.max_inputs ===
                    'number'
                      ? payload.capabilities.audio_mixing.max_inputs
                      : undefined,
                }
              : undefined;

          const pipCapabilities =
            payload.capabilities.pip !== undefined &&
            typeof payload.capabilities.pip === 'object' &&
            payload.capabilities.pip !== null
              ? {
                  supported: Boolean(payload.capabilities.pip.supported),
                  maxSources:
                    typeof payload.capabilities.pip.max_sources === 'number'
                      ? payload.capabilities.pip.max_sources
                      : undefined,
                  supportedPositions: Array.isArray(
                    payload.capabilities.pip.supported_positions
                  )
                    ? payload.capabilities.pip.supported_positions
                    : undefined,
                  minSize:
                    payload.capabilities.pip.min_size &&
                    typeof payload.capabilities.pip.min_size.width ===
                      'number' &&
                    typeof payload.capabilities.pip.min_size.height === 'number'
                      ? {
                          width: payload.capabilities.pip.min_size.width,
                          height: payload.capabilities.pip.min_size.height,
                        }
                      : undefined,
                  maxSize:
                    payload.capabilities.pip.max_size &&
                    typeof payload.capabilities.pip.max_size.width ===
                      'number' &&
                    typeof payload.capabilities.pip.max_size.height === 'number'
                      ? {
                          width: payload.capabilities.pip.max_size.width,
                          height: payload.capabilities.pip.max_size.height,
                        }
                      : undefined,
                }
              : undefined;

          const hardwareEncodingCapabilities =
            payload.capabilities.hardware_encoding !== undefined &&
            typeof payload.capabilities.hardware_encoding === 'object' &&
            payload.capabilities.hardware_encoding !== null
              ? {
                  supported: Boolean(
                    payload.capabilities.hardware_encoding.supported
                  ),
                }
              : undefined;

          const qualityFromStatus = normalizeQualityFromPayload(
            payload.capabilities.quality
          );

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
            ...(pipCapabilities ? { pipCapabilities } : {}),
            ...(audioMixing ? { audioMixingCapabilities: audioMixing } : {}),
            ...(hardwareEncodingCapabilities
              ? { hardwareEncodingCapabilities }
              : {}),
            ...(qualityFromStatus ? { quality: qualityFromStatus } : {}),
            // Preserve existing source objects if they exist
            videoSourceObjects: device.capabilities?.videoSourceObjects || [],
            audioSourceObjects: device.capabilities?.audioSourceObjects || [],
          };

          // Validate and clean up device config if capabilities changed
          let configUpdates: any = {};
          const currentConfig = device.config || {};
          const capabilitiesChanged =
            JSON.stringify(updatedCapabilities) !==
            JSON.stringify(device.capabilities);

          // Only validate config if capabilities actually changed
          if (capabilitiesChanged) {
            // Check if defaultVideoSource is still valid
            if (currentConfig.defaultVideoSource) {
              const isValidVideoSource = videoSources.includes(
                currentConfig.defaultVideoSource
              );

              if (!isValidVideoSource) {
                configUpdates.defaultVideoSource = undefined;
                coreWarn(
                  'Default video source no longer available, clearing from config',
                  {
                    operation: 'broadcast-box:event:status-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSource: currentConfig.defaultVideoSource,
                    availableSources: videoSources,
                  }
                );
              }
            }

            // Check if defaultVideoSourceId is still valid
            if (currentConfig.defaultVideoSourceId !== undefined) {
              const videoSourceObjects =
                device.capabilities?.videoSourceObjects || [];
              const isValidVideoSourceId = videoSourceObjects.some(
                (s: any) => s.id === currentConfig.defaultVideoSourceId
              );

              if (!isValidVideoSourceId) {
                configUpdates.defaultVideoSourceId = undefined;
                coreWarn(
                  'Default video source ID no longer available, clearing from config',
                  {
                    operation: 'broadcast-box:event:status-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSourceId: currentConfig.defaultVideoSourceId,
                  }
                );
              }
            }

            // Check if defaultAudioSource is still valid
            if (currentConfig.defaultAudioSource) {
              const isValidAudioSource = audioSources.includes(
                currentConfig.defaultAudioSource
              );

              if (!isValidAudioSource) {
                configUpdates.defaultAudioSource = undefined;
                coreWarn(
                  'Default audio source no longer available, clearing from config',
                  {
                    operation: 'broadcast-box:event:status-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSource: currentConfig.defaultAudioSource,
                    availableSources: audioSources,
                  }
                );
              }
            }

            // Check if defaultAudioSourceId is still valid
            if (currentConfig.defaultAudioSourceId !== undefined) {
              const audioSourceObjects =
                device.capabilities?.audioSourceObjects || [];
              const isValidAudioSourceId = audioSourceObjects.some(
                (s: any) => s.id === currentConfig.defaultAudioSourceId
              );

              if (!isValidAudioSourceId) {
                configUpdates.defaultAudioSourceId = undefined;
                coreWarn(
                  'Default audio source ID no longer available, clearing from config',
                  {
                    operation: 'broadcast-box:event:status-config-cleanup',
                    deviceId: context.deviceId,
                    invalidSourceId: currentConfig.defaultAudioSourceId,
                  }
                );
              }
            }
          }

          // Update device if capabilities changed or config needs cleanup
          const configNeedsCleanup = Object.keys(configUpdates).length > 0;
          const updateData: any = {};

          if (capabilitiesChanged) {
            updateData.capabilities = updatedCapabilities;
          }

          if (configNeedsCleanup) {
            // Merge config updates (clearing invalid values)
            updateData.config = {
              ...currentConfig,
              ...configUpdates,
            };
          }

          if (capabilitiesChanged || configNeedsCleanup) {
            await context.deviceManager.updateDevice(
              context.deviceId,
              updateData
            );

            if (capabilitiesChanged) {
              coreInfo('Device capabilities updated from status', {
                operation: 'broadcast-box:event:status-capabilities-updated',
                deviceId: context.deviceId,
                videoSourcesCount: videoSources.length,
                audioSourcesCount: audioSources.length,
                pipSupported,
                hardwareEncoding,
              });
            }

            if (configNeedsCleanup) {
              coreInfo('Device config cleaned up (invalid sources removed)', {
                operation: 'broadcast-box:event:status-config-cleaned',
                deviceId: context.deviceId,
                clearedFields: Object.keys(configUpdates),
              });
            }
          }
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
        // Prefer the new location (payload.sources.pip), fallback to legacy (payload.pip)
        pip: payload.pip || payload.sources?.pip,
        storage: payload.storage,
        upload: payload.upload,
        connection: payload.connection,
        streaming: payload.streaming,
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
