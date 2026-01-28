/**
 * Command Handlers
 *
 * Handles commands sent from CivicPress to Broadcast Box devices
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import type { CommandMessage, AckMessage } from '../types/index.js';
import {
  BroadcastBoxErrorCode,
  BroadcastBoxError,
  SourceError,
  SessionError,
  StreamingError,
  isBroadcastBoxError,
  toStructuredError,
} from '../types/errors.js';
import type { ProtocolHandler } from './protocol.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { DeviceManager } from '../services/device-manager.js';
import type { Room } from '@civicpress/realtime';

export interface CommandHandlerContext {
  deviceId: string;
  clientId: string;
  room: Room;
  connectionTracker: DeviceConnectionTracker;
  deviceManager: DeviceManager;
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

      return context.protocol.createAck(command.id, false, {
        code: BroadcastBoxErrorCode.ERR_INVALID_COMMAND,
        message: `Unknown command action: ${command.action}`,
        type: 'BroadcastBoxError',
      });
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

      const structured = isBroadcastBoxError(error)
        ? error.toDict()
        : toStructuredError(error);
      return context.protocol.createAck(command.id, false, structured);
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
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_MISSING_PARAMETER,
          'Missing required fields: sessionId or civicpressSessionId'
        ).toDict()
      );
    }

    // Check if device is already recording
    const connectionState = context.connectionTracker.getConnectionState(
      context.deviceId
    );
    if (connectionState?.state?.status === 'recording') {
      return context.protocol.createAck(
        command.id,
        false,
        new SessionError(
          BroadcastBoxErrorCode.ERR_SESSION_ALREADY_ACTIVE
        ).toDict()
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
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_MISSING_PARAMETER,
          'Missing required field: sessionId'
        ).toDict()
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
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_MISSING_PARAMETER,
          'Missing required field: config'
        ).toDict()
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

  // Register switch_source handler (deprecated: use sources.set instead; kept for backward compatibility)
  registry.registerHandler('switch_source', async (command, context) => {
    coreWarn('switch_source is deprecated, use sources.set instead', {
      operation: 'broadcast-box:command:switch-source-deprecated',
      deviceId: context.deviceId,
    });
    // Support both protocol format (sourceType + sourceId) and current format (videoSource/audioSource)
    const { sourceType, sourceId, videoSource, audioSource } = command.payload;

    // Get device to validate capabilities
    const device = await context.deviceManager.getDevice(context.deviceId);
    if (!device) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_DEVICE_NOT_FOUND
        ).toDict()
      );
    }

    // Protocol format: sourceType + sourceId
    if (sourceType && sourceId !== undefined) {
      let isValid = false;
      let sourceName: string | undefined;

      if (sourceType === 'video') {
        // Check if source ID exists in videoSourceObjects
        const videoSourceObj = device.capabilities.videoSourceObjects?.find(
          (s) => s.id === sourceId
        );
        if (videoSourceObj) {
          isValid = true;
          sourceName = videoSourceObj.name;
          // Check availability
          if (!videoSourceObj.available) {
            return context.protocol.createAck(
              command.id,
              false,
              new SourceError(
                BroadcastBoxErrorCode.SOURCE_NOT_AVAILABLE
              ).toDict()
            );
          }
        } else {
          return context.protocol.createAck(
            command.id,
            false,
            new SourceError(BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND).toDict()
          );
        }
      } else if (sourceType === 'audio') {
        const audioSourceObj = device.capabilities.audioSourceObjects?.find(
          (s) => s.id === sourceId
        );
        if (audioSourceObj) {
          isValid = true;
          sourceName = audioSourceObj.name;
          if (!audioSourceObj.available) {
            return context.protocol.createAck(
              command.id,
              false,
              new SourceError(
                BroadcastBoxErrorCode.SOURCE_NOT_AVAILABLE
              ).toDict()
            );
          }
        } else {
          return context.protocol.createAck(
            command.id,
            false,
            new SourceError(BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND).toDict()
          );
        }
      } else if (sourceType === 'pip') {
        // PiP source switching (future enhancement)
        return context.protocol.createAck(
          command.id,
          false,
          new BroadcastBoxError(
            BroadcastBoxErrorCode.INVALID_CONFIG,
            'PiP source switching not yet implemented'
          ).toDict()
        );
      }

      if (isValid) {
        coreInfo('Switch source command processed (protocol format)', {
          operation: 'broadcast-box:command:switch-source',
          deviceId: context.deviceId,
          sourceType,
          sourceId,
          sourceName,
        });

        return context.protocol.createAck(command.id, true, undefined, {
          sourceType,
          sourceId,
          sourceName,
        });
      }
    }

    // Current format: videoSource/audioSource (string names or numeric IDs)
    // At least one source must be provided
    if (!videoSource && !audioSource) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_MISSING_PARAMETER,
          'At least one source (videoSource or audioSource) must be provided'
        ).toDict()
      );
    }

    // Validate video source (supports both string names and numeric IDs)
    if (videoSource !== undefined) {
      const isNumericId = typeof videoSource === 'number';
      let isValid = false;

      if (isNumericId) {
        // Check numeric ID in videoSourceObjects
        const videoSourceObj = device.capabilities.videoSourceObjects?.find(
          (s) => s.id === videoSource
        );
        if (videoSourceObj) {
          isValid = true;
          if (!videoSourceObj.available) {
            return context.protocol.createAck(
              command.id,
              false,
              new SourceError(
                BroadcastBoxErrorCode.SOURCE_NOT_AVAILABLE
              ).toDict()
            );
          }
        }
      } else {
        // Check string name in videoSources array
        isValid = device.capabilities.videoSources.includes(
          videoSource as string
        );
      }

      if (!isValid) {
        return context.protocol.createAck(
          command.id,
          false,
          new SourceError(BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND).toDict()
        );
      }
    }

    // Validate audio source (supports both string names and numeric IDs)
    if (audioSource !== undefined) {
      const isNumericId = typeof audioSource === 'number';
      let isValid = false;

      if (isNumericId) {
        const audioSourceObj = device.capabilities.audioSourceObjects?.find(
          (s) => s.id === audioSource
        );
        if (audioSourceObj) {
          isValid = true;
          if (!audioSourceObj.available) {
            return context.protocol.createAck(
              command.id,
              false,
              new SourceError(
                BroadcastBoxErrorCode.SOURCE_NOT_AVAILABLE
              ).toDict()
            );
          }
        }
      } else {
        isValid = device.capabilities.audioSources.includes(
          audioSource as string
        );
      }

      if (!isValid) {
        return context.protocol.createAck(
          command.id,
          false,
          new SourceError(BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND).toDict()
        );
      }
    }

    coreInfo('Switch source command processed', {
      operation: 'broadcast-box:command:switch-source',
      deviceId: context.deviceId,
      videoSource,
      audioSource,
    });

    // Return current active sources (device will handle the actual switch)
    return context.protocol.createAck(command.id, true, undefined, {
      videoSource: videoSource || device.config.defaultVideoSource,
      audioSource: audioSource || device.config.defaultAudioSource,
    });
  });

  // Register sources.set handler (primary way to set active video/audio; used by all commands)
  registry.registerHandler('sources.set', async (command, context) => {
    const { video, audio } = command.payload || {};

    if (!video && !audio) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_MISSING_PARAMETER,
          'At least one of video or audio must be provided'
        ).toDict()
      );
    }

    const device = await context.deviceManager.getDevice(context.deviceId);
    if (!device) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_DEVICE_NOT_FOUND
        ).toDict()
      );
    }

    // Validate video: device identifier or "pip"
    if (video !== undefined && video !== 'pip') {
      const videoValid =
        device.capabilities.videoSources?.includes(video) ||
        device.capabilities.videoSourceObjects?.some(
          (s) =>
            s.identifier === video ||
            s.identifier?.toLowerCase() === video.toLowerCase() ||
            s.name === video ||
            s.name?.toLowerCase() === video.toLowerCase()
        );
      if (!videoValid) {
        return context.protocol.createAck(
          command.id,
          false,
          new SourceError(BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND).toDict()
        );
      }
    }

    // Validate audio: device identifier
    if (audio !== undefined) {
      const audioValid =
        device.capabilities.audioSources?.includes(audio) ||
        device.capabilities.audioSourceObjects?.some(
          (s) =>
            s.identifier === audio ||
            s.identifier?.toLowerCase() === audio.toLowerCase() ||
            s.name === audio ||
            s.name?.toLowerCase() === audio.toLowerCase()
        );
      if (!audioValid) {
        return context.protocol.createAck(
          command.id,
          false,
          new SourceError(BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND).toDict()
        );
      }
    }

    coreInfo('Sources set command processed', {
      operation: 'broadcast-box:command:sources-set',
      deviceId: context.deviceId,
      video,
      audio,
    });

    return context.protocol.createAck(command.id, true, undefined, {
      video: video ?? device.config.defaultVideoSource,
      audio: audio ?? device.config.defaultAudioSource,
      status: 'configured',
    });
  });

  // Register list_sources handler (also support get_sources for protocol compatibility)
  const listSourcesHandler = async (
    command: CommandMessage,
    context: CommandHandlerContext
  ) => {
    // Get device to retrieve capabilities
    const device = await context.deviceManager.getDevice(context.deviceId);
    if (!device) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_DEVICE_NOT_FOUND
        ).toDict()
      );
    }

    coreInfo('List sources command processed', {
      operation: 'broadcast-box:command:list-sources',
      deviceId: context.deviceId,
    });

    // Return detailed source objects if available, otherwise fall back to string arrays
    return context.protocol.createAck(command.id, true, undefined, {
      // Protocol format: detailed source objects
      video:
        device.capabilities.videoSourceObjects ||
        device.capabilities.videoSources.map((name, idx) => ({
          id: idx,
          name,
          available: true, // Assume available if we don't have detailed info
        })),
      audio:
        device.capabilities.audioSourceObjects ||
        device.capabilities.audioSources.map((name, idx) => ({
          id: idx,
          name,
          available: true,
        })),
      // Legacy format: string arrays (for backward compatibility)
      videoSources: device.capabilities.videoSources || [],
      audioSources: device.capabilities.audioSources || [],
      // Current active sources
      currentVideoSource: device.config.defaultVideoSource,
      currentAudioSource: device.config.defaultAudioSource,
      currentVideoSourceId: device.config.defaultVideoSourceId,
      currentAudioSourceId: device.config.defaultAudioSourceId,
    });
  };

  registry.registerHandler('list_sources', listSourcesHandler);
  // Also register get_sources for protocol compatibility
  registry.registerHandler('get_sources', listSourcesHandler);

  // Register set_pip handler (also support configure_pip for protocol compatibility)
  const setPipHandler = async (
    command: CommandMessage,
    context: CommandHandlerContext
  ) => {
    const { mainSource, pipSource, pipPosition, pipSize } = command.payload;

    // Get device to validate capabilities
    const device = await context.deviceManager.getDevice(context.deviceId);
    if (!device) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_DEVICE_NOT_FOUND
        ).toDict()
      );
    }

    // Check if device supports PiP
    if (!device.capabilities.pipSupported) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(BroadcastBoxErrorCode.PIP_NOT_SUPPORTED).toDict()
      );
    }

    // Validate mainSource is provided
    if (!mainSource) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.ERR_MISSING_PARAMETER,
          'mainSource is required'
        ).toDict()
      );
    }

    // Helper to validate and convert source identifier to numeric ID
    const validateAndConvertSource = (
      sourceIdentifier: string | number | null | undefined,
      sourceName: string
    ): { id: number; identifier: string } | null => {
      if (sourceIdentifier === null || sourceIdentifier === undefined) {
        return null;
      }

      const isNumericId = typeof sourceIdentifier === 'number';
      let sourceId: number | undefined;
      let sourceObj: any;

      if (isNumericId) {
        sourceId = sourceIdentifier;
        sourceObj = device.capabilities.videoSourceObjects?.find(
          (s) => s.id === sourceId
        );
      } else {
        // String identifier - find in videoSourceObjects
        sourceObj = device.capabilities.videoSourceObjects?.find(
          (s) =>
            s.identifier === sourceIdentifier ||
            s.identifier?.toLowerCase() === sourceIdentifier.toLowerCase() ||
            s.name === sourceIdentifier ||
            s.name?.toLowerCase() === sourceIdentifier.toLowerCase()
        );
        if (sourceObj) {
          sourceId = sourceObj.id;
        } else {
          // Try to find in string array and use index
          const index = device.capabilities.videoSources?.findIndex(
            (s) =>
              s === sourceIdentifier ||
              s.toLowerCase() === sourceIdentifier.toLowerCase()
          );
          if (index >= 0) {
            sourceId = index;
            sourceObj = { id: index, identifier: sourceIdentifier };
          }
        }
      }

      if (!sourceObj && sourceId !== undefined) {
        // Try to find by numeric ID if we have one
        sourceObj = device.capabilities.videoSourceObjects?.find(
          (s) => s.id === sourceId
        );
      }

      if (!sourceObj || sourceId === undefined) {
        throw new Error(
          `${sourceName} "${sourceIdentifier}" not found in device capabilities`
        );
      }

      // Check availability if field exists
      if (sourceObj.available === false) {
        throw new Error(`${sourceName} "${sourceIdentifier}" is not available`);
      }

      return {
        id: sourceId,
        identifier:
          sourceObj.identifier || sourceObj.name || String(sourceIdentifier),
      };
    };

    // Validate and convert mainSource
    let mainSourceInfo: { id: number; identifier: string };
    try {
      const validated = validateAndConvertSource(mainSource, 'mainSource');
      if (!validated) {
        return context.protocol.createAck(
          command.id,
          false,
          'mainSource is required',
          undefined,
          BroadcastBoxErrorCode.INVALID_CONFIG
        );
      }
      mainSourceInfo = validated;
    } catch (error: any) {
      return context.protocol.createAck(
        command.id,
        false,
        error.message || 'Invalid mainSource',
        undefined,
        BroadcastBoxErrorCode.SOURCE_NOT_FOUND
      );
    }

    // Validate and convert pipSource (if not null)
    let pipSourceInfo: { id: number; identifier: string } | null = null;
    if (pipSource !== null && pipSource !== undefined) {
      try {
        const validated = validateAndConvertSource(pipSource, 'pipSource');
        if (validated) {
          // Ensure pipSource is different from mainSource
          if (validated.id === mainSourceInfo.id) {
            return context.protocol.createAck(
              command.id,
              false,
              new BroadcastBoxError(
                BroadcastBoxErrorCode.INVALID_CONFIG,
                'pipSource must be different from mainSource'
              ).toDict()
            );
          }
          pipSourceInfo = validated;
        }
      } catch (error: any) {
        return context.protocol.createAck(
          command.id,
          false,
          new SourceError(
            BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND,
            error.message || 'Invalid pipSource'
          ).toDict()
        );
      }
    }

    // Validate pipPosition
    const validPositions = [
      'top_left',
      'top_right',
      'bottom_left',
      'bottom_right',
      'center',
    ];
    const position = pipPosition || 'top_right'; // Default
    if (!validPositions.includes(position)) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.INVALID_CONFIG,
          `Invalid pipPosition: ${position}. Must be one of: ${validPositions.join(', ')}`
        ).toDict()
      );
    }

    // Validate pipSize (single number, fraction of frame, e.g. 0.25 = 25%)
    const defaultPipSize = 0.25;
    const pipSizeValue = typeof pipSize === 'number' ? pipSize : defaultPipSize;
    if (
      typeof pipSizeValue !== 'number' ||
      pipSizeValue <= 0 ||
      pipSizeValue > 1 ||
      !Number.isFinite(pipSizeValue)
    ) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.INVALID_CONFIG,
          'pipSize must be a number in range (0, 1] (e.g. 0.25 for 25%)'
        ).toDict()
      );
    }

    coreInfo('Set PiP command processed', {
      operation: 'broadcast-box:command:set-pip',
      deviceId: context.deviceId,
      mainSource: mainSourceInfo.identifier,
      mainSourceId: mainSourceInfo.id,
      pipSource: pipSourceInfo?.identifier || null,
      pipSourceId: pipSourceInfo?.id || null,
      position,
      pipSize: pipSizeValue,
    });

    // Return success with configured values (pipSize as single number)
    return context.protocol.createAck(command.id, true, undefined, {
      mainSource: mainSourceInfo.identifier,
      mainSourceId: mainSourceInfo.id,
      pipSource: pipSourceInfo?.identifier || null,
      pipSourceId: pipSourceInfo?.id || null,
      pipPosition: position,
      pipSize: pipSizeValue,
      enabled: pipSourceInfo !== null,
    });
  };

  registry.registerHandler('set_pip', setPipHandler);
  registry.registerHandler('configure_pip', setPipHandler); // Alias
  registry.registerHandler('pip.configure', setPipHandler); // Alias (protocol name)

  // Register preview.start handler
  registry.registerHandler('preview.start', async (command, context) => {
    const { quality } = command.payload || {};

    // Optional quality parameters (default: 640x360 @ 15fps, 500 kbps)
    const defaultQuality = {
      width: 640,
      height: 360,
      framerate: 15,
      bitrate: 500,
    };

    const previewQuality = quality
      ? {
          width: quality.width || defaultQuality.width,
          height: quality.height || defaultQuality.height,
          framerate: quality.framerate || defaultQuality.framerate,
          bitrate: quality.bitrate || defaultQuality.bitrate,
        }
      : defaultQuality;

    // Validate quality parameters
    if (
      previewQuality.width <= 0 ||
      previewQuality.height <= 0 ||
      previewQuality.framerate <= 0 ||
      previewQuality.bitrate <= 0
    ) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.INVALID_CONFIG,
          'Invalid quality parameters: width, height, framerate, and bitrate must be positive numbers'
        ).toDict()
      );
    }

    coreInfo('Preview start command processed', {
      operation: 'broadcast-box:command:preview-start',
      deviceId: context.deviceId,
      quality: previewQuality,
    });

    // Note: The device will create the WebRTC offer and send it via:
    // 1. ACK response (in result.offer)
    // 2. preview.offer event (for redundancy)
    // We return success here - the actual offer will come from the device
    return context.protocol.createAck(command.id, true, undefined, {
      quality: previewQuality,
      // The device will include the offer in the ACK result
      // This is a placeholder - actual offer comes from device
    });
  });

  // Register preview.stop handler
  registry.registerHandler('preview.stop', async (command, context) => {
    coreInfo('Preview stop command processed', {
      operation: 'broadcast-box:command:preview-stop',
      deviceId: context.deviceId,
    });

    // Return success - device will handle stopping the preview
    return context.protocol.createAck(command.id, true, undefined, {
      stopped: true,
    });
  });

  // Register record.start handler
  registry.registerHandler('record.start', async (command, context) => {
    const { config } = command.payload || {};

    coreInfo('Manual recording start command processed', {
      operation: 'broadcast-box:command:record-start',
      deviceId: context.deviceId,
      config,
    });

    // Forward command to device - device will handle starting the recording
    // and send back ACK with recording_id, file_path, etc.
    // Return success - device will handle starting the recording and send ACK
    return context.protocol.createAck(command.id, true, undefined, {
      // Device will include recording_id, file_path, etc. in the ACK
    });
  });

  // Register record.stop handler
  registry.registerHandler('record.stop', async (command, context) => {
    coreInfo('Manual recording stop command processed', {
      operation: 'broadcast-box:command:record-stop',
      deviceId: context.deviceId,
    });

    // Forward command to device - device will handle stopping the recording
    // and send back ACK with final recording details
    // Return success - device will handle stopping the recording and send ACK
    return context.protocol.createAck(command.id, true, undefined, {
      // Device will include recording_id, file_path, duration_seconds, file_size_bytes, etc. in the ACK
    });
  });

  // Register record.list handler
  registry.registerHandler('record.list', async (command, context) => {
    coreInfo('Manual recording list command processed', {
      operation: 'broadcast-box:command:record-list',
      deviceId: context.deviceId,
    });

    // Forward command to device - device will handle listing recordings
    // and send back ACK with recordings array
    // Return success - device will handle listing recordings and send ACK
    return context.protocol.createAck(command.id, true, undefined, {
      // Device will include recordings array in the ACK
    });
  });

  // Register stream.configure handler (RTMP destination; persisted on device)
  registry.registerHandler('stream.configure', async (command, context) => {
    const { url, stream_key, platform } = command.payload || {};
    if (!url || !stream_key) {
      return context.protocol.createAck(
        command.id,
        false,
        new StreamingError(
          BroadcastBoxErrorCode.ERR_STREAMING_NOT_CONFIGURED,
          'url and stream_key are required'
        ).toDict()
      );
    }
    const validPlatforms = ['youtube', 'facebook', 'twitch', 'generic'];
    const platformValue = platform ?? 'generic';
    if (!validPlatforms.includes(platformValue)) {
      return context.protocol.createAck(
        command.id,
        false,
        new BroadcastBoxError(
          BroadcastBoxErrorCode.INVALID_CONFIG,
          `platform must be one of: ${validPlatforms.join(', ')}`
        ).toDict()
      );
    }
    coreInfo('Stream configure command processed', {
      operation: 'broadcast-box:command:stream-configure',
      deviceId: context.deviceId,
      platform: platformValue,
    });
    return context.protocol.createAck(command.id, true, undefined, {
      status: 'configured',
      platform: platformValue,
      url,
      stream_key_set: true,
    });
  });

  // Register stream.start handler (start RTMP streaming; optional quality)
  registry.registerHandler('stream.start', async (command, context) => {
    const { quality } = command.payload || {};
    coreInfo('Stream start command processed', {
      operation: 'broadcast-box:command:stream-start',
      deviceId: context.deviceId,
      quality,
    });
    return context.protocol.createAck(command.id, true, undefined, {
      status: 'streaming',
      quality: quality ?? 'standard',
    });
  });

  // Register stream.stop handler
  registry.registerHandler('stream.stop', async (command, context) => {
    coreInfo('Stream stop command processed', {
      operation: 'broadcast-box:command:stream-stop',
      deviceId: context.deviceId,
    });
    return context.protocol.createAck(command.id, true, undefined, {
      status: 'stopped',
    });
  });

  return registry;
}
