/**
 * Broadcast Box API Composable
 *
 * Provides type-safe API methods for interacting with Broadcast Box devices,
 * sessions, and uploads.
 */

import type {
  SourceInfo,
  ActiveSources,
  PiPConfiguration,
} from './broadcast-box-types';

export interface BroadcastDevice {
  id: string;
  organizationId: string;
  deviceUuid: string;
  name: string;
  roomLocation?: string;
  status: 'enrolled' | 'active' | 'suspended' | 'revoked';
  capabilities: {
    videoSources: string[];
    audioSources: string[];
    videoSourceObjects?: SourceInfo[]; // Source objects with numeric IDs
    audioSourceObjects?: SourceInfo[]; // Source objects with numeric IDs
    pipSupported: boolean;
    pipCapabilities?: {
      supported: boolean;
      maxSources?: number;
      supportedPositions?: Array<
        'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'
      >;
      minSize?: { width: number; height: number };
      maxSize?: { width: number; height: number };
    };
    audioMixingCapabilities?: {
      supported: boolean;
      maxInputs?: number;
    };
    hardwareEncodingCapabilities?: {
      supported: boolean;
    };
    hardwareEncoding?: boolean;
    /** Quality presets and defaults from device.connected */
    quality?: {
      presets: Array<{
        name: string;
        videoBitrateKbps: number;
        audioBitrateKbps: number;
        resolution: [number, number];
        framerate: number;
      }>;
      defaults?: {
        preview?: string;
        streaming?: string;
        recording?: string;
      };
    };
    maxResolution: string;
  };
  config: Record<string, any>;
  activeSources?: ActiveSources; // Currently active sources from status messages
  pipConfig?: PiPConfiguration; // Current PiP configuration from status messages (API field name)
  pip?: PiPConfiguration; // Alias for pipConfig (for consistency with connectionStatus)
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastSession {
  id: string;
  deviceId: string;
  civicpressSessionId: string;
  status:
    | 'pending'
    | 'recording'
    | 'stopping'
    | 'encoding'
    | 'uploading'
    | 'complete'
    | 'failed';
  startedAt?: string;
  stoppedAt?: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface UploadJob {
  id: string;
  sessionId: string;
  deviceId: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'failed';
  progressPercent: number;
  storageLocation?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeviceRequest {
  deviceUuid: string;
  enrollmentCode: string;
  name: string;
  roomLocation?: string;
  capabilities?: {
    videoSources?: string[];
    audioSources?: string[];
    pipSupported?: boolean;
    maxResolution?: string;
  };
  config?: Record<string, any>;
}

export interface UpdateDeviceRequest {
  name?: string;
  roomLocation?: string;
  capabilities?: {
    videoSources?: string[];
    audioSources?: string[];
    pipSupported?: boolean;
    maxResolution?: string;
  };
  config?: Record<string, any>;
}

export interface StartSessionRequest {
  deviceId: string;
  civicpressSessionId: string;
  metadata?: Record<string, any>;
}

export const useBroadcastBox = () => {
  const $civicApi = useNuxtApp().$civicApi;
  const { t } = useI18n();
  const toast = useToast();

  // Device Management
  const enrollDevice = async (data: {
    name: string;
    roomLocation?: string;
  }): Promise<{ deviceUuid: string; enrollmentCode: string }> => {
    try {
      // Ensure clean body object
      const requestBody: { name: string; roomLocation?: string } = {
        name: data.name.trim(),
      };
      if (data.roomLocation?.trim()) {
        requestBody.roomLocation = data.roomLocation.trim();
      }

      console.log('Enroll request body:', JSON.stringify(requestBody));

      const response = (await $civicApi(
        '/api/v1/broadcast-box/devices/enroll',
        {
          method: 'POST',
          body: requestBody,
        }
      )) as any;

      if (response.success && response.enrollment) {
        toast.add({
          title: t('broadcastBox.success.deviceEnrolled'),
          description: t('broadcastBox.success.deviceEnrolledDesc'),
          color: 'primary',
        });
        return response.enrollment;
      }
      throw new Error(
        response.error?.message ||
          response.error ||
          t('broadcastBox.errors.enrollFailed')
      );
    } catch (error: any) {
      console.error('Failed to enroll device:', error);
      toast.add({
        title: t('broadcastBox.errors.enrollFailed'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const regenerateEnrollmentCode = async (
    deviceId: string
  ): Promise<{
    deviceUuid: string;
    enrollmentCode: string;
    expiresAt: string;
  }> => {
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId}/enroll`,
        {
          method: 'POST',
        }
      )) as any;

      if (response.success && response.enrollment) {
        toast.add({
          title: t('broadcastBox.success.enrollmentCodeRegenerated'),
          description: t('broadcastBox.success.enrollmentCodeRegeneratedDesc'),
          color: 'primary',
        });
        return response.enrollment;
      }
      throw new Error(
        response.error?.message ||
          response.error ||
          t('broadcastBox.errors.regenerateEnrollmentFailed')
      );
    } catch (error: any) {
      console.error('Failed to regenerate enrollment code:', error);
      toast.add({
        title: t('broadcastBox.errors.regenerateEnrollmentFailed'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const listDevices = async (filters?: {
    status?: string;
    room?: string;
  }): Promise<BroadcastDevice[]> => {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.room) params.append('room', filters.room);

      const url = `/api/v1/broadcast-box/devices${params.toString() ? `?${params.toString()}` : ''}`;
      const response = (await $civicApi(url)) as any;

      if (response.success && response.devices) {
        return response.devices;
      }
      return [];
    } catch (error: any) {
      console.error('Failed to list devices:', error);
      toast.add({
        title: t('broadcastBox.errors.listDevices'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const getDevice = async (
    deviceId: string
  ): Promise<{
    device: BroadcastDevice;
    enrollmentCode?: {
      exists: boolean;
      isExpired: boolean;
      isUsed: boolean;
      expiresAt: string | null;
      createdAt: string | null;
      usedAt: string | null;
    };
  } | null> => {
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId}`
      )) as any;

      if (response.success && response.device) {
        return {
          device: response.device,
          enrollmentCode: response.enrollmentCode,
        };
      }
      return null;
    } catch (error: any) {
      console.error('Failed to get device:', error);

      // Check if it's a 404 (device not found)
      const isNotFound =
        error.status === 404 ||
        error.message?.includes('not found') ||
        error.message?.includes('Device not found');

      if (isNotFound) {
        toast.add({
          title: t('broadcastBox.errors.deviceNotFound') || 'Device Not Found',
          description:
            t('broadcastBox.errors.deviceNotFoundDesc') ||
            'The device you are looking for does not exist or has been removed.',
          color: 'error',
        });
      } else {
        toast.add({
          title: t('broadcastBox.errors.getDevice'),
          description: error.message || t('broadcastBox.errors.generic'),
          color: 'error',
        });
      }
      throw error;
    }
  };

  const registerDevice = async (
    data: CreateDeviceRequest
  ): Promise<{
    device: BroadcastDevice;
    credentials: { token: string; expiresIn: number };
  }> => {
    try {
      const response = (await $civicApi('/api/v1/broadcast-box/devices', {
        method: 'POST',
        body: data,
      })) as any;

      if (response.success && response.device && response.credentials) {
        toast.add({
          title: t('broadcastBox.success.deviceRegistered'),
          description: t('broadcastBox.success.deviceRegisteredDesc'),
          color: 'primary',
        });
        // Convert expiresAt to expiresIn (seconds)
        const expiresAt = new Date(response.credentials.expiresAt);
        const expiresIn = Math.max(
          0,
          Math.floor((expiresAt.getTime() - Date.now()) / 1000)
        );
        return {
          device: response.device,
          credentials: {
            token: response.credentials.token,
            expiresIn,
          },
        };
      }

      // Handle error response
      const errorMessage =
        response.error?.message ||
        response.error ||
        t('broadcastBox.errors.registerDevice');
      throw new Error(errorMessage);
    } catch (error: any) {
      console.error('Failed to register device:', error);
      toast.add({
        title: t('broadcastBox.errors.registerDevice'),
        description:
          error.message || t('broadcastBox.errors.registrationFailed'),
        color: 'error',
      });
      throw error;
    }
  };

  const updateDevice = async (
    deviceId: string,
    data: UpdateDeviceRequest
  ): Promise<BroadcastDevice> => {
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId}`,
        {
          method: 'PATCH',
          body: data,
        }
      )) as any;

      if (response.success && response.device) {
        toast.add({
          title: t('broadcastBox.success.deviceUpdated'),
          color: 'primary',
        });
        return response.device;
      }
      throw new Error(
        response.error?.message ||
          response.error ||
          t('broadcastBox.errors.updateDevice')
      );
    } catch (error: any) {
      console.error('Failed to update device:', error);
      toast.add({
        title: t('broadcastBox.errors.updateDevice'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const revokeDevice = async (deviceId: string): Promise<void> => {
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId}`,
        {
          method: 'DELETE',
        }
      )) as any;

      if (response.success) {
        toast.add({
          title: t('broadcastBox.success.deviceRevoked'),
          color: 'primary',
        });
      } else {
        throw new Error(
          response.error || t('broadcastBox.errors.revokeDevice')
        );
      }
    } catch (error: any) {
      console.error('Failed to revoke device:', error);
      toast.add({
        title: t('broadcastBox.errors.revokeDevice'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const getDeviceHealth = async (deviceId: string): Promise<any> => {
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId}/health`
      )) as any;

      if (response.success && response.health) {
        return response.health;
      }
      return null;
    } catch (error: any) {
      // Silently fail for health endpoint - device might not be connected
      // Only log if it's not a 404 (device not found)
      const isNotFound =
        error.status === 404 ||
        error.message?.includes('not found') ||
        error.message?.includes('Device not found');

      if (!isNotFound) {
        console.error('Failed to get device health:', error);
      }
      return null;
    }
  };

  // Session Management
  const listSessions = async (filters?: {
    deviceId?: string;
    civicpressSessionId?: string;
    status?: string;
  }): Promise<BroadcastSession[]> => {
    try {
      const params = new URLSearchParams();
      if (filters?.deviceId) params.append('deviceId', filters.deviceId);
      if (filters?.civicpressSessionId)
        params.append('civicpressSessionId', filters.civicpressSessionId);
      if (filters?.status) params.append('status', filters.status);

      const url = `/api/v1/broadcast-box/sessions${params.toString() ? `?${params.toString()}` : ''}`;
      const response = (await $civicApi(url)) as any;

      const sessions = response.sessions ?? response.data?.sessions;
      if (response.success && sessions) {
        return sessions;
      }
      return [];
    } catch (error: any) {
      console.error('Failed to list sessions:', error);
      toast.add({
        title: t('broadcastBox.errors.listSessions'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const getSession = async (
    sessionId: string
  ): Promise<BroadcastSession | null> => {
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/sessions/${sessionId}`
      )) as any;

      const session = response.session ?? response.data?.session;
      if (response.success && session) {
        return session;
      }
      return null;
    } catch (error: any) {
      console.error('Failed to get session:', error);
      return null;
    }
  };

  const startSession = async (
    data: StartSessionRequest
  ): Promise<BroadcastSession> => {
    try {
      const response = (await $civicApi('/api/v1/broadcast-box/sessions', {
        method: 'POST',
        body: data,
      })) as any;

      const session = response.session ?? response.data?.session;
      if (response.success && session) {
        toast.add({
          title: t('broadcastBox.success.sessionStarted'),
          color: 'primary',
        });
        return session;
      }
      throw new Error(
        response.error?.message ??
          response.error ??
          t('broadcastBox.errors.startSession')
      );
    } catch (error: any) {
      console.error('Failed to start session:', error);
      toast.add({
        title: t('broadcastBox.errors.startSession'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const stopSession = async (sessionId: string): Promise<BroadcastSession> => {
    const STOP_TIMEOUT_MS = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STOP_TIMEOUT_MS);

    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/sessions/${sessionId}/stop`,
        {
          method: 'POST',
          signal: controller.signal,
        }
      )) as any;

      clearTimeout(timeoutId);

      const session = response.session ?? response.data?.session;
      if (response.success && session) {
        // Clear connection status session state so UI shows idle (not "session in progress")
        const { clearDeviceSessionState } = await import(
          './useDeviceConnectionStatus'
        );
        if (session.deviceId) {
          clearDeviceSessionState(session.deviceId);
        }
        toast.add({
          title: t('broadcastBox.success.sessionStopped'),
          color: 'primary',
        });
        return session;
      }
      throw new Error(
        response.error?.message ??
          response.error ??
          t('broadcastBox.errors.stopSession')
      );
    } catch (error: any) {
      clearTimeout(timeoutId);
      const isTimeout =
        error?.name === 'AbortError' ||
        error?.message?.includes('abort') ||
        error?.message?.includes('timeout');
      console.error('Failed to stop session:', error);
      toast.add({
        title: t('broadcastBox.errors.stopSession'),
        description: isTimeout
          ? (t('broadcastBox.errors.stopTimeout') as string) ||
            'Request timed out. The session may have stopped on the device.'
          : error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    try {
      await $civicApi(`/api/v1/broadcast-box/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      toast.add({
        title: t('broadcastBox.success.sessionRemoved'),
        color: 'primary',
      });
    } catch (error: any) {
      console.error('Failed to delete session:', error);
      toast.add({
        title: t('broadcastBox.errors.deleteSessionFailed'),
        description: error.message || t('broadcastBox.errors.generic'),
        color: 'error',
      });
      throw error;
    }
  };

  // Upload Management
  const listUploads = async (filters?: {
    sessionId?: string;
    deviceId?: string;
    status?: string;
  }): Promise<UploadJob[]> => {
    try {
      const params = new URLSearchParams();
      if (filters?.sessionId) params.append('sessionId', filters.sessionId);
      if (filters?.deviceId) params.append('deviceId', filters.deviceId);
      if (filters?.status) params.append('status', filters.status);

      const url = `/api/v1/broadcast-box/uploads${params.toString() ? `?${params.toString()}` : ''}`;
      const response = (await $civicApi(url)) as any;

      if (response.success && response.data?.uploads) {
        return response.data.uploads;
      }
      return [];
    } catch (error: any) {
      console.error('Failed to list uploads:', error);
      return [];
    }
  };

  const getUpload = async (uploadId: string): Promise<UploadJob | null> => {
    try {
      const response = (await $civicApi(
        `/api/v1/broadcast-box/uploads/${uploadId}`
      )) as any;

      if (response.success && response.data?.upload) {
        return response.data.upload;
      }
      return null;
    } catch (error: any) {
      console.error('Failed to get upload:', error);
      return null;
    }
  };

  return {
    // Devices
    enrollDevice,
    regenerateEnrollmentCode,
    listDevices,
    getDevice,
    registerDevice,
    updateDevice,
    revokeDevice,
    getDeviceHealth,
    // Sessions
    listSessions,
    getSession,
    startSession,
    stopSession,
    deleteSession,
    // Uploads
    listUploads,
    getUpload,
  };
};
