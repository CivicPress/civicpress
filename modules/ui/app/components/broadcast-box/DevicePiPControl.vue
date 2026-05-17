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

      <!-- Main Source (real cameras only; exclude virtual "pip" source) -->
      <UFormField
        :label="t('broadcastBox.pipMainSource')"
        :description="t('broadcastBox.pipMainSourceDesc')"
        :error="errors.mainSource"
      >
        <USelectMenu
          v-model="selectedMainSource"
          :items="videoSources"
          :disabled="loading || !isDeviceConnected || pipSupported === false"
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
              {{ t('broadcastBox.pipConfigured') }}:
            </span>
            <UBadge
              :color="pipConfigured ? 'primary' : 'neutral'"
              variant="soft"
              size="sm"
            >
              {{ pipConfigured ? t('common.yes') : t('common.no') }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gray-600 dark:text-gray-400">
              {{ t('broadcastBox.pipInUse') }}:
            </span>
            <UBadge
              :color="pipInUse ? 'primary' : 'neutral'"
              variant="soft"
              size="sm"
            >
              {{ pipInUse ? t('common.yes') : t('common.no') }}
            </UBadge>
          </div>
          <p
            v-if="pipConfigured && !pipInUse"
            class="text-xs text-gray-500 dark:text-gray-400 mt-1"
          >
            {{ t('broadcastBox.pipSelectInSourceControl') }}
          </p>
          <div
            v-if="pipConfigured && currentPipConfig.mainSource"
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
            v-if="pipConfigured && currentPipConfig.pipSource"
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
            v-if="pipConfigured && currentPipConfig.position"
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
            v-if="pipConfigured && currentPipConfig.size != null"
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
        <UButton
          v-if="pipConfigured && !pipInUse"
          color="primary"
          variant="soft"
          size="xs"
          class="mt-3"
          :loading="loading"
          :disabled="loading || !isDeviceConnected"
          @click="handleUsePipNow"
        >
          {{ t('broadcastBox.pipUseNow') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import { useDeviceCommands } from '~/composables/useDeviceCommands';
import { useDeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';

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

// Real cameras only for main/pip source dropdowns (exclude virtual "pip" and "none" sources)
const videoSources = computed(() => {
  const exclude = (id: string, name?: string) => {
    const lower = (id || name || '').toLowerCase();
    return (
      lower === 'pip' ||
      lower === 'none' ||
      (name || '').toLowerCase().includes('disable pip')
    );
  };
  const objects = props.device.capabilities?.videoSourceObjects || [];
  if (objects.length > 0) {
    return objects
      .filter(
        (s: any) =>
          !exclude(
            s.identifier || s.name || String(s.id),
            s.name || s.identifier
          )
      )
      .map((s: any) => ({
        label: s.name || s.identifier || `Source ${s.id}`,
        value: s.identifier || s.name || String(s.id),
      }));
  }
  const ids = props.device.capabilities?.videoSources || [];
  return ids
    .filter((id: string) => !exclude(id, id))
    .map((id: string) => ({ label: id, value: id }));
});

// Current PiP configuration (from WebSocket or device)
const currentPipConfig = computed(() => {
  return connectionStatus.value.pip || props.device.pip;
});

// PiP layout is configured when user has run pip.configure (status uses "configured"; legacy "enabled" for backward compat)
const pipConfigured = computed(() => {
  const c = currentPipConfig.value;
  return c?.configured ?? (c as any)?.enabled ?? false;
});

// PiP is in use when active video source is "pip" (select "Picture-in-Picture" in Source Control)
const pipInUse = computed(() => {
  const active = connectionStatus.value.activeSources?.video;
  return (active?.identifier || active?.name) === 'pip';
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

// Form state (never init with "none" — that option was removed and causes Vue/Nuxt UI errors)
const mainSourceValue = ref<string | undefined>(
  (() => {
    const id = currentPipConfig.value?.mainSource?.identifier;
    return id?.toLowerCase() === 'none' ? undefined : id;
  })()
);
const pipSourceValue = ref<string | undefined>(
  (() => {
    const id = currentPipConfig.value?.pipSource?.identifier;
    return id?.toLowerCase() === 'none' ? undefined : id;
  })()
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
    if (!pipSourceValue.value) return undefined;
    return pipSourceOptions.value.find(
      (opt) => opt.value === pipSourceValue.value
    );
  },
  set: (value: { label: string; value: string } | undefined) => {
    pipSourceValue.value = value?.value;
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

// PiP source options (real cameras only; no "None" option)
const pipSourceOptions = computed(() =>
  videoSources.value.map((s) => ({ label: s.label, value: s.value }))
);

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

// Update form when current config changes (never set "none" — that option was removed)
watch(
  () => currentPipConfig.value,
  (newConfig) => {
    if (newConfig) {
      const mainId = newConfig.mainSource?.identifier;
      const pipId = newConfig.pipSource?.identifier;
      mainSourceValue.value =
        mainId?.toLowerCase() === 'none' ? undefined : mainId;
      pipSourceValue.value =
        pipId?.toLowerCase() === 'none' ? undefined : pipId;
      positionValue.value = newConfig.position || 'top_right';
      pipSizeValue.value = pipSizeAsNumber(
        newConfig.size as number | { width: number; height: number } | undefined
      );
    }
  },
  { deep: true }
);

// Clear selection when current value is no longer in options (e.g. "none" was filtered out)
// Prevents Vue/Nuxt UI from accessing .type on a null instance during update
watch(
  [pipSourceOptions, () => pipSourceValue.value],
  () => {
    if (
      pipSourceOptions.value.length > 0 &&
      pipSourceValue.value &&
      !pipSourceOptions.value.some((opt) => opt.value === pipSourceValue.value)
    ) {
      nextTick(() => {
        pipSourceValue.value = undefined;
      });
    }
  },
  { deep: true, immediate: true }
);
watch(
  [videoSources, () => mainSourceValue.value],
  () => {
    if (
      videoSources.value.length > 0 &&
      mainSourceValue.value &&
      !videoSources.value.some((s) => s.value === mainSourceValue.value)
    ) {
      nextTick(() => {
        mainSourceValue.value = undefined;
      });
    }
  },
  { deep: true, immediate: true }
);

// Check if there are changes to apply (layout: main, pip source, position, size)
const hasChanges = computed(() => {
  const currentPipSource = currentPipConfig.value?.pipSource?.identifier;
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

// Switch active video source to "pip" (use PiP layout now)
async function handleUsePipNow() {
  try {
    const currentAudio =
      connectionStatus.value.activeSources?.audio?.identifier ??
      props.device.activeSources?.audio?.identifier ??
      props.device.config?.defaultAudioSource;
    if (currentAudio) {
      await setSources('pip', currentAudio);
    } else {
      await setSources('pip');
    }
  } catch (e) {
    console.error('Failed to switch to PiP:', e);
  }
}

// Validate form
const validate = (): boolean => {
  errors.value = {};

  if (pipSupported.value === false) {
    errors.value.mainSource = t('broadcastBox.notSupported');
    return false;
  }

  if (!mainSourceValue.value) {
    errors.value.mainSource = t('broadcastBox.pipValidationMainSourceRequired');
    return false;
  }

  if (!pipSourceValue.value) {
    errors.value.pipSource = t('broadcastBox.pipValidationPipSourceRequired');
    return false;
  }

  if (pipSourceValue.value === mainSourceValue.value) {
    errors.value.pipSource = t('broadcastBox.pipValidationPipSourceDifferent');
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

  return true;
};

// Apply PiP configuration (pip.configure: main source, pip source, position, size)
const handleApply = async () => {
  if (!validate()) {
    return;
  }

  if (!mainSourceValue.value) {
    errors.value.mainSource = t('broadcastBox.pipValidationMainSourceRequired');
    return;
  }

  if (!pipSourceValue.value) {
    errors.value.pipSource = t('broadcastBox.pipValidationPipSourceRequired');
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
  } catch (error) {
    console.error('Failed to configure PiP:', error);
  }
};
</script>
