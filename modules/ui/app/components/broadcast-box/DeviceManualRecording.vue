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

      <!-- Recordings List -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium">
            {{ t('broadcastBox.recordingsList') }}
          </h3>
          <UButton
            variant="ghost"
            size="xs"
            icon="i-lucide-refresh-cw"
            :loading="isLoadingRecordings"
            :disabled="!isDeviceConnected"
            @click="loadRecordings"
          >
            {{ t('common.refresh') }}
          </UButton>
        </div>

        <!-- Loading State -->
        <div v-if="isLoadingRecordings" class="text-center py-4">
          <UIcon
            name="i-lucide-loader-2"
            class="w-5 h-5 animate-spin text-gray-400"
          />
        </div>

        <!-- Empty State -->
        <UAlert
          v-else-if="recordings.length === 0"
          color="neutral"
          variant="soft"
          :title="t('broadcastBox.noRecordings')"
          :description="t('broadcastBox.noRecordingsDesc')"
          icon="i-lucide-info"
        />

        <!-- Recordings Table -->
        <div v-else class="space-y-2">
          <div
            v-for="recording in recordings"
            :key="recording.recording_id"
            class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium">
                  {{ formatDate(recording.started_at) }}
                </span>
                <UBadge
                  v-if="!recording.stopped_at"
                  color="error"
                  variant="soft"
                  size="xs"
                >
                  {{ t('broadcastBox.recording') }}
                </UBadge>
              </div>
              <div class="text-xs text-gray-500 space-y-1">
                <div>
                  {{ t('broadcastBox.duration') }}:
                  {{ formatDuration(recording.duration_seconds) }}
                </div>
                <div>
                  {{ t('broadcastBox.fileSize') }}:
                  {{ formatFileSize(recording.file_size_bytes) }}
                </div>
                <div v-if="recording.quality" class="capitalize">
                  {{ t('broadcastBox.quality') }}: {{ recording.quality }}
                </div>
              </div>
            </div>
          </div>
        </div>
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

// Handle start recording
const handleStart = async () => {
  try {
    await startRecording();
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
