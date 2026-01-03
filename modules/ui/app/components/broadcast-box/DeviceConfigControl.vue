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

// Quality preset options
const qualityPresets = [
  { label: t('broadcastBox.qualityLow'), value: 'low' },
  { label: t('broadcastBox.qualityStandard'), value: 'standard' },
  { label: t('broadcastBox.qualityHigh'), value: 'high' },
];

// Current config values
const currentQualityPreset = computed(() => props.device.config?.qualityPreset || 'standard');
const currentAutoStart = computed(() => props.device.config?.autoStart || false);

// Selected config values
const selectedQualityPreset = ref<{ label: string; value: string } | undefined>(
  qualityPresets.find((p) => p.value === currentQualityPreset.value) ?? qualityPresets[1] ?? undefined
);
const selectedAutoStart = ref(currentAutoStart.value);

// Update selected values when device config changes
watch(
  () => [currentQualityPreset.value, currentAutoStart.value],
  ([newQuality, newAutoStart]) => {
    selectedQualityPreset.value =
      qualityPresets.find((p) => p.value === newQuality) ?? qualityPresets[1] ?? undefined;
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
      qualityPreset: selectedQualityPreset.value?.value as 'low' | 'standard' | 'high',
      autoStart: selectedAutoStart.value,
      // Preserve existing video/audio sources
      defaultVideoSource: props.device.config?.defaultVideoSource,
      defaultAudioSource: props.device.config?.defaultAudioSource,
    });
    emit('updated');
  } catch (error) {
    // Error already handled in composable
    console.error('Failed to update configuration:', error);
  }
};
</script>

