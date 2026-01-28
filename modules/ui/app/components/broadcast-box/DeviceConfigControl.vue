<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.configurationControl') }}
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
      <!-- Quality Preset -->
      <UFormField
        :label="t('broadcastBox.qualityPreset')"
        :description="t('broadcastBox.qualityPresetDesc')"
      >
        <USelectMenu
          v-model="selectedQualityPreset"
          :items="qualityPresets"
          :disabled="loading || !isDeviceConnected"
          :loading="loading"
          :placeholder="t('broadcastBox.selectQualityPreset')"
        />
      </UFormField>

      <!-- Auto Start -->
      <UFormField
        :label="t('broadcastBox.autoStart')"
        :description="t('broadcastBox.autoStartDesc')"
      >
        <USwitch
          v-model="selectedAutoStart"
          :disabled="loading || !isDeviceConnected"
        />
      </UFormField>

      <!-- Apply Button -->
      <div class="flex justify-end pt-2">
        <UButton
          color="primary"
          :loading="loading"
          :disabled="loading || !isDeviceConnected || !hasChanges"
          icon="i-lucide-save"
          @click="handleApply"
        >
          {{ t('broadcastBox.applyConfiguration') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import { useDeviceCommands } from '~/composables/useDeviceCommands';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  device: BroadcastDevice;
  isDeviceConnected: boolean;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const { t } = useI18n();

// Get device UUID for commands
const deviceUuid = computed(() => props.device.deviceUuid);
const deviceUuidRef = computed(() => deviceUuid.value);

const { updateConfig, loading } = useDeviceCommands(deviceUuidRef);

// Quality preset label for known presets; otherwise capitalized name
function qualityPresetLabel(name: string): string {
  const key = name.toLowerCase();
  if (key === 'low') return t('broadcastBox.qualityLow');
  if (key === 'standard') return t('broadcastBox.qualityStandard');
  if (key === 'high') return t('broadcastBox.qualityHigh');
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Quality preset options: from device capabilities or fallback to [low, standard, high]
const qualityPresets = computed(() => {
  const presets = props.device?.capabilities?.quality?.presets;
  if (Array.isArray(presets) && presets.length > 0) {
    return presets.map((p) => ({
      label: qualityPresetLabel(p.name),
      value: p.name,
    }));
  }
  return [
    { label: t('broadcastBox.qualityLow'), value: 'low' },
    { label: t('broadcastBox.qualityStandard'), value: 'standard' },
    { label: t('broadcastBox.qualityHigh'), value: 'high' },
  ];
});

// Current/default preset: config if set, else capabilities.defaults.recording, else 'standard'
const currentQualityPreset = computed(
  () =>
    props.device?.config?.qualityPreset ??
    props.device?.capabilities?.quality?.defaults?.recording ??
    'standard'
);
const currentAutoStart = computed(
  () => props.device?.config?.autoStart ?? false
);

// Selected config values
const selectedQualityPreset = ref<{ label: string; value: string } | undefined>(
  undefined
);
const selectedAutoStart = ref(currentAutoStart.value);

// Sync selected quality with current preset and available options (handle e.g. "ultra" in list)
watch(
  () => [
    currentQualityPreset.value,
    currentAutoStart.value,
    qualityPresets.value,
  ],
  ([newQuality, newAutoStart, options]) => {
    const opts = options as { label: string; value: string }[];
    const match = opts.find((p) => p.value === newQuality);
    selectedQualityPreset.value =
      match ?? opts.find((p) => p.value === 'standard') ?? opts[0] ?? undefined;
    selectedAutoStart.value = newAutoStart;
  },
  { immediate: true }
);

// Check if there are changes to apply
const hasChanges = computed(() => {
  return (
    selectedQualityPreset.value?.value !== currentQualityPreset.value ||
    selectedAutoStart.value !== currentAutoStart.value
  );
});

// Apply configuration
const handleApply = async () => {
  if (!hasChanges.value || !props.isDeviceConnected) {
    return;
  }

  try {
    await updateConfig({
      qualityPreset:
        selectedQualityPreset.value?.value ?? currentQualityPreset.value,
      autoStart: selectedAutoStart.value,
      // Preserve existing video/audio sources
      defaultVideoSource: props.device?.config?.defaultVideoSource,
      defaultAudioSource: props.device?.config?.defaultAudioSource,
    });
    emit('updated');
  } catch (error) {
    // Error already handled in composable
    console.error('Failed to update configuration:', error);
  }
};
</script>
