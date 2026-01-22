<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ t('broadcastBox.preview.title') }}
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
          v-else-if="connectionState === 'connected'"
          color="primary"
          variant="soft"
          size="xs"
        >
          {{ t('broadcastBox.preview.status.connected') }}
        </UBadge>
        <UBadge
          v-else-if="connectionState === 'connecting'"
          color="primary"
          variant="soft"
          size="xs"
        >
          {{ t('broadcastBox.preview.status.connecting') }}
        </UBadge>
        <UBadge
          v-else-if="connectionState === 'failed'"
          color="error"
          variant="soft"
          size="xs"
        >
          {{ t('broadcastBox.preview.status.failed') }}
        </UBadge>
        <UBadge v-else color="neutral" variant="soft" size="xs">
          {{ t('broadcastBox.preview.status.disconnected') }}
        </UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Video Preview -->
      <div
        class="relative w-full bg-black rounded-lg overflow-hidden"
        :class="{
          'aspect-video': true,
          'min-h-[240px]': true,
        }"
      >
        <video
          v-if="previewStream"
          ref="videoElement"
          :srcObject="previewStream"
          autoplay
          playsinline
          :muted="!audioEnabled"
          class="w-full h-full object-contain"
        />
        <div
          v-else
          class="flex items-center justify-center h-full text-gray-400"
        >
          <div class="text-center">
            <UIcon name="i-lucide-video" class="w-12 h-12 mx-auto mb-2" />
            <p class="text-sm">
              {{ t('broadcastBox.preview.noStream') }}
            </p>
          </div>
        </div>

        <!-- Loading Overlay -->
        <div
          v-if="connectionState === 'connecting'"
          class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
        >
          <div class="text-center text-white">
            <UIcon
              name="i-lucide-loader-2"
              class="w-8 h-8 mx-auto mb-2 animate-spin"
            />
            <p class="text-sm">
              {{ t('broadcastBox.preview.connecting') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="t('broadcastBox.preview.error.connectionFailed')"
        :description="error"
        icon="i-lucide-alert-circle"
      />

      <!-- Controls -->
      <div class="flex items-center justify-between gap-2">
        <UButton
          v-if="!isPreviewActive"
          color="primary"
          :loading="connectionState === 'connecting'"
          :disabled="!isDeviceConnected || connectionState === 'connecting'"
          icon="i-lucide-play"
          @click="handleStart"
        >
          {{ t('broadcastBox.preview.start') }}
        </UButton>
        <UButton
          v-else
          color="error"
          variant="soft"
          :disabled="connectionState === 'connecting'"
          icon="i-lucide-square"
          @click="handleStop"
        >
          {{ t('broadcastBox.preview.stop') }}
        </UButton>

        <UButton
          v-if="connectionState === 'failed'"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          @click="handleRetry"
        >
          {{ t('broadcastBox.preview.retry') }}
        </UButton>

        <UButton
          v-if="previewStream"
          color="neutral"
          variant="soft"
          icon="i-lucide-volume-2"
          @click="toggleAudio"
        >
          {{
            audioEnabled
              ? t('broadcastBox.preview.audio.disable')
              : t('broadcastBox.preview.audio.enable')
          }}
        </UButton>
      </div>

      <UAlert
        v-if="previewStream && !hasAudioTrack"
        color="neutral"
        variant="soft"
        :title="t('broadcastBox.preview.audio.noTrack')"
        icon="i-lucide-volume-x"
      />

      <UAlert
        v-if="audioError"
        color="error"
        variant="soft"
        :title="t('broadcastBox.preview.audio.enableFailed')"
        :description="audioError"
        icon="i-lucide-alert-circle"
      />

      <!-- WebRTC Not Supported -->
      <UAlert
        v-if="!isWebRTCSupported"
        color="error"
        variant="soft"
        :title="t('broadcastBox.preview.webrtcNotSupported')"
        :description="t('broadcastBox.preview.webrtcNotSupportedDesc')"
        icon="i-lucide-alert-triangle"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  type Ref,
  type ComputedRef,
} from 'vue';
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import type { DeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';
import { useDevicePreview } from '~/composables/useDevicePreview';

const props = defineProps<{
  device: BroadcastDevice;
  isDeviceConnected: boolean;
  connectionStatus?: DeviceConnectionStatus; // Passed from parent to share single connection
  wsConnection?:
    | WebSocket
    | null
    | Ref<WebSocket | null>
    | ComputedRef<WebSocket | null>; // Passed from parent to share single connection
}>();

const { t } = useI18n();

// Check WebRTC support
const isWebRTCSupported = computed(() => {
  return typeof RTCPeerConnection !== 'undefined';
});

// Use preview composable with shared connection
const deviceId = computed(() => props.device.deviceUuid);
// Convert wsConnection prop to a ref/computed if it's not already
const wsConnectionRef = computed(() => {
  if (!props.wsConnection) return null;
  if (props.wsConnection instanceof WebSocket) return props.wsConnection;
  if ('value' in props.wsConnection) return props.wsConnection.value;
  return props.wsConnection as WebSocket | null;
});

// Create connection status ref if provided - ensure it returns DeviceConnectionStatus, not undefined
const connectionStatusRef = props.connectionStatus
  ? computed(() => props.connectionStatus as DeviceConnectionStatus)
  : undefined;

const {
  isPreviewActive,
  connectionState,
  error,
  previewStream,
  startPreview,
  stopPreview,
  retryConnection,
  cleanup,
} = useDevicePreview(deviceId, wsConnectionRef, connectionStatusRef);

// Video element ref
const videoElement = ref<HTMLVideoElement | null>(null);

const audioEnabled = ref(false);
const audioError = ref<string | null>(null);

const hasAudioTrack = computed(() => {
  const stream = previewStream.value;
  if (!stream) return false;
  const tracks = stream.getAudioTracks();
  return tracks.some((t) => t.readyState === 'live');
});

// Watch for stream changes and attach to video element
watch(previewStream, (stream) => {
  if (videoElement.value && stream) {
    videoElement.value.srcObject = stream;
    // If audio is enabled, browsers may pause on srcObject changes.
    // Try to resume playback; if blocked, fall back to muted.
    if (audioEnabled.value) {
      videoElement.value.muted = false;
      videoElement.value.play().catch((err) => {
        audioEnabled.value = false;
        videoElement.value!.muted = true;
        audioError.value =
          err instanceof Error ? err.message : 'Browser blocked audio playback';
      });
    }
  } else if (videoElement.value && !stream) {
    videoElement.value.srcObject = null;
    audioEnabled.value = false;
    audioError.value = null;
  }
});

watch(audioEnabled, async (enabled) => {
  if (!videoElement.value) return;
  audioError.value = null;

  // Always keep muted state aligned with toggle (autoplay-safe default is muted)
  videoElement.value.muted = !enabled;

  if (enabled) {
    try {
      // Browsers often require a user gesture to start audio playback.
      // This function is called from a click handler, so it should be allowed.
      await videoElement.value.play();
    } catch (err) {
      audioEnabled.value = false;
      videoElement.value.muted = true;
      audioError.value =
        err instanceof Error ? err.message : 'Browser blocked audio playback';
    }
  }
});

async function toggleAudio() {
  // Must be user-gesture driven to satisfy autoplay policy.
  audioEnabled.value = !audioEnabled.value;
}

// Handle start
async function handleStart() {
  await startPreview();
}

// Handle stop
async function handleStop() {
  await stopPreview();
}

// Handle retry
function handleRetry() {
  retryConnection();
}

// Cleanup on unmount
onUnmounted(() => {
  cleanup();
});
</script>
