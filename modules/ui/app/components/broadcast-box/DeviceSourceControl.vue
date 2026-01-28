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
            value-attribute="value"
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
            value-attribute="value"
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
import type { DeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';
import { computed, ref, watch, nextTick } from 'vue';

const props = defineProps<{
  device: BroadcastDevice;
  isDeviceConnected: boolean;
  connectionStatus?: DeviceConnectionStatus; // Passed from parent to share single connection
}>();

const { t } = useI18n();

// Use provided connection status or create a default empty one
const connectionStatus = computed(
  () =>
    props.connectionStatus || ({ connected: false } as DeviceConnectionStatus)
);

// Get device UUID for commands
const deviceUuid = computed(() => props.device.deviceUuid);
const deviceUuidRef = computed(() => deviceUuid.value);

const { setSources, loading } = useDeviceCommands(deviceUuidRef);

// Get source objects if available (for better matching)
const videoSourceObjects = computed(() => {
  return props.device.capabilities?.videoSourceObjects || [];
});

const audioSourceObjects = computed(() => {
  return props.device.capabilities?.audioSourceObjects || [];
});

// Transform source objects into dropdown items with identifier as value and name as label
// Fallback to string array if source objects are not available
const videoSources = computed((): Array<{ value: string; label: string }> => {
  const objects = videoSourceObjects.value;
  if (objects && objects.length > 0) {
    return objects.map((source: any) => ({
      value: source.identifier || source.name || String(source.id),
      label: source.name || source.identifier || `Source ${source.id}`,
    }));
  }
  // Fallback to string array (legacy format)
  const stringArray = props.device.capabilities?.videoSources || [];
  return stringArray.map((identifier: string) => ({
    value: identifier,
    label: identifier,
  }));
});

const audioSources = computed((): Array<{ value: string; label: string }> => {
  const objects = audioSourceObjects.value;
  if (objects && objects.length > 0) {
    return objects.map((source: any) => ({
      value: source.identifier || source.name || String(source.id),
      label: source.name || source.identifier || `Source ${source.id}`,
    }));
  }
  // Fallback to string array (legacy format)
  const stringArray = props.device.capabilities?.audioSources || [];
  return stringArray.map((identifier: string) => ({
    value: identifier,
    label: identifier,
  }));
});

// Current active sources - prefer real-time from WebSocket, fallback to device config
const currentVideoSource = computed(() => {
  // Use real-time active source identifier if available
  const activeVideo =
    connectionStatus.value.activeSources?.video ||
    props.device.activeSources?.video;
  if (activeVideo) {
    // Prefer identifier, fallback to name
    return activeVideo.identifier || activeVideo.name;
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
    // Prefer identifier, fallback to name
    return activeAudio.identifier || activeAudio.name;
  }
  // Fallback to device config
  return props.device.config?.defaultAudioSource;
});

// Helper to find a valid source value (identifier) that matches available sources
// Tries multiple matching strategies: exact match, identifier match, name match, case-insensitive
const findValidSource = (
  preferredValue: string | undefined,
  availableItems: Array<{ value: string; label: string }>,
  sourceObjects?: any[]
): string | undefined => {
  if (!preferredValue || availableItems.length === 0) {
    return undefined;
  }

  // Strategy 1: Exact match by value (identifier)
  const exactMatch = availableItems.find(
    (item) => item.value === preferredValue
  );
  if (exactMatch) {
    return exactMatch.value;
  }

  // Strategy 2: Case-insensitive match by value
  const caseInsensitiveMatch = availableItems.find(
    (item) => item.value.toLowerCase() === preferredValue.toLowerCase()
  );
  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch.value;
  }

  // Strategy 3: Match by label (name) - find the identifier for a given name
  const matchByLabel = availableItems.find(
    (item) =>
      item.label === preferredValue ||
      item.label.toLowerCase() === preferredValue.toLowerCase()
  );
  if (matchByLabel) {
    return matchByLabel.value;
  }

  // Strategy 4: Match using source objects (if available) - for backward compatibility
  if (sourceObjects && sourceObjects.length > 0) {
    // Try to find by identifier
    const matchByIdentifier = sourceObjects.find(
      (s: any) =>
        s.identifier &&
        (s.identifier === preferredValue ||
          s.identifier.toLowerCase() === preferredValue.toLowerCase())
    );
    if (matchByIdentifier && matchByIdentifier.identifier) {
      // Check if this identifier exists in available items
      const item = availableItems.find(
        (item) => item.value === matchByIdentifier.identifier
      );
      if (item) {
        return item.value;
      }
    }

    // Try to find by name
    const matchByName = sourceObjects.find(
      (s: any) =>
        s.name &&
        (s.name === preferredValue ||
          s.name.toLowerCase() === preferredValue.toLowerCase())
    );
    if (matchByName && matchByName.identifier) {
      // Check if this identifier exists in available items
      const item = availableItems.find(
        (item) => item.value === matchByName.identifier
      );
      if (item) {
        return item.value;
      }
    }
  }

  // Strategy 5: Partial match (if preferredValue is an identifier like "razer_kiyo_pro"
  // and label has "Razer Kiyo Pro", try to match by converting)
  const normalizedPreferred = preferredValue
    .toLowerCase()
    .replace(/[_\s-]/g, '');
  const partialMatch = availableItems.find((item) => {
    const normalizedValue = item.value.toLowerCase().replace(/[_\s-]/g, '');
    const normalizedLabel = item.label.toLowerCase().replace(/[_\s-]/g, '');
    return (
      normalizedValue === normalizedPreferred ||
      normalizedLabel === normalizedPreferred
    );
  });
  if (partialMatch) {
    return partialMatch.value;
  }

  // No match found
  return undefined;
};

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

// Internal refs to store the identifier values
const selectedVideoSourceValue = ref<string | undefined>(undefined);
const selectedAudioSourceValue = ref<string | undefined>(undefined);

// Computed properties for USelectMenu (converts between string value and object)
const selectedVideoSource = computed({
  get: () => {
    if (!selectedVideoSourceValue.value) return undefined;
    return videoSources.value.find(
      (s) => s.value === selectedVideoSourceValue.value
    );
  },
  set: (value: { value: string; label: string } | undefined) => {
    selectedVideoSourceValue.value = value?.value;
  },
});

const selectedAudioSource = computed({
  get: () => {
    if (!selectedAudioSourceValue.value) return undefined;
    return audioSources.value.find(
      (s) => s.value === selectedAudioSourceValue.value
    );
  },
  set: (value: { value: string; label: string } | undefined) => {
    selectedAudioSourceValue.value = value?.value;
  },
});

// Initialize selected sources when device data is available
const initializeSelectedSources = () => {
  const currentVideo = currentVideoSource.value;
  const currentAudio = currentAudioSource.value;
  const availableVideo = videoSources.value;
  const availableAudio = audioSources.value;
  const videoObjects = videoSourceObjects.value;
  const audioObjects = audioSourceObjects.value;

  // Set video source if it's valid and available (returns identifier as value)
  const validVideo = findValidSource(
    currentVideo,
    availableVideo,
    videoObjects
  );
  if (validVideo !== undefined) {
    selectedVideoSourceValue.value = validVideo;
  }

  // Set audio source if it's valid and available (returns identifier as value)
  const validAudio = findValidSource(
    currentAudio,
    availableAudio,
    audioObjects
  );
  if (validAudio !== undefined) {
    selectedAudioSourceValue.value = validAudio;
  }
};

// Update selected sources when device config or capabilities change
// Watch for changes in current sources, device config, and available sources
watch(
  () =>
    [
      currentVideoSource.value,
      currentAudioSource.value,
      videoSources.value,
      audioSources.value,
      videoSourceObjects.value,
      audioSourceObjects.value,
    ] as [
      string | undefined,
      string | undefined,
      Array<{ value: string; label: string }>,
      Array<{ value: string; label: string }>,
      any[],
      any[],
    ],
  (
    [
      newVideo,
      newAudio,
      availableVideo,
      availableAudio,
      videoObjects,
      audioObjects,
    ],
    oldValue
  ) => {
    // Handle first run (oldValue is undefined) or when old values exist
    const [oldVideo, oldAudio] = oldValue || [undefined, undefined];

    // Check if video source changed or needs validation
    const validVideo = findValidSource(newVideo, availableVideo, videoObjects);
    if (
      newVideo !== oldVideo ||
      validVideo !== selectedVideoSourceValue.value
    ) {
      selectedVideoSourceValue.value = validVideo;
    }

    // Check if audio source changed or needs validation
    const validAudio = findValidSource(newAudio, availableAudio, audioObjects);
    if (
      newAudio !== oldAudio ||
      validAudio !== selectedAudioSourceValue.value
    ) {
      selectedAudioSourceValue.value = validAudio;
    }
  },
  { immediate: true }
);

// Also initialize when component mounts and device data becomes available
// Watch for device config, capabilities, and connection status changes
watch(
  () =>
    [
      props.device.config,
      props.device.capabilities,
      videoSources.value.length,
      audioSources.value.length,
      connectionStatus.value.activeSources,
      props.device.activeSources,
    ] as const,
  () => {
    // Only initialize if we have sources available
    if (videoSources.value.length > 0 || audioSources.value.length > 0) {
      // Use nextTick to ensure all reactive updates have completed
      nextTick(() => {
        initializeSelectedSources();
      });
    }
  },
  { immediate: true, deep: true }
);

// Check if there are changes to apply
const hasChanges = computed(() => {
  return (
    selectedVideoSourceValue.value !== currentVideoSource.value ||
    selectedAudioSourceValue.value !== currentAudioSource.value
  );
});

// Set sources (only called when button is clicked; uses sources.set)
const handleSwitch = async () => {
  if (!hasChanges.value || !props.isDeviceConnected) {
    return;
  }

  try {
    await setSources(
      selectedVideoSourceValue.value || undefined,
      selectedAudioSourceValue.value || undefined
    );
    // Sources will be updated via sources.changed or device refresh
  } catch (error) {
    // Error already handled in composable
    console.error('Failed to set sources:', error);
  }
};
</script>
