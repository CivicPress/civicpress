<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.pipConfiguration') }}
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
      <!-- Not supported -->
      <UAlert
        v-if="pipSupported === false"
        color="neutral"
        variant="soft"
        :title="t('broadcastBox.notSupported')"
        :description="t('broadcastBox.pipSupportDesc')"
        icon="i-lucide-ban"
      />

      <!-- Enable/Disable Toggle -->
      <UFormField
        :label="t('broadcastBox.pipStatus')"
        :description="t('broadcastBox.pipStatusDesc')"
      >
        <USwitch
          v-model="pipEnabled"
          :disabled="loading || !isDeviceConnected || pipSupported === false"
          @update:model-value="handlePipEnabledChange"
        />
      </UFormField>

      <!-- Main Source -->
      <UFormField
        :label="t('broadcastBox.pipMainSource')"
        :description="t('broadcastBox.pipMainSourceDesc')"
        :error="errors.mainSource"
      >
        <USelectMenu
          v-model="selectedMainSource"
          :items="videoSources"
          :disabled="
            loading ||
            !isDeviceConnected ||
            !pipEnabled ||
            pipSupported === false
          "
          :loading="loading"
          :placeholder="t('broadcastBox.selectMainSource')"
          value-attribute="value"
        />
      </UFormField>

      <!-- PiP Source (always visible so user can configure before enabling) -->
      <UFormField
        :label="t('broadcastBox.pipSource')"
        :description="t('broadcastBox.pipSourceDesc')"
        :error="errors.pipSource"
      >
        <USelectMenu
          v-model="selectedPipSource"
          :items="pipSourceOptions"
          :disabled="loading || !isDeviceConnected || pipSupported === false"
          :loading="loading"
          :placeholder="t('broadcastBox.selectPipSource')"
        />
      </UFormField>

      <!-- Position (always visible so user can configure before enabling) -->
      <UFormField
        :label="t('broadcastBox.pipPosition')"
        :description="t('broadcastBox.pipPositionDesc')"
      >
        <USelectMenu
          v-model="selectedPosition"
          :items="positionOptions"
          :disabled="loading || !isDeviceConnected || pipSupported === false"
          :loading="loading"
        />
      </UFormField>

      <!-- Size (single decimal: fraction of frame, e.g. 0.25 = 25%) -->
      <UFormField
        :label="t('broadcastBox.pipSize')"
        :description="t('broadcastBox.pipSizeFractionDesc')"
        :error="errors.pipSize"
      >
        <div class="flex items-center gap-2">
          <UInput
            v-model.number="pipSizeValue"
            type="number"
            step="0.05"
            min="0.05"
            max="1"
            :disabled="loading || !isDeviceConnected || pipSupported === false"
            class="w-24"
          />
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ Math.round((pipSizeValue || 0.25) * 100) }}%
          </span>
        </div>
      </UFormField>

      <!-- Apply Button -->
      <div class="flex justify-end pt-2">
        <UButton
          color="primary"
          :loading="loading"
          :disabled="
            loading ||
            !isDeviceConnected ||
            !hasChanges ||
            pipSupported === false
          "
          icon="i-lucide-settings"
          @click="handleApply"
        >
          {{ t('broadcastBox.pipApply') }}
        </UButton>
      </div>

      <!-- Current Configuration Display -->
      <div
        v-if="currentPipConfig"
        class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700"
      >
        <h3 class="text-sm font-semibold mb-3">
          {{ t('broadcastBox.currentConfiguration') }}
        </h3>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-gray-600 dark:text-gray-400">
              {{ t('broadcastBox.pipStatus') }}:
            </span>
            <UBadge
              :color="currentPipConfig.enabled ? 'primary' : 'neutral'"
              variant="soft"
              size="sm"
            >
              {{
                currentPipConfig.enabled
                  ? t('broadcastBox.enabled')
                  : t('broadcastBox.disabled')
              }}
            </UBadge>
          </div>
          <div
            v-if="currentPipConfig.enabled && currentPipConfig.mainSource"
            class="flex items-center gap-2"
          >
            <span class="text-gray-600 dark:text-gray-400">
              {{ t('broadcastBox.pipMainSource') }}:
            </span>
            <span class="font-medium">
              {{ currentPipConfig.mainSource.identifier }}
            </span>
          </div>
          <div
            v-if="currentPipConfig.enabled && currentPipConfig.pipSource"
            class="flex items-center gap-2"
          >
            <span class="text-gray-600 dark:text-gray-400">
              {{ t('broadcastBox.pipSource') }}:
            </span>
            <span class="font-medium">
              {{ currentPipConfig.pipSource.identifier }}
            </span>
          </div>
          <div
            v-if="currentPipConfig.enabled && currentPipConfig.position"
            class="flex items-center gap-2"
          >
            <span class="text-gray-600 dark:text-gray-400">
              {{ t('broadcastBox.pipPosition') }}:
            </span>
            <span class="font-medium">
              {{ formatPipPosition(currentPipConfig.position) }}
            </span>
          </div>
          <div
            v-if="currentPipConfig.enabled && currentPipConfig.size != null"
            class="flex items-center gap-2"
          >
            <span class="text-gray-600 dark:text-gray-400">
              {{ t('broadcastBox.pipSize') }}:
            </span>
            <span class="font-medium">
              {{ formatPipSizeDisplay(currentPipConfig.size) }}
            </span>
          </div>
        </div>
      </div>
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

// Get real-time connection status for current PiP config
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

const { setPip, setSources, loading } = useDeviceCommands(deviceUuidRef);

// Video sources for dropdowns (convert to USelectMenu format)
const videoSources = computed(() => {
  return (props.device.capabilities?.videoSources || []).map((s) => ({
    label: s,
    value: s,
  }));
});

// Current PiP configuration (from WebSocket or device)
const currentPipConfig = computed(() => {
  return connectionStatus.value.pip || props.device.pip;
});

const pipCapabilities = computed(
  () => props.device.capabilities?.pipCapabilities
);

const pipSupported = computed(() => {
  const statusSupported = currentPipConfig.value?.supported;
  if (statusSupported !== undefined) return statusSupported;
  // Fallback to stored capabilities (older devices may not report supported in status)
  return props.device.capabilities?.pipSupported ?? true;
});

// PiP size: single decimal (0.05–1.0). Default 0.25.
const PIP_SIZE_MIN = 0.05;
const PIP_SIZE_MAX = 1;
const PIP_SIZE_DEFAULT = 0.25;

/** Normalize pip size from config (number or legacy { width, height }) to number */
function pipSizeAsNumber(
  size: number | { width: number; height: number } | undefined
): number {
  if (typeof size === 'number' && size > 0 && size <= 1) return size;
  return PIP_SIZE_DEFAULT;
}

// Form state
const pipEnabled = ref(currentPipConfig.value?.enabled || false);
const mainSourceValue = ref<string | undefined>(
  currentPipConfig.value?.mainSource?.identifier
);
const pipSourceValue = ref<string | null | undefined>(
  currentPipConfig.value?.pipSource?.identifier || null
);
const positionValue = ref<string>(
  currentPipConfig.value?.position || 'top_right'
);
const pipSizeValue = ref(
  pipSizeAsNumber(
    currentPipConfig.value?.size as
      | number
      | { width: number; height: number }
      | undefined
  )
);

// Computed properties for USelectMenu (expects objects, not values)
const selectedMainSource = computed({
  get: () => {
    if (!mainSourceValue.value) return undefined;
    return videoSources.value.find((s) => s.value === mainSourceValue.value);
  },
  set: (value: { label: string; value: string } | undefined) => {
    mainSourceValue.value = value?.value;
  },
});

const selectedPipSource = computed({
  get: () => {
    if (pipSourceValue.value === null || pipSourceValue.value === undefined) {
      return pipSourceOptions.value.find((opt) => opt.value === null);
    }
    return pipSourceOptions.value.find(
      (opt) => opt.value === pipSourceValue.value
    );
  },
  set: (value: { label: string; value: string | null } | undefined) => {
    pipSourceValue.value = value?.value ?? null;
  },
});

const selectedPosition = computed({
  get: () => {
    return positionOptions.value.find(
      (opt) => opt.value === positionValue.value
    );
  },
  set: (value: { label: string; value: string } | undefined) => {
    if (value) {
      positionValue.value = value.value;
    }
  },
});

// Validation errors
const errors = ref<{
  mainSource?: string;
  pipSource?: string;
  pipSize?: string;
}>({});

// PiP source options (include "None" to disable)
const pipSourceOptions = computed(() => {
  const sources = props.device.capabilities?.videoSources || [];
  return [
    { label: t('broadcastBox.pipNone'), value: null },
    ...sources.map((s) => ({ label: s, value: s })),
  ];
});

// Position options
const positionOptions = computed(() => {
  const all = [
    { label: t('broadcastBox.pipPositionTopLeft'), value: 'top_left' },
    { label: t('broadcastBox.pipPositionTopRight'), value: 'top_right' },
    { label: t('broadcastBox.pipPositionBottomLeft'), value: 'bottom_left' },
    { label: t('broadcastBox.pipPositionBottomRight'), value: 'bottom_right' },
    { label: t('broadcastBox.pipPositionCenter'), value: 'center' },
  ];
  const supported = pipCapabilities.value?.supportedPositions;
  if (!supported || supported.length === 0) return all;
  return all.filter((opt) => supported.includes(opt.value as any));
});

// Helper to format PiP position
const formatPipPosition = (position: string | undefined): string => {
  if (!position) return '';
  const key = `broadcastBox.pipPosition${position
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')}`;
  const translated = t(key);
  return translated !== key ? translated : position;
};

// Helper to format PiP size for display (number = "25%", legacy object = "25% approx" or similar)
const formatPipSizeDisplay = (
  size: number | { width: number; height: number }
): string => {
  if (typeof size === 'number') {
    return `${Math.round(size * 100)}%`;
  }
  return `${size.width}×${size.height}`;
};

// Update form when current config changes
watch(
  () => currentPipConfig.value,
  (newConfig) => {
    if (newConfig) {
      pipEnabled.value = newConfig.enabled || false;
      mainSourceValue.value = newConfig.mainSource?.identifier;
      pipSourceValue.value = newConfig.pipSource?.identifier || null;
      positionValue.value = newConfig.position || 'top_right';
      pipSizeValue.value = pipSizeAsNumber(
        newConfig.size as number | { width: number; height: number } | undefined
      );
    }
  },
  { deep: true }
);

// Check if there are changes to apply
const hasChanges = computed(() => {
  if (!pipEnabled.value) {
    // If disabling, check if currently enabled
    return currentPipConfig.value?.enabled === true;
  }

  // If enabling, check if values differ
  const currentPipSource =
    currentPipConfig.value?.pipSource?.identifier || null;
  const currentSize = pipSizeAsNumber(
    currentPipConfig.value?.size as
      | number
      | { width: number; height: number }
      | undefined
  );
  return (
    mainSourceValue.value !== currentPipConfig.value?.mainSource?.identifier ||
    pipSourceValue.value !== currentPipSource ||
    positionValue.value !== (currentPipConfig.value?.position || 'top_right') ||
    (pipSizeValue.value ?? PIP_SIZE_DEFAULT) !== currentSize
  );
});

// Handle PiP enabled toggle
const handlePipEnabledChange = (enabled: boolean) => {
  if (!enabled) {
    // When disabling, clear pipSource
    pipSourceValue.value = null;
  } else {
    // When enabling, ensure mainSource is set
    const sources = props.device.capabilities?.videoSources || [];
    if (!mainSourceValue.value && sources.length > 0) {
      mainSourceValue.value = sources[0];
    }
  }
};

// Validate form
const validate = (): boolean => {
  errors.value = {};

  if (pipEnabled.value) {
    if (pipSupported.value === false) {
      errors.value.mainSource = t('broadcastBox.notSupported');
      return false;
    }

    if (!mainSourceValue.value) {
      errors.value.mainSource = t(
        'broadcastBox.pipValidationMainSourceRequired'
      );
      return false;
    }

    if (
      pipSourceValue.value &&
      pipSourceValue.value === mainSourceValue.value
    ) {
      errors.value.pipSource = t(
        'broadcastBox.pipValidationPipSourceDifferent'
      );
      return false;
    }

    const size = pipSizeValue.value ?? PIP_SIZE_DEFAULT;
    if (
      typeof size !== 'number' ||
      !Number.isFinite(size) ||
      size < PIP_SIZE_MIN ||
      size > PIP_SIZE_MAX
    ) {
      errors.value.pipSize = t('broadcastBox.pipValidationSizeFraction');
      return false;
    }
  }

  return true;
};

// Apply PiP configuration
const handleApply = async () => {
  if (!validate()) {
    return;
  }

  if (!pipEnabled.value) {
    // Disable PiP
    if (!mainSourceValue.value) {
      errors.value.mainSource = t(
        'broadcastBox.pipValidationMainSourceRequired'
      );
      return;
    }

    try {
      await setPip(mainSourceValue.value, null, undefined, props.device);
    } catch (error) {
      // Error already handled in composable
      console.error('Failed to disable PiP:', error);
    }
  } else {
    // Enable/Update PiP
    if (!mainSourceValue.value) {
      errors.value.mainSource = t(
        'broadcastBox.pipValidationMainSourceRequired'
      );
      return;
    }

    try {
      await setPip(
        mainSourceValue.value,
        pipSourceValue.value,
        {
          position: positionValue.value as
            | 'top_left'
            | 'top_right'
            | 'bottom_left'
            | 'bottom_right'
            | 'center',
          size: pipSizeValue.value ?? PIP_SIZE_DEFAULT,
        },
        props.device
      );
      // After enabling PiP, set active video source to "pip" so preview/record use PiP layout
      const currentAudio =
        props.device.activeSources?.audio?.identifier ??
        props.device.config?.defaultAudioSource;
      if (currentAudio) {
        await setSources('pip', currentAudio);
      } else {
        await setSources('pip');
      }
    } catch (error) {
      // Error already handled in composable
      console.error('Failed to configure PiP:', error);
    }
  }
};
</script>
