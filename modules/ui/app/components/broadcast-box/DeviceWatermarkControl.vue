<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.watermarkControl') }}
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
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ t('broadcastBox.watermarkControlDesc') }}
      </p>

      <!-- Enabled toggle -->
      <UFormField
        :label="t('broadcastBox.watermarkEnabled')"
        :description="t('broadcastBox.watermarkEnabledDesc')"
      >
        <USwitch
          v-model="enabled"
          :disabled="loading || !isDeviceConnected"
          @update:model-value="handleSetEnabled"
        />
      </UFormField>

      <!-- Position -->
      <UFormField
        :label="t('broadcastBox.watermarkPosition')"
        :description="t('broadcastBox.watermarkPositionDesc')"
      >
        <USelectMenu
          v-model="selectedPosition"
          :items="positionOptions"
          value-attribute="value"
          :disabled="loading || !isDeviceConnected"
          @update:model-value="handleSetPosition"
        />
      </UFormField>

      <!-- Scale (5%–30%) -->
      <UFormField
        :label="t('broadcastBox.watermarkScale')"
        :description="t('broadcastBox.watermarkScaleDesc')"
      >
        <div class="flex items-center gap-3">
          <input
            v-model.number="scalePercent"
            type="range"
            min="5"
            max="30"
            step="1"
            class="flex-1 h-2 rounded-lg appearance-none bg-gray-200 dark:bg-gray-700 accent-primary-500"
            :disabled="loading || !isDeviceConnected"
            @change="handleSetScale"
          />
          <span class="text-sm font-medium w-10">{{ scalePercent }}%</span>
        </div>
      </UFormField>

      <!-- Opacity (0–100%) -->
      <UFormField
        :label="t('broadcastBox.watermarkOpacity')"
        :description="t('broadcastBox.watermarkOpacityDesc')"
      >
        <div class="flex items-center gap-3">
          <input
            v-model.number="opacityPercent"
            type="range"
            min="0"
            max="100"
            step="1"
            class="flex-1 h-2 rounded-lg appearance-none bg-gray-200 dark:bg-gray-700 accent-primary-500"
            :disabled="loading || !isDeviceConnected"
            @change="handleSetOpacity"
          />
          <span class="text-sm font-medium w-10">{{ opacityPercent }}%</span>
        </div>
      </UFormField>

      <!-- Upload PNG -->
      <UFormField
        :label="t('broadcastBox.watermarkUpload')"
        :description="t('broadcastBox.watermarkUploadDesc')"
      >
        <UButton
          color="primary"
          variant="soft"
          :loading="uploading"
          :disabled="loading || !isDeviceConnected"
          icon="i-lucide-upload"
          @click="triggerFileInput"
        >
          {{ t('broadcastBox.watermarkUploadButton') }}
        </UButton>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/png"
          class="hidden"
          @change="handleFileSelect"
        />
      </UFormField>

      <!-- Remove -->
      <div class="pt-2 border-t dark:border-gray-700">
        <UButton
          color="error"
          variant="soft"
          :loading="loading"
          :disabled="loading || !isDeviceConnected || !status?.configured"
          icon="i-lucide-trash-2"
          @click="handleRemove"
        >
          {{ t('broadcastBox.watermarkRemove') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import {
  useDeviceCommands,
  type WatermarkStatus,
} from '~/composables/useDeviceCommands';
import { computed, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  device: BroadcastDevice;
  isDeviceConnected: boolean;
}>();

const { t } = useI18n();
const deviceUuidRef = computed(() => props.device.deviceUuid);

const {
  uploadWatermark,
  setWatermark,
  removeWatermark,
  getWatermarkStatus,
  loading,
} = useDeviceCommands(deviceUuidRef);

const status = ref<WatermarkStatus | null>(null);
const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

type PositionOption = { label: string; value: string };

const positionOptions = computed<PositionOption[]>(() => [
  { label: t('broadcastBox.pipPositionTopLeft'), value: 'top_left' },
  { label: t('broadcastBox.pipPositionTopRight'), value: 'top_right' },
  { label: t('broadcastBox.pipPositionBottomLeft'), value: 'bottom_left' },
  { label: t('broadcastBox.pipPositionBottomRight'), value: 'bottom_right' },
]);

const defaultPosition = (): PositionOption => ({
  label: t('broadcastBox.pipPositionBottomRight'),
  value: 'bottom_right',
});

const enabled = ref(true);
const selectedPosition = ref<PositionOption | undefined>(undefined);
const scalePercent = ref(15);
const opacityPercent = ref(100);

function scaleToPercent(scale: number | undefined): number {
  if (scale == null) return 15;
  return Math.round(scale * 100);
}
function percentToScale(p: number): number {
  return Math.round(p) / 100;
}
function opacityToPercent(opacity: number | undefined): number {
  if (opacity == null) return 100;
  return Math.round(opacity * 100);
}
function percentToOpacity(p: number): number {
  return Math.round(p) / 100;
}

function applyStatus(s: WatermarkStatus | null) {
  if (!s) return;
  if (s.enabled !== undefined) enabled.value = s.enabled;
  if (s.position) {
    const opt = positionOptions.value.find((o) => o.value === s.position);
    if (opt) selectedPosition.value = opt;
  }
  if (s.scale !== undefined) scalePercent.value = scaleToPercent(s.scale);
  if (s.opacity !== undefined)
    opacityPercent.value = opacityToPercent(s.opacity);
}

async function fetchStatus() {
  const s = await getWatermarkStatus();
  status.value = s ?? null;
  applyStatus(s ?? null);
  if (
    !s &&
    selectedPosition.value === undefined &&
    positionOptions.value.length
  ) {
    selectedPosition.value = positionOptions.value[3] ?? defaultPosition();
  }
}

async function handleSetEnabled() {
  try {
    await setWatermark({ enabled: enabled.value });
    await fetchStatus();
  } catch (e) {
    console.error('Failed to set watermark enabled', e);
  }
}

async function handleSetPosition() {
  const pos = selectedPosition.value?.value;
  if (!pos) return;
  try {
    await setWatermark({ position: pos });
    await fetchStatus();
  } catch (e) {
    console.error('Failed to set watermark position', e);
  }
}

async function handleSetScale() {
  try {
    await setWatermark({ scale: percentToScale(scalePercent.value) });
    await fetchStatus();
  } catch (e) {
    console.error('Failed to set watermark scale', e);
  }
}

async function handleSetOpacity() {
  try {
    await setWatermark({ opacity: percentToOpacity(opacityPercent.value) });
    await fetchStatus();
  } catch (e) {
    console.error('Failed to set watermark opacity', e);
  }
}

function triggerFileInput() {
  fileInputRef.value?.click();
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || file.type !== 'image/png') {
    return;
  }
  uploading.value = true;
  try {
    const base64 = await readFileAsBase64(file);
    await uploadWatermark(base64);
    await fetchStatus();
  } catch (e) {
    console.error('Failed to upload watermark', e);
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleRemove() {
  try {
    await removeWatermark();
    status.value = null;
    enabled.value = false;
    selectedPosition.value = positionOptions.value[3] ?? defaultPosition();
    scalePercent.value = 15;
    opacityPercent.value = 100;
  } catch (e) {
    console.error('Failed to remove watermark', e);
  }
}

onMounted(() => {
  if (props.isDeviceConnected) fetchStatus();
});

watch(
  () => props.isDeviceConnected,
  (connected) => {
    if (connected) fetchStatus();
  }
);
</script>
