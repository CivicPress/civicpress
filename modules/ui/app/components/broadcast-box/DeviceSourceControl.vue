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
            @update:model-value="handleVideoSourceChange"
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
            @update:model-value="handleAudioSourceChange"
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
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  device: BroadcastDevice;
  isDeviceConnected: boolean;
}>();

const { t } = useI18n();

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

// Current active sources from device config
const currentVideoSource = computed(() => props.device.config?.defaultVideoSource);
const currentAudioSource = computed(() => props.device.config?.defaultAudioSource);

// Selected sources (for switching)
// Use undefined instead of null to match USelectMenu's expected type
const selectedVideoSource = ref<string | undefined>(currentVideoSource.value);
const selectedAudioSource = ref<string | undefined>(currentAudioSource.value);

// Update selected sources when device config changes
// Only update if values actually changed (not just object reference)
watch(
  () => [currentVideoSource.value, currentAudioSource.value] as [string | undefined, string | undefined],
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

// Handle video source change (debounce switch)
let videoSourceTimeout: NodeJS.Timeout | null = null;
const handleVideoSourceChange = () => {
  if (videoSourceTimeout) {
    clearTimeout(videoSourceTimeout);
  }
  // Auto-switch after 500ms of no changes
  videoSourceTimeout = setTimeout(() => {
    if (hasChanges.value) {
      handleSwitch();
    }
  }, 500);
};

// Handle audio source change (debounce switch)
let audioSourceTimeout: NodeJS.Timeout | null = null;
const handleAudioSourceChange = () => {
  if (audioSourceTimeout) {
    clearTimeout(audioSourceTimeout);
  }
  // Auto-switch after 500ms of no changes
  audioSourceTimeout = setTimeout(() => {
    if (hasChanges.value) {
      handleSwitch();
    }
  }, 500);
};

// Switch sources
const handleSwitch = async () => {
  if (!hasChanges.value || !props.isDeviceConnected) {
    return;
  }

  try {
    await switchSource(selectedVideoSource.value || undefined, selectedAudioSource.value || undefined);
    // Sources will be updated when device data is refreshed
  } catch (error) {
    // Error already handled in composable
    console.error('Failed to switch source:', error);
  }
};
</script>

