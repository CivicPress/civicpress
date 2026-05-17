<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.statusControl') }}
        </h2>
        <div class="flex items-center gap-2">
          <USwitch
            v-model="autoRefreshEnabled"
            size="sm"
            :label="t('broadcastBox.autoRefresh')"
          />
          <UButton
            color="primary"
            variant="ghost"
            size="sm"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            :disabled="loading || !isDeviceConnected"
            @click="handleRefresh"
          >
            {{ t('broadcastBox.refreshStatus') }}
          </UButton>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Current Status -->
      <div>
        <label
          class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
        >
          {{ t('broadcastBox.currentStatus') }}
        </label>
        <div class="flex items-center gap-2">
          <UBadge
            :color="
              deviceState === 'recording'
                ? 'error'
                : deviceState === 'encoding'
                  ? 'primary'
                  : deviceState === 'uploading'
                    ? 'primary'
                    : 'neutral'
            "
            variant="soft"
            size="lg"
          >
            <UIcon
              :name="
                deviceState === 'recording'
                  ? 'i-lucide-record'
                  : deviceState === 'encoding'
                    ? 'i-lucide-cog'
                    : deviceState === 'uploading'
                      ? 'i-lucide-upload'
                      : 'i-lucide-pause'
              "
              class="w-4 h-4 mr-1"
            />
            {{ t(`broadcastBox.state.${deviceState}`) }}
          </UBadge>
        </div>
      </div>

      <!-- Active Session -->
      <div v-if="activeSessionId">
        <label
          class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
        >
          {{ t('broadcastBox.activeSession') }}
        </label>
        <div class="flex items-center gap-2">
          <p class="text-sm font-mono text-gray-900 dark:text-gray-100">
            {{ activeSessionId }}
          </p>
          <UButton
            variant="ghost"
            size="xs"
            icon="i-lucide-arrow-right"
            @click="navigateTo(`/records/session/${civicpressSessionId}`)"
          >
            {{ t('broadcastBox.viewSession') }}
          </UButton>
        </div>
      </div>

      <!-- Last Refresh -->
      <div v-if="lastRefreshTime">
        <label
          class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
        >
          {{ t('broadcastBox.lastRefresh') }}
        </label>
        <p class="text-sm text-gray-500">
          {{ formatTime(lastRefreshTime) }}
        </p>
      </div>

      <!-- Empty State -->
      <UAlert
        v-if="!isDeviceConnected"
        color="neutral"
        variant="soft"
        :title="t('broadcastBox.deviceOffline')"
        :description="t('broadcastBox.deviceOfflineDesc')"
        icon="i-lucide-wifi-off"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import type { DeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';
import { useDeviceCommands } from '~/composables/useDeviceCommands';
import { computed, onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{
  device: BroadcastDevice;
  isDeviceConnected: boolean;
  connectionStatus: DeviceConnectionStatus;
}>();

const emit = defineEmits<{
  refreshed: [];
}>();

const { t } = useI18n();
const { formatDate: formatDateUtil } = useRecordUtils();

// Get device UUID for commands
const deviceUuid = computed(() => props.device.deviceUuid);
const deviceUuidRef = computed(() => deviceUuid.value);

const { getStatus, loading } = useDeviceCommands(deviceUuidRef);

// Auto-refresh state
const autoRefreshEnabled = ref(false);
const lastRefreshTime = ref<Date | null>(null);
let autoRefreshInterval: NodeJS.Timeout | null = null;

// Device state from connection status
const deviceState = computed(() => {
  return props.connectionStatus.state || 'idle';
});

// Active session ID
const activeSessionId = computed(() => {
  return props.connectionStatus.sessionId || null;
});

// CivicPress session ID (would need to be fetched or passed as prop)
const civicpressSessionId = computed(() => {
  // For now, use the active session ID
  // In a real implementation, we'd need to map broadcast session ID to civicpress session ID
  return activeSessionId.value || '';
});

// Format time for display
const formatTime = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffSeconds < 10) {
    return t('broadcastBox.justNow');
  } else if (diffSeconds < 60) {
    return t('broadcastBox.secondsAgo', { seconds: diffSeconds });
  } else if (diffMinutes === 1) {
    return t('broadcastBox.oneMinuteAgo');
  } else if (diffMinutes < 60) {
    return t('broadcastBox.minutesAgo', { minutes: diffMinutes });
  } else {
    return formatDateUtil(date.toISOString());
  }
};

// Refresh status
const handleRefresh = async () => {
  if (!props.isDeviceConnected) {
    return;
  }

  try {
    await getStatus();
    lastRefreshTime.value = new Date();
    emit('refreshed');
  } catch (error) {
    // Error already handled in composable
    console.error('Failed to refresh status:', error);
  }
};

// Auto-refresh logic
const startAutoRefresh = () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }

  if (autoRefreshEnabled.value && props.isDeviceConnected) {
    // Refresh immediately
    handleRefresh();
    // Then refresh every 30 seconds
    autoRefreshInterval = setInterval(() => {
      if (props.isDeviceConnected) {
        handleRefresh();
      } else {
        // Stop auto-refresh if device disconnects
        if (autoRefreshInterval) {
          clearInterval(autoRefreshInterval);
          autoRefreshInterval = null;
        }
      }
    }, 30000);
  }
};

watch(autoRefreshEnabled, startAutoRefresh);
watch(() => props.isDeviceConnected, (connected) => {
  if (!connected && autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  } else if (connected && autoRefreshEnabled.value) {
    startAutoRefresh();
  }
});

// Cleanup on unmount
onUnmounted(() => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
});
</script>

