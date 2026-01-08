<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.sourceControl') }}
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
      <!-- Video Source -->
      <div v-if="videoSources.length > 0">
        <UFormField
          :label="t('broadcastBox.videoSource')"
          :description="t('broadcastBox.videoSourceDesc')"
        >
          <USelectMenu
            v-model="selectedVideoSource"
            :items="videoSources"
            :disabled="loading || !isDeviceConnected"
            :loading="loading"
            :placeholder="t('broadcastBox.selectVideoSource')"
          />
        </UFormField>
      </div>

      <!-- Audio Source -->
      <div v-if="audioSources.length > 0">
        <UFormField
          :label="t('broadcastBox.audioSource')"
          :description="t('broadcastBox.audioSourceDesc')"
        >
          <USelectMenu
            v-model="selectedAudioSource"
            :items="audioSources"
            :disabled="loading || !isDeviceConnected"
            :loading="loading"
            :placeholder="t('broadcastBox.selectAudioSource')"
          />
        </UFormField>
      </div>

      <!-- Switch Button -->
      <div class="flex justify-end pt-2">
        <UButton
          color="primary"
          :loading="loading"
          :disabled="loading || !isDeviceConnected || !hasChanges"
          icon="i-lucide-switch-camera"
          @click="handleSwitch"
        >
          {{ t('broadcastBox.switchSource') }}
        </UButton>
      </div>

      <!-- Empty State -->
      <UAlert
        v-if="videoSources.length === 0 && audioSources.length === 0"
        color="neutral"
        variant="soft"
        :title="t('broadcastBox.noSourcesAvailable')"
        :description="t('broadcastBox.noSourcesAvailableDesc')"
        icon="i-lucide-info"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import { useDeviceCommands } from '~/composables/useDeviceCommands';
import { useDeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  device: BroadcastDevice;
  isDeviceConnected: boolean;
}>();

const { t } = useI18n();

// Get real-time connection status for active sources
// useDeviceConnectionStatus expects string | null, not a computed ref
const deviceUuidForStatus = computed(() => props.device.deviceUuid);
const {
  status: connectionStatus,
  subscribe,
  unsubscribe,
} = useDeviceConnectionStatus(null);

// Subscribe to device status when component mounts
onMounted(() => {
  if (deviceUuidForStatus.value) {
    subscribe(deviceUuidForStatus.value);
  }
});

// Unsubscribe when component unmounts
onUnmounted(() => {
  if (deviceUuidForStatus.value) {
    unsubscribe(deviceUuidForStatus.value);
  }
});

// Get device UUID for commands
const deviceUuid = computed(() => props.device.deviceUuid);
const deviceUuidRef = computed(() => deviceUuid.value);

const { switchSource, loading } = useDeviceCommands(deviceUuidRef);

// Use device capabilities directly - they're updated from device.connected event
// No need to poll for sources - device broadcasts capabilities when it connects
const videoSources = computed(() => {
  return props.device.capabilities?.videoSources || [];
});

const audioSources = computed(() => {
  return props.device.capabilities?.audioSources || [];
});

// Current active sources - prefer real-time from WebSocket, fallback to device config
const currentVideoSource = computed(() => {
  // Use real-time active source identifier if available
  const activeVideo =
    connectionStatus.value.activeSources?.video ||
    props.device.activeSources?.video;
  if (activeVideo) {
    return activeVideo.identifier;
  }
  // Fallback to device config
  return props.device.config?.defaultVideoSource;
});

const currentAudioSource = computed(() => {
  // Use real-time active source identifier if available
  const activeAudio =
    connectionStatus.value.activeSources?.audio ||
    props.device.activeSources?.audio;
  if (activeAudio) {
    return activeAudio.identifier;
  }
  // Fallback to device config
  return props.device.config?.defaultAudioSource;
});

// Helper to check if a source is currently active
const isSourceActive = (
  sourceIdentifier: string,
  sourceType: 'video' | 'audio'
) => {
  const activeSource =
    sourceType === 'video'
      ? connectionStatus.value.activeSources?.video ||
        props.device.activeSources?.video
      : connectionStatus.value.activeSources?.audio ||
        props.device.activeSources?.audio;
  return activeSource?.identifier === sourceIdentifier;
};

// Selected sources (for switching)
// Use undefined instead of null to match USelectMenu's expected type
const selectedVideoSource = ref<string | undefined>(currentVideoSource.value);
const selectedAudioSource = ref<string | undefined>(currentAudioSource.value);

// Update selected sources when device config changes
// Only update if values actually changed (not just object reference)
watch(
  () =>
    [currentVideoSource.value, currentAudioSource.value] as [
      string | undefined,
      string | undefined,
    ],
  ([newVideo, newAudio], oldValue) => {
    // Handle first run (oldValue is undefined) or when old values exist
    const [oldVideo, oldAudio] = oldValue || [undefined, undefined];

    // Only update if values actually changed
    if (newVideo !== oldVideo) {
      selectedVideoSource.value = newVideo;
    }
    if (newAudio !== oldAudio) {
      selectedAudioSource.value = newAudio;
    }
  },
  { immediate: true }
);

// Check if there are changes to apply
const hasChanges = computed(() => {
  return (
    selectedVideoSource.value !== currentVideoSource.value ||
    selectedAudioSource.value !== currentAudioSource.value
  );
});

// Switch sources (only called when button is clicked)
const handleSwitch = async () => {
  if (!hasChanges.value || !props.isDeviceConnected) {
    return;
  }

  try {
    // Pass device object so switchSource can convert identifiers to numeric IDs
    await switchSource(
      selectedVideoSource.value || undefined,
      selectedAudioSource.value || undefined,
      props.device
    );
    // Sources will be updated when device data is refreshed
  } catch (error) {
    // Error already handled in composable
    console.error('Failed to switch source:', error);
  }
};
</script>
