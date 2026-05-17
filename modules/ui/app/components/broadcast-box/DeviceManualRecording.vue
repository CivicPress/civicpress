<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.manualRecording') }}
        </h2>
        <UBadge
          v-if="!isDeviceConnected"
          color="neutral"
          variant="soft"
          size="xs"
        >
          {{ t('broadcastBox.deviceOffline') }}
        </UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Recording Status Indicator -->
      <div
        v-if="isRecording"
        class="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
      >
        <div class="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        <span class="text-sm font-medium">
          {{ t('broadcastBox.recordingInProgress') }}:
          {{ formattedDuration }}
        </span>
      </div>

      <!-- Start/Stop Button -->
      <div class="flex justify-end gap-2">
        <UButton
          v-if="!isRecording"
          color="error"
          :loading="loading"
          :disabled="loading || !isDeviceConnected"
          icon="i-lucide-circle"
          @click="handleStart"
        >
          {{ t('broadcastBox.startRecording') }}
        </UButton>
        <UButton
          v-else
          color="error"
          variant="outline"
          :loading="loading"
          :disabled="loading || !isDeviceConnected"
          icon="i-lucide-square"
          @click="handleStop"
        >
          {{ t('broadcastBox.stopRecording') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import type { DeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';
import { useManualRecording } from '~/composables/useManualRecording';
import { useDeviceCommands } from '~/composables/useDeviceCommands';
import { useRecordUtils } from '~/composables/useRecordUtils';
import { computed, onMounted, watch } from 'vue';

interface Props {
  device: BroadcastDevice;
  isDeviceConnected: boolean;
  connectionStatus?: DeviceConnectionStatus;
}

const props = defineProps<Props>();
const { t } = useI18n();
const { formatDate } = useRecordUtils();

// Create computed ref for deviceId
const deviceId = computed(() => props.device?.deviceUuid);

// Effective recording quality: config (from Configuration panel) or device default, per integration doc
const recordingQuality = computed(
  (): 'low' | 'standard' | 'high' | 'ultra' =>
    (props.device?.config?.qualityPreset as
      | 'low'
      | 'standard'
      | 'high'
      | 'ultra') ??
    (props.device?.capabilities?.quality?.defaults?.recording as
      | 'low'
      | 'standard'
      | 'high'
      | 'ultra') ??
    'standard'
);

// Use manual recording composable
const connectionStatusRef = computed(() => props.connectionStatus);
const {
  isRecording,
  formattedDuration,
  recordings,
  isLoadingRecordings,
  startRecording,
  stopRecording,
  loadRecordings,
  formatDuration,
  formatFileSize,
} = useManualRecording(deviceId, connectionStatusRef);

// Use device commands for loading state
const { loading } = useDeviceCommands(deviceId);

// State sync is handled in useManualRecording composable via connectionStatus watch

// Handle start recording (use device quality preset per integration doc)
const handleStart = async () => {
  try {
    await startRecording(undefined, undefined, recordingQuality.value);
    // Load recordings list after starting (in case there are previous recordings)
    await loadRecordings();
  } catch (err: any) {
    // Error already handled in composable
    console.error('Failed to start recording:', err);
  }
};

// Handle stop recording
const handleStop = async () => {
  try {
    await stopRecording();
    // loadRecordings is called automatically in stopRecording
  } catch (err: any) {
    // Error already handled in composable
    console.error('Failed to stop recording:', err);
  }
};

// Expose recording state and recordings data for parent
defineExpose({
  isRecording,
  formattedDuration,
  loading,
  handleStart,
  handleStop,
  recordings,
  isLoadingRecordings,
  loadRecordings,
  formatDuration,
  formatFileSize,
});

// Load recordings on mount
onMounted(() => {
  if (props.isDeviceConnected) {
    loadRecordings();
  }
});

// Watch device connection status and load recordings when connected
watch(
  () => props.isDeviceConnected,
  (connected) => {
    if (connected) {
      loadRecordings();
    }
  }
);
</script>
