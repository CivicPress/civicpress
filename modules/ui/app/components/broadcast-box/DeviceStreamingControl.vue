<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.streamingControl') }}
        </h2>
        <UBadge
          v-if="!isDeviceConnected"
          color="neutral"
          variant="soft"
          size="xs"
        >
          {{ t('broadcastBox.deviceOffline') }}
        </UBadge>
        <UBadge
          v-else-if="streamingStatus?.active"
          color="primary"
          variant="soft"
          size="xs"
        >
          {{ t('broadcastBox.streamingActive') }}
        </UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Streaming status -->
      <div
        v-if="streamingStatus?.active || streamingStatus?.error"
        class="rounded-lg p-3 text-sm"
        :class="
          streamingStatus.error
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            : 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
        "
      >
        <template v-if="streamingStatus.active">
          {{ t('broadcastBox.streamingTo') }}
          {{ platformLabel(streamingStatus.platform) }}
          <span v-if="streamingStatus.url" class="block truncate text-xs mt-1">
            {{ streamingStatus.url }}
          </span>
        </template>
        <template v-else-if="streamingStatus.error">
          {{ t('broadcastBox.streamingConnectionFailed') }}:
          {{ streamingStatus.error }}
        </template>
      </div>

      <!-- RTMP URL -->
      <UFormField
        :label="t('broadcastBox.streamingRtmpUrl')"
        :description="t('broadcastBox.streamingRtmpUrlDesc')"
      >
        <UInput
          v-model="rtmpUrl"
          type="text"
          :placeholder="'rtmp://a.rtmp.youtube.com/live2'"
          :disabled="loading || !isDeviceConnected"
        />
      </UFormField>

      <!-- Stream key -->
      <UFormField
        :label="t('broadcastBox.streamingStreamKey')"
        :description="t('broadcastBox.streamingStreamKeyDesc')"
      >
        <UInput
          v-model="streamKey"
          type="password"
          :placeholder="'xxxx-xxxx-xxxx-xxxx'"
          :disabled="loading || !isDeviceConnected"
        />
      </UFormField>

      <!-- Platform -->
      <UFormField
        :label="t('broadcastBox.streamingPlatform')"
        :description="t('broadcastBox.streamingPlatformDesc')"
      >
        <USelectMenu
          v-model="selectedPlatform"
          :items="platformOptions"
          :disabled="loading || !isDeviceConnected"
          value-attribute="value"
        />
      </UFormField>

      <!-- Save config + Start/Stop -->
      <div class="flex flex-wrap items-center gap-2 pt-2">
        <UButton
          color="primary"
          :loading="loading"
          :disabled="loading || !isDeviceConnected || !hasConfigChanges"
          icon="i-lucide-save"
          @click="handleSaveConfig"
        >
          {{ t('broadcastBox.streamingSaveConfig') }}
        </UButton>
        <UButton
          color="primary"
          variant="soft"
          :loading="loading"
          :disabled="loading || !isDeviceConnected || !!streamingStatus?.active"
          icon="i-lucide-radio"
          @click="handleStartStream"
        >
          {{ t('broadcastBox.streamingStart') }}
        </UButton>
        <UButton
          color="error"
          variant="soft"
          :loading="loading"
          :disabled="loading || !isDeviceConnected || !streamingStatus?.active"
          icon="i-lucide-square"
          @click="handleStopStream"
        >
          {{ t('broadcastBox.streamingStop') }}
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
  streamingStatus?: {
    active: boolean;
    platform?: string;
    url?: string;
    error?: string;
    retryCount?: number;
  } | null;
}>();

const { t } = useI18n();

const deviceUuid = computed(() => props.device.deviceUuid);
const deviceUuidRef = computed(() => deviceUuid.value);

const { configureStream, startStream, stopStream, loading } =
  useDeviceCommands(deviceUuidRef);

const rtmpUrl = ref('');
const streamKey = ref('');
const selectedPlatform = ref<{ label: string; value: string }>({
  label: 'Generic',
  value: 'generic',
});

const platformOptions = [
  { label: 'YouTube', value: 'youtube' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Twitch', value: 'twitch' },
  { label: 'Generic', value: 'generic' },
];

// Recall persisted RTMP url/platform when device is loaded (stream_key not stored for security)
watch(
  () => props.device?.config?.streaming,
  (streaming) => {
    if (streaming?.url) rtmpUrl.value = streaming.url;
    if (streaming?.platform) {
      const opt = platformOptions.find(
        (p) => p.value === (streaming.platform ?? 'generic')
      );
      selectedPlatform.value = opt ?? { label: 'Generic', value: 'generic' };
    }
  },
  { immediate: true }
);

function platformLabel(platform?: string): string {
  if (!platform) return '';
  const opt = platformOptions.find((p) => p.value === platform);
  return opt?.label ?? platform;
}

const hasConfigChanges = computed(() => {
  return Boolean(rtmpUrl.value?.trim() && streamKey.value?.trim());
});

// Effective streaming quality: config (from Configuration panel) or device default, per integration doc
const streamingQuality = computed(
  (): 'low' | 'standard' | 'high' | 'ultra' =>
    (props.device?.config?.qualityPreset as
      | 'low'
      | 'standard'
      | 'high'
      | 'ultra') ??
    (props.device?.capabilities?.quality?.defaults?.streaming as
      | 'low'
      | 'standard'
      | 'high'
      | 'ultra') ??
    'standard'
);

async function handleSaveConfig() {
  const url = rtmpUrl.value?.trim();
  const key = streamKey.value?.trim();
  if (!url || !key) return;
  try {
    await configureStream(
      url,
      key,
      selectedPlatform.value?.value as
        | 'youtube'
        | 'facebook'
        | 'twitch'
        | 'generic'
    );
  } catch (e) {
    console.error('Failed to configure stream:', e);
  }
}

async function handleStartStream() {
  try {
    await startStream(streamingQuality.value);
  } catch (e) {
    console.error('Failed to start stream:', e);
  }
}

async function handleStopStream() {
  try {
    await stopStream();
  } catch (e) {
    console.error('Failed to stop stream:', e);
  }
}
</script>
