/**
 * Device Commands Composable
 *
 * Provides methods for executing commands on Broadcast Box devices
 * via the unified command API endpoint.
 */

import { ref, type Ref } from 'vue';

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

export interface DeviceConfig {
  defaultVideoSource?: string;
  defaultAudioSource?: string;
  qualityPreset?: 'low' | 'standard' | 'high';
  autoStart?: boolean;
}

/**
 * Composable for executing device commands
 *
 * @param deviceId - Device ID (UUID) as a reactive ref
 * @returns Command execution methods and reactive state
 */
export function useDeviceCommands(deviceId: Ref<string | undefined>) {
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
      // Check if error is about device not being connected
      const isNotConnectedError =
        err.message?.includes('not connected') ||
        err.message?.includes('Device')?.includes('not connected');
      
      let errorMessage = err.message || t('broadcastBox.errors.commandFailed');
      let errorTitle = t('broadcastBox.errors.commandFailed');
      
      if (isNotConnectedError) {
        errorTitle = t('broadcastBox.errors.deviceNotConnected') || 'Device Not Connected';
        errorMessage = t('broadcastBox.errors.deviceNotConnectedDesc') || 
          'The device must be connected via WebSocket to receive commands. Please ensure the device is online and connected.';
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
   */
  const switchSource = async (
    videoSource?: string,
    audioSource?: string
  ): Promise<CommandResponse> => {
    if (!videoSource && !audioSource) {
      const err = new Error(
        'At least one source (videoSource or audioSource) must be provided'
      );
      error.value = err.message;
      throw err;
    }

    try {
      const response = await sendCommand('switch_source', {
        videoSource,
        audioSource,
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
      const isTimeoutError = errorMessage.includes('timeout') || errorMessage.includes('Command timeout');
      
      // Only log unexpected errors (not connection or timeout errors)
      if (!isNotConnectedError && !isTimeoutError) {
        console.warn('Failed to list sources (unexpected error):', err);
      }
      
      return null;
    } finally {
      loading.value = false;
    }
  };

  return {
    // Methods
    sendCommand,
    switchSource,
    updateConfig,
    getStatus,
    listSources,
    // State
    loading,
    error,
    lastResponse,
  };
}

