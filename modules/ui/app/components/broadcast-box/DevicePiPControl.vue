<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.pipControl') }}
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

      <!-- PiP Source -->
      <UFormField
        v-if="pipEnabled"
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

      <!-- Position -->
      <UFormField
        v-if="pipEnabled"
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

      <!-- Size -->
      <div v-if="pipEnabled" class="grid grid-cols-2 gap-4">
        <UFormField
          :label="t('broadcastBox.pipWidth')"
          :error="errors.sizeWidth"
        >
          <UInput
            v-model.number="sizeWidth"
            type="number"
            :disabled="loading || !isDeviceConnected || pipSupported === false"
            :min="minPipSize.width"
            :max="maxPipSize.width"
          />
        </UFormField>
        <UFormField
          :label="t('broadcastBox.pipHeight')"
          :error="errors.sizeHeight"
        >
          <UInput
            v-model.number="sizeHeight"
            type="number"
            :disabled="loading || !isDeviceConnected || pipSupported === false"
            :min="minPipSize.height"
            :max="maxPipSize.height"
          />
        </UFormField>
      </div>

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
            v-if="currentPipConfig.enabled && currentPipConfig.size"
            class="flex items-center gap-2"
          >
            <span class="text-gray-600 dark:text-gray-400">
              {{ t('broadcastBox.pipSize') }}:
            </span>
            <span class="font-medium">
              {{ currentPipConfig.size.width }}x{{
                currentPipConfig.size.height
              }}
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

const { setPip, loading } = useDeviceCommands(deviceUuidRef);

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

const minPipSize = computed(() => {
  return (
    pipCapabilities.value?.minSize || {
      width: 1,
      height: 1,
    }
  );
});

const maxPipSize = computed(() => {
  return (
    pipCapabilities.value?.maxSize || {
      width: 1920,
      height: 1080,
    }
  );
});

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
const sizeWidth = ref(currentPipConfig.value?.size?.width || 320);
const sizeHeight = ref(currentPipConfig.value?.size?.height || 240);

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
  sizeWidth?: string;
  sizeHeight?: string;
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

// Update form when current config changes
watch(
  () => currentPipConfig.value,
  (newConfig) => {
    if (newConfig) {
      pipEnabled.value = newConfig.enabled || false;
      mainSourceValue.value = newConfig.mainSource?.identifier;
      pipSourceValue.value = newConfig.pipSource?.identifier || null;
      positionValue.value = newConfig.position || 'top_right';
      sizeWidth.value = newConfig.size?.width || 320;
      sizeHeight.value = newConfig.size?.height || 240;
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
  return (
    mainSourceValue.value !== currentPipConfig.value?.mainSource?.identifier ||
    pipSourceValue.value !== currentPipSource ||
    positionValue.value !== (currentPipConfig.value?.position || 'top_right') ||
    sizeWidth.value !== (currentPipConfig.value?.size?.width || 320) ||
    sizeHeight.value !== (currentPipConfig.value?.size?.height || 240)
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

    if (sizeWidth.value <= 0 || !Number.isInteger(sizeWidth.value)) {
      errors.value.sizeWidth = t('broadcastBox.pipValidationSizePositive');
      return false;
    }

    if (sizeHeight.value <= 0 || !Number.isInteger(sizeHeight.value)) {
      errors.value.sizeHeight = t('broadcastBox.pipValidationSizePositive');
      return false;
    }

    // Enforce capability bounds if available
    if (
      sizeWidth.value < minPipSize.value.width ||
      sizeWidth.value > maxPipSize.value.width
    ) {
      errors.value.sizeWidth = t('broadcastBox.pipValidationSizeRequired');
      return false;
    }
    if (
      sizeHeight.value < minPipSize.value.height ||
      sizeHeight.value > maxPipSize.value.height
    ) {
      errors.value.sizeHeight = t('broadcastBox.pipValidationSizeRequired');
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
          size: {
            width: sizeWidth.value,
            height: sizeHeight.value,
          },
        },
        props.device
      );
    } catch (error) {
      // Error already handled in composable
      console.error('Failed to configure PiP:', error);
    }
  }
};
</script>
