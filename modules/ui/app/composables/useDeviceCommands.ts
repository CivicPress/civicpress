/**
 * Device Commands Composable
 *
 * Provides methods for executing commands on Broadcast Box devices
 * via the unified command API endpoint.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';

export interface CommandResponse {
  success: boolean;
  commandId: string;
  ack?: {
    type: 'ack';
    id: string;
    commandId: string;
    success: boolean;
    error?: string;
    payload?: any;
  };
  error?: string;
  timestamp: string;
}

export interface CommandSource {
  videoSource?: string;
  audioSource?: string;
}

export interface SetPipOptions {
  position?:
    | 'top_left'
    | 'top_right'
    | 'bottom_left'
    | 'bottom_right'
    | 'center';
  /** PiP size as fraction of main frame (0–1), e.g. 0.25 = 25%. Sent as pipSize number to device. */
  size?: number;
}

export interface DeviceConfig {
  defaultVideoSource?: string;
  defaultAudioSource?: string;
  qualityPreset?: 'low' | 'standard' | 'high';
  autoStart?: boolean;
}

/** Watermark / logo overlay status from device (watermark.status response) */
export interface WatermarkStatus {
  configured?: boolean;
  valid?: boolean;
  enabled?: boolean;
  position?: string;
  scale?: number;
  opacity?: number;
  file_path?: string;
}

/**
 * Composable for executing device commands
 *
 * @param deviceId - Device ID (UUID) as a reactive ref
 * @returns Command execution methods and reactive state
 */
export function useDeviceCommands(
  deviceId: Ref<string | undefined> | ComputedRef<string | undefined>
) {
  const $civicApi = useNuxtApp().$civicApi;
  const toast = useToast();
  const { t } = useI18n();

  // Reactive state
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastResponse = ref<CommandResponse | null>(null);

  /**
   * Execute a command on the device
   */
  const sendCommand = async (
    action: string,
    payload: any = {}
  ): Promise<CommandResponse> => {
    if (!deviceId.value) {
      const err = new Error('Device ID is required');
      error.value = err.message;
      throw err;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId.value}/command`,
        {
          method: 'POST',
          body: {
            action,
            payload,
          },
        }
      )) as any;

      if (response.success) {
        lastResponse.value = {
          success: true,
          commandId: response.commandId,
          ack: response.ack,
          timestamp: response.timestamp,
        };
        return lastResponse.value;
      } else {
        const err = new Error(
          response.error?.message || 'Command execution failed'
        );
        error.value = err.message;
        lastResponse.value = {
          success: false,
          commandId: response.commandId || '',
          error: err.message,
          timestamp: response.timestamp || new Date().toISOString(),
        };
        throw err;
      }
    } catch (err: any) {
      // Check if error is about device not being connected, timeout, or service unavailable
      const msg = err.message ?? '';
      const errorCode = err.data?.error?.code;
      const status = err.status ?? err.data?.status;
      const isNotConnectedError =
        msg.includes('not connected') ||
        (msg.includes('Device') && msg.includes('not connected')) ||
        msg.includes('Device not connected');
      const isServiceNotAvailable =
        msg.includes('not available') || msg.includes('service not available');
      const isCommandTimeout =
        errorCode === 'TIMEOUT' ||
        status === 504 ||
        /timeout|timed out/i.test(msg);

      let errorMessage = msg || t('broadcastBox.errors.commandFailed');
      let errorTitle = t('broadcastBox.errors.commandFailed');

      if (isNotConnectedError) {
        errorTitle =
          t('broadcastBox.errors.deviceNotConnected') || 'Device Not Connected';
        errorMessage =
          t('broadcastBox.errors.deviceNotConnectedDesc') ||
          'The device must be connected via WebSocket to receive commands. Please ensure the device is online and connected.';
      } else if (isCommandTimeout) {
        errorTitle =
          t('broadcastBox.errors.commandTimeout') || 'Command Timed Out';
        errorMessage =
          t('broadcastBox.errors.commandTimeoutDesc') ||
          'The device did not respond in time. Try again or check that the device is connected.';
      } else if (isServiceNotAvailable) {
        errorTitle =
          t('broadcastBox.errors.serviceNotAvailable') ||
          'Service Not Available';
        errorMessage =
          t('broadcastBox.errors.serviceNotAvailableDesc') ||
          'The preview or command service is not available. Ensure the device is online and the realtime server is running.';
      }

      error.value = errorMessage;
      toast.add({
        title: errorTitle,
        description: errorMessage,
        color: 'error',
      });
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Switch video/audio source on device
   *
   * @param videoSource - Video source identifier (string) or numeric ID
   * @param audioSource - Audio source identifier (string) or numeric ID
   * @param device - Optional device object to look up numeric IDs from source objects or active sources
   */
  const switchSource = async (
    videoSource?: string | number,
    audioSource?: string | number,
    device?: {
      capabilities?: {
        videoSourceObjects?: Array<{
          id: number;
          identifier?: string;
          name?: string;
        }>;
        audioSourceObjects?: Array<{
          id: number;
          identifier?: string;
          name?: string;
        }>;
      };
      activeSources?: {
        video?: { id: number; identifier?: string; name?: string } | null;
        audio?: { id: number; identifier?: string; name?: string } | null;
      };
    }
  ): Promise<CommandResponse> => {
    if (!videoSource && !audioSource) {
      const err = new Error(
        'At least one source (videoSource or audioSource) must be provided'
      );
      error.value = err.message;
      throw err;
    }

    // The device accepts both identifiers (strings) and numeric IDs directly
    // According to the protocol: videoSource/audioSource can be string | number
    // Send identifiers directly - no conversion needed
    try {
      const response = await sendCommand('switch_source', {
        videoSource: videoSource,
        audioSource: audioSource,
      });

      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.sourceSwitched'),
          description: t('broadcastBox.success.sourceSwitchedDesc'),
          color: 'primary',
        });
      }

      return response;
    } catch (err: any) {
      // Error already handled in sendCommand
      throw err;
    }
  };

  /**
   * Set active video/audio sources (primary API). Sources persist across sessions
   * and are used by preview, record, and session commands. Call when user changes
   * camera/mic selection.
   *
   * @param video - Video source identifier or "pip" for PiP layout
   * @param audio - Audio source identifier
   */
  const setSources = async (
    video?: string,
    audio?: string
  ): Promise<CommandResponse> => {
    if (!video && !audio) {
      const err = new Error(
        'At least one of video or audio must be provided for sources.set'
      );
      error.value = err.message;
      throw err;
    }
    try {
      const payload: { video?: string; audio?: string } = {};
      if (video) payload.video = video;
      if (audio) payload.audio = audio;
      const response = await sendCommand('sources.set', payload);
      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.sourceSwitched'),
          description: t('broadcastBox.success.sourceSwitchedDesc'),
          color: 'primary',
        });
      }
      return response;
    } catch (err: any) {
      throw err;
    }
  };

  /**
   * Configure RTMP streaming destination (url, stream key, platform). Persisted on device.
   */
  const configureStream = async (
    url: string,
    streamKey: string,
    platform: 'youtube' | 'facebook' | 'twitch' | 'generic' = 'generic'
  ): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('stream.configure', {
        url,
        stream_key: streamKey,
        platform,
      });
      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.configUpdated'),
          description: t('broadcastBox.success.streamConfiguredDesc'),
          color: 'primary',
        });
      }
      return response;
    } catch (err: any) {
      throw err;
    }
  };

  /**
   * Start RTMP streaming (uses saved config; optional quality).
   */
  const startStream = async (
    quality?: 'low' | 'standard' | 'high' | 'ultra'
  ): Promise<CommandResponse> => {
    try {
      const payload = quality ? { quality } : {};
      const response = await sendCommand('stream.start', payload);
      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.streamStarted'),
          description: t('broadcastBox.success.streamStartedDesc'),
          color: 'primary',
        });
      }
      return response;
    } catch (err: any) {
      throw err;
    }
  };

  /**
   * Stop RTMP streaming.
   */
  const stopStream = async (): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('stream.stop', {});
      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.streamStopped'),
          description: t('broadcastBox.success.streamStoppedDesc'),
          color: 'primary',
        });
      }
      return response;
    } catch (err: any) {
      throw err;
    }
  };

  /**
   * Update device configuration
   */
  const updateConfig = async (
    config: DeviceConfig
  ): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('update_config', {
        config,
      });

      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.configUpdated'),
          description: t('broadcastBox.success.configUpdatedDesc'),
          color: 'primary',
        });
      }

      return response;
    } catch (err: any) {
      // Error already handled in sendCommand
      throw err;
    }
  };

  /**
   * Get device status
   */
  const getStatus = async (): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('get_status', {});
      return response;
    } catch (err: any) {
      // Error already handled in sendCommand
      throw err;
    }
  };

  /**
   * List available sources on device
   */
  const listSources = async (): Promise<{
    videoSources: string[];
    audioSources: string[];
    currentVideoSource?: string;
    currentAudioSource?: string;
  } | null> => {
    if (!deviceId.value) {
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId.value}/command`,
        {
          method: 'POST',
          body: {
            action: 'list_sources',
            payload: {},
          },
        }
      )) as any;

      if (response.success && response.ack?.success && response.ack?.payload) {
        return {
          videoSources: response.ack.payload.videoSources || [],
          audioSources: response.ack.payload.audioSources || [],
          currentVideoSource: response.ack.payload.currentVideoSource,
          currentAudioSource: response.ack.payload.currentAudioSource,
        };
      }

      return null;
    } catch (err: any) {
      // Silently fail for list_sources - don't show toast for expected errors
      // This is expected when device is offline, doesn't support the command, or times out
      // We'll fallback to device capabilities
      const errorMessage = err.message || err.data?.error?.message || '';
      const isNotConnectedError = errorMessage.includes('not connected');
      const isTimeoutError =
        errorMessage.includes('timeout') ||
        errorMessage.includes('Command timeout');

      // Only log unexpected errors (not connection or timeout errors)
      if (!isNotConnectedError && !isTimeoutError) {
        console.warn('Failed to list sources (unexpected error):', err);
      }

      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Set Picture-in-Picture configuration
   *
   * @param mainSource - Main video source identifier (string) or numeric ID
   * @param pipSource - PiP video source identifier (string) or numeric ID, or null to disable
   * @param options - Optional position and size configuration
   * @param device - Optional device object to look up numeric IDs from source objects
   */
  const setPip = async (
    mainSource: string | number,
    pipSource?: string | number | null,
    options?: SetPipOptions,
    device?: {
      capabilities?: {
        videoSourceObjects?: Array<{
          id: number;
          identifier?: string;
          name?: string;
        }>;
        audioSourceObjects?: Array<{
          id: number;
          identifier?: string;
          name?: string;
        }>;
      };
      activeSources?: {
        video?: { id: number; identifier?: string; name?: string } | null;
        audio?: { id: number; identifier?: string; name?: string } | null;
      };
    }
  ): Promise<CommandResponse> => {
    if (!mainSource) {
      const err = new Error('mainSource is required');
      error.value = err.message;
      throw err;
    }

    // Reuse the findSourceId helper from switchSource
    const findSourceId = async (
      sourceIdentifier: string | number,
      sourceType: 'video' | 'audio'
    ): Promise<number | undefined> => {
      if (typeof sourceIdentifier === 'number') {
        return sourceIdentifier;
      }

      // Helper to extract identifier from name (e.g., "HDMI Capture Device 2" -> "hdmi2")
      const extractIdentifierFromName = (name: string): string | null => {
        if (!name) return null;
        const lowerName = name.toLowerCase();

        // Try to extract "hdmi1", "hdmi2", etc. from names like "HDMI Capture Device 1"
        const hdmiMatch = lowerName.match(/hdmi.*?(\d+)/);
        if (hdmiMatch) {
          return `hdmi${hdmiMatch[1]}`;
        }

        // Try to extract "usb_camera", "usb webcam", etc.
        if (
          lowerName.includes('usb') &&
          (lowerName.includes('camera') || lowerName.includes('webcam'))
        ) {
          return 'usb_camera';
        }

        // Try to match common patterns
        if (lowerName.includes('capture')) {
          const captureMatch = lowerName.match(/(\w+).*?(\d+)/);
          if (captureMatch) {
            return `${captureMatch[1]}${captureMatch[2]}`.toLowerCase();
          }
        }

        return null;
      };

      // Try source objects from device capabilities first
      const sourceObjects =
        sourceType === 'video'
          ? device?.capabilities?.videoSourceObjects
          : device?.capabilities?.audioSourceObjects;

      if (sourceObjects) {
        // Match by identifier first, then by name (some sources might use name instead)
        // list_sources returns objects with 'name' when created from string arrays
        let sourceObj = sourceObjects.find(
          (s: any) =>
            (s.identifier && s.identifier === sourceIdentifier) ||
            (s.identifier &&
              s.identifier.toLowerCase() === sourceIdentifier.toLowerCase()) ||
            (s.name && s.name === sourceIdentifier) ||
            (s.name && s.name.toLowerCase() === sourceIdentifier.toLowerCase())
        );

        // If not found, try to match by extracting identifier from name
        if (!sourceObj) {
          sourceObj = sourceObjects.find((s: any) => {
            if (!s.name) return false;
            const extractedId = extractIdentifierFromName(s.name);
            return (
              extractedId &&
              (extractedId === sourceIdentifier ||
                extractedId.toLowerCase() === sourceIdentifier.toLowerCase())
            );
          });
        }

        if (sourceObj) {
          return sourceObj.id;
        }
      }

      // Try active sources (if this is the currently active source)
      const activeSource =
        sourceType === 'video'
          ? device?.activeSources?.video
          : device?.activeSources?.audio;

      if (activeSource) {
        // Check both identifier and extracted identifier from name
        if (activeSource.identifier === sourceIdentifier) {
          return activeSource.id;
        }
        if (activeSource.name) {
          const extractedId = extractIdentifierFromName(activeSource.name);
          if (
            extractedId === sourceIdentifier ||
            extractedId?.toLowerCase() === sourceIdentifier.toLowerCase()
          ) {
            return activeSource.id;
          }
        }
      }

      // Fallback: try to fetch source objects via list_sources command
      // This is a last resort if device.connected event hasn't populated them yet
      if (deviceId.value) {
        try {
          const response = (await $civicApi(
            `/api/v1/broadcast-box/devices/${deviceId.value}/command`,
            {
              method: 'POST',
              body: {
                action: 'list_sources',
                payload: {},
              },
            }
          )) as any;

          if (
            response.success &&
            response.ack?.success &&
            response.ack?.payload
          ) {
            // list_sources returns video/audio arrays with source objects
            // Check both 'video'/'audio' keys and 'videoSources'/'audioSources' keys
            let sourceArray: any[] | undefined;

            if (sourceType === 'video') {
              sourceArray =
                response.ack.payload.video ||
                response.ack.payload.videoSources ||
                response.ack.payload.videoSourceObjects ||
                [];
            } else {
              sourceArray =
                response.ack.payload.audio ||
                response.ack.payload.audioSources ||
                response.ack.payload.audioSourceObjects ||
                [];
            }

            if (Array.isArray(sourceArray) && sourceArray.length > 0) {
              // list_sources returns objects with 'name' field when created from string arrays
              // Try to find by name first (most common), then by identifier
              const sourceObj = sourceArray.find(
                (s: any) =>
                  (s.name && s.name === sourceIdentifier) ||
                  (s.name &&
                    s.name.toLowerCase() === sourceIdentifier.toLowerCase()) ||
                  (s.identifier && s.identifier === sourceIdentifier) ||
                  (s.identifier &&
                    s.identifier.toLowerCase() ===
                      sourceIdentifier.toLowerCase())
              );

              if (sourceObj) {
                // If source object has explicit ID, use it
                if (typeof sourceObj.id === 'number') {
                  return sourceObj.id;
                }
                // If no ID but we found the object, use the array index
                const index = sourceArray.indexOf(sourceObj);
                if (index >= 0) {
                  return index;
                }
              }

              // Fallback: try to find by array index if identifier is numeric string
              // This handles cases where the identifier is "0", "1", "2", etc.
              const numericIndex = parseInt(sourceIdentifier, 10);
              if (
                !isNaN(numericIndex) &&
                numericIndex >= 0 &&
                numericIndex < sourceArray.length
              ) {
                return numericIndex;
              }
            }
          }
        } catch (err) {
          // Silently fail - list_sources might not be available or might timeout
        }
      }

      return undefined;
    };

    // Validate sources exist (but send string identifiers to device)
    // The device expects string identifiers, not numeric IDs
    const mainSourceId = await findSourceId(mainSource, 'video');
    if (mainSourceId === undefined) {
      throw new Error(
        `Unable to find main source "${mainSource}". ` +
          `Device may not have source objects available. Please ensure the device is connected and has sent its capabilities.`
      );
    }

    // Validate pipSource exists and is different from mainSource (if not null)
    if (pipSource !== null && pipSource !== undefined) {
      const pipSourceId = await findSourceId(pipSource, 'video');
      if (pipSourceId === undefined) {
        throw new Error(
          `Unable to find PiP source "${pipSource}". ` +
            `Device may not have source objects available. Please ensure the device is connected and has sent its capabilities.`
        );
      }

      // Ensure pipSource is different from mainSource
      if (pipSourceId === mainSourceId) {
        throw new Error('PiP source must be different from main source');
      }
    }

    // Build payload with string identifiers (device expects strings, not numeric IDs)
    const payload: any = {
      mainSource:
        typeof mainSource === 'string' ? mainSource : String(mainSource),
    };

    if (pipSource !== null && pipSource !== undefined) {
      payload.pipSource =
        typeof pipSource === 'string' ? pipSource : String(pipSource);
    } else {
      payload.pipSource = null;
    }

    // Apply defaults if not provided
    if (options?.position) {
      payload.pipPosition = options.position;
    }
    if (options?.size != null && typeof options.size === 'number') {
      payload.pipSize = options.size;
    }

    try {
      const response = await sendCommand('set_pip', payload);

      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.pipConfigured'),
          description: t('broadcastBox.success.pipConfiguredDesc'),
          color: 'primary',
        });
      }

      return response;
    } catch (err: any) {
      // Error already handled in sendCommand
      throw err;
    }
  };

  /**
   * Start manual recording. Sources are set via setSources; only quality is sent.
   *
   * @param _videoSource - Ignored (sources are set via setSources)
   * @param _audioSource - Ignored (sources are set via setSources)
   * @param quality - Quality preset (default: 'standard'); use device config or capabilities.defaults.recording when starting from UI
   */
  const startManualRecording = async (
    _videoSource?: string,
    _audioSource?: string,
    quality: 'low' | 'standard' | 'high' | 'ultra' = 'standard'
  ): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('record.start', {
        config: { quality },
      });

      // Check if device doesn't support manual recording
      if (
        !response.success ||
        (response.ack && !response.ack.success && response.ack.error)
      ) {
        const errorMessage = response.ack?.error || '';
        if (
          errorMessage.includes('Manual recording service not available') ||
          errorMessage.includes('not available')
        ) {
          toast.add({
            title: t('broadcastBox.errors.manualRecordingNotAvailable'),
            description: t(
              'broadcastBox.errors.manualRecordingNotAvailableDesc'
            ),
            color: 'error',
          });
        }
      } else if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.recordingStarted'),
          description: t('broadcastBox.success.recordingStartedDesc'),
          color: 'primary',
        });
      }

      return response;
    } catch (err: any) {
      // Check if error is about service not being available
      const errorMessage = err.message || err.data?.error?.message || '';
      if (
        errorMessage.includes('Manual recording service not available') ||
        errorMessage.includes('not available')
      ) {
        toast.add({
          title: t('broadcastBox.errors.manualRecordingNotAvailable'),
          description: t('broadcastBox.errors.manualRecordingNotAvailableDesc'),
          color: 'error',
        });
      }
      // Error already handled in sendCommand (for other errors)
      throw err;
    }
  };

  /**
   * Stop manual recording
   */
  const stopManualRecording = async (): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('record.stop', {});

      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.recordingStopped'),
          description: t('broadcastBox.success.recordingStoppedDesc'),
          color: 'primary',
        });
      }

      return response;
    } catch (err: any) {
      // Error already handled in sendCommand
      throw err;
    }
  };

  /**
   * List manual recordings on device
   */
  const listManualRecordings = async (): Promise<Array<{
    recording_id: string;
    started_at: string;
    stopped_at: string | null;
    duration_seconds: number;
    file_path: string;
    file_size_bytes: number;
    hash_sha256?: string;
    video_source?: string;
    audio_source?: string;
    quality?: 'low' | 'standard' | 'high';
    created_by: 'manual';
  }> | null> => {
    if (!deviceId.value) {
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await sendCommand('record.list', {});

      if (response.success && response.ack?.success && response.ack?.payload) {
        return response.ack.payload.recordings || [];
      }

      return [];
    } catch (err: any) {
      // Silently fail for list - don't show toast for expected errors
      // This is expected when device is offline, doesn't support the command, or times out
      const errorMessage = err.message || err.data?.error?.message || '';
      const isNotConnectedError = errorMessage.includes('not connected');
      const isTimeoutError =
        errorMessage.includes('timeout') ||
        errorMessage.includes('Command timeout');
      const isServiceNotAvailable =
        errorMessage.includes('Manual recording service not available') ||
        errorMessage.includes('not available');

      // Only log unexpected errors (not connection, timeout, or service unavailable errors)
      if (!isNotConnectedError && !isTimeoutError && !isServiceNotAvailable) {
        console.warn(
          'Failed to list manual recordings (unexpected error):',
          err
        );
      }

      return [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * Upload a PNG as base64 and enable the watermark (watermark.upload)
   */
  const uploadWatermark = async (
    base64Data: string
  ): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('watermark.upload', {
        data: base64Data,
      });
      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.watermarkUploaded'),
          color: 'primary',
        });
      }
      return response;
    } catch (err: any) {
      throw err;
    }
  };

  /**
   * Set watermark config (enabled, position, scale, opacity). Only send fields to change (watermark.set)
   */
  const setWatermark = async (config: {
    enabled?: boolean;
    position?: string;
    scale?: number;
    opacity?: number;
  }): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('watermark.set', config);
      return response;
    } catch (err: any) {
      throw err;
    }
  };

  /**
   * Remove watermark file and clear config (watermark.remove)
   */
  const removeWatermark = async (): Promise<CommandResponse> => {
    try {
      const response = await sendCommand('watermark.remove', {});
      if (response.success && response.ack?.success) {
        toast.add({
          title: t('broadcastBox.success.watermarkRemoved'),
          color: 'primary',
        });
      }
      return response;
    } catch (err: any) {
      throw err;
    }
  };

  /**
   * Get current watermark status from device (watermark.status). Fails silently when device is offline.
   */
  const getWatermarkStatus = async (): Promise<WatermarkStatus | null> => {
    if (!deviceId.value) return null;
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId.value}/command`,
        {
          method: 'POST',
          body: { action: 'watermark.status', payload: {} },
        }
      )) as any;
      if (response.success && response.ack?.success && response.ack?.payload) {
        return response.ack.payload as WatermarkStatus;
      }
      return null;
    } catch {
      return null;
    }
  };

  return {
    // Methods
    sendCommand,
    setSources,
    switchSource,
    setPip,
    configureStream,
    startStream,
    stopStream,
    updateConfig,
    getStatus,
    listSources,
    startManualRecording,
    stopManualRecording,
    listManualRecordings,
    uploadWatermark,
    setWatermark,
    removeWatermark,
    getWatermarkStatus,
    // State
    loading,
    error,
    lastResponse,
  };
}
