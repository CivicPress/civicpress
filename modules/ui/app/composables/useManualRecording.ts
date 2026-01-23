/**
 * Manual Recording Composable
 *
 * Manages manual recording state, timer, and event handling for Broadcast Box devices
 */

import {
  ref,
  computed,
  onUnmounted,
  watch,
  type Ref,
  type ComputedRef,
} from 'vue';
import { useDeviceCommands } from './useDeviceCommands';
import type { DeviceConnectionStatus } from './useDeviceConnectionStatus';
import type { ManualRecording } from './broadcast-box-types';

export interface ManualRecordingState {
  // Current recording
  isRecording: boolean;
  recordingId: string | null;
  startedAt: string | null;
  filePath: string | null;
  duration: number; // seconds (updated by timer)

  // Recordings list
  recordings: ManualRecording[];
  isLoadingRecordings: boolean;

  // Error state
  error: string | null;
}

/**
 * Composable for managing manual recording state and operations
 *
 * @param deviceId - Device ID (UUID) as a ref or computed ref
 * @param connectionStatus - Optional connection status computed ref from useDeviceConnectionStatus
 */
export function useManualRecording(
  deviceId: Ref<string | undefined> | ComputedRef<string | undefined>,
  connectionStatus?: ComputedRef<DeviceConnectionStatus | undefined>
) {
  const { startManualRecording, stopManualRecording, listManualRecordings } =
    useDeviceCommands(deviceId);

  // Reactive state
  const isRecording = ref(false);
  const recordingId = ref<string | null>(null);
  const startedAt = ref<string | null>(null);
  const filePath = ref<string | null>(null);
  const duration = ref(0);
  const recordings = ref<ManualRecording[]>([]);
  const isLoadingRecordings = ref(false);
  const error = ref<string | null>(null);

  // Timer for duration display
  let durationTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Start duration timer
   */
  const startTimer = () => {
    if (durationTimer) {
      clearInterval(durationTimer);
    }
    duration.value = 0;
    durationTimer = setInterval(() => {
      duration.value += 1;
    }, 1000);
  };

  /**
   * Stop duration timer
   */
  const stopTimer = () => {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
    duration.value = 0;
  };

  /**
   * Start manual recording
   */
  const startRecording = async (
    videoSource?: string,
    audioSource?: string,
    quality: 'low' | 'standard' | 'high' = 'standard'
  ): Promise<void> => {
    if (isRecording.value) {
      throw new Error('Recording already in progress');
    }

    error.value = null;

    try {
      const response = await startManualRecording(
        videoSource,
        audioSource,
        quality
      );

      // Check if device doesn't support manual recording
      if (!response.success || (response.ack && !response.ack.success)) {
        const errorMessage = response.ack?.error || 'Failed to start recording';
        // Don't throw for "service not available" - let the UI handle it gracefully
        if (
          errorMessage.includes('Manual recording service not available') ||
          errorMessage.includes('not available')
        ) {
          error.value = errorMessage;
          return; // Exit early without throwing
        }
        throw new Error(errorMessage);
      }

      if (response.ack?.success && response.ack?.payload) {
        isRecording.value = true;
        recordingId.value = response.ack.payload.recording_id || null;
        startedAt.value =
          response.ack.payload.started_at || new Date().toISOString();
        filePath.value = response.ack.payload.file_path || null;
        duration.value = 0;
        startTimer();
      } else {
        throw new Error(response.ack?.error || 'Failed to start recording');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to start recording';
      // Don't set error for "service not available" - it's handled by toast in useDeviceCommands
      if (
        !errorMessage.includes('Manual recording service not available') &&
        !errorMessage.includes('not available')
      ) {
        error.value = errorMessage;
      }
      throw err;
    }
  };

  /**
   * Stop manual recording
   */
  const stopRecording = async (): Promise<ManualRecording | null> => {
    if (!isRecording.value) {
      throw new Error('No recording in progress');
    }

    error.value = null;

    try {
      const response = await stopManualRecording();

      if (response.success && response.ack?.success && response.ack?.payload) {
        stopTimer();

        const result: ManualRecording = {
          recording_id: response.ack.payload.recording_id,
          started_at:
            response.ack.payload.started_at ||
            startedAt.value ||
            new Date().toISOString(),
          stopped_at:
            response.ack.payload.stopped_at || new Date().toISOString(),
          duration_seconds:
            response.ack.payload.duration_seconds || duration.value,
          file_path: response.ack.payload.file_path || filePath.value || '',
          file_size_bytes: response.ack.payload.file_size_bytes || 0,
          hash_sha256: response.ack.payload.hash_sha256,
          video_source: response.ack.payload.video_source,
          audio_source: response.ack.payload.audio_source,
          quality: response.ack.payload.quality,
          created_by: 'manual',
        };

        // Clear recording state
        isRecording.value = false;
        recordingId.value = null;
        startedAt.value = null;
        filePath.value = null;
        duration.value = 0;

        // Refresh recordings list
        await loadRecordings();

        return result;
      } else {
        throw new Error(response.ack?.error || 'Failed to stop recording');
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to stop recording';
      throw err;
    }
  };

  /**
   * Load recordings list
   */
  const loadRecordings = async (): Promise<void> => {
    // Access deviceId.value - works for both Ref and ComputedRef
    if (!deviceId.value) {
      return;
    }

    isLoadingRecordings.value = true;
    error.value = null;

    try {
      const list = await listManualRecordings();
      if (list) {
        // Sort by started_at descending (most recent first)
        recordings.value = [...list].sort((a, b) => {
          const dateA = new Date(a.started_at).getTime();
          const dateB = new Date(b.started_at).getTime();
          return dateB - dateA;
        });
      } else {
        recordings.value = [];
      }
    } catch (err: any) {
      const errorMessage = err.message || err.data?.error?.message || '';
      // Don't set error for "service not available" - it's expected for some devices
      const isServiceNotAvailable =
        errorMessage.includes('Manual recording service not available') ||
        errorMessage.includes('not available');
      if (!isServiceNotAvailable) {
        error.value = errorMessage || 'Failed to load recordings';
        console.error('Failed to load manual recordings:', err);
      } else {
        // Clear recordings list if service is not available
        recordings.value = [];
      }
    } finally {
      isLoadingRecordings.value = false;
    }
  };

  /**
   * Format duration as MM:SS or HH:MM:SS
   */
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Format file size as KB, MB, or GB
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // Watch connectionStatus for record.started and record.stopped events
  // These events are handled via useDeviceConnectionStatus, but we also listen here
  // for immediate state updates
  if (connectionStatus) {
    watch(
      connectionStatus,
      (status) => {
        if (status?.manualRecording) {
          const manualRec = status.manualRecording;
          // Sync state from connectionStatus (updated by events)
          if (manualRec.isRecording && !isRecording.value) {
            // Recording started via event
            isRecording.value = true;
            recordingId.value = manualRec.recordingId;
            startedAt.value = manualRec.startedAt;
            filePath.value = manualRec.filePath;
            duration.value = 0;
            startTimer();
          } else if (!manualRec.isRecording && isRecording.value) {
            // Recording stopped via event
            stopTimer();
            isRecording.value = false;
            recordingId.value = null;
            startedAt.value = null;
            filePath.value = null;
            duration.value = 0;
            // Refresh recordings list
            loadRecordings();
          }
        }
      },
      { deep: true }
    );
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopTimer();
  });

  // Computed for formatted duration
  const formattedDuration = computed(() => formatDuration(duration.value));

  return {
    // State
    isRecording,
    recordingId,
    startedAt,
    filePath,
    duration,
    formattedDuration,
    recordings,
    isLoadingRecordings,
    error,
    // Methods
    startRecording,
    stopRecording,
    loadRecordings,
    formatDuration,
    formatFileSize,
  };
}
