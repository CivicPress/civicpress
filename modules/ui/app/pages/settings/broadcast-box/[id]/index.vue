<script setup lang="ts">
import type {
  BroadcastDevice,
  BroadcastSession,
} from '~/composables/useBroadcastBox';
import { useBroadcastBox } from '~/composables/useBroadcastBox';
import DeviceStatusBadge from '~/components/broadcast-box/DeviceStatusBadge.vue';
import ConnectionStatusIndicator from '~/components/broadcast-box/ConnectionStatusIndicator.vue';
import SessionStatusBadge from '~/components/broadcast-box/SessionStatusBadge.vue';
import DeviceConfigurationForm from '~/components/broadcast-box/DeviceConfigurationForm.vue';
import DeviceSourceControl from '~/components/broadcast-box/DeviceSourceControl.vue';
import DevicePiPControl from '~/components/broadcast-box/DevicePiPControl.vue';
import DeviceConfigControl from '~/components/broadcast-box/DeviceConfigControl.vue';
import DeviceStreamingControl from '~/components/broadcast-box/DeviceStreamingControl.vue';
import DeviceWatermarkControl from '~/components/broadcast-box/DeviceWatermarkControl.vue';
import DeviceStatusControl from '~/components/broadcast-box/DeviceStatusControl.vue';
import DevicePreview from '~/components/broadcast-box/DevicePreview.vue';
import DeviceManualRecording from '~/components/broadcast-box/DeviceManualRecording.vue';
import { useRecordUtils } from '~/composables/useRecordUtils';
import { useDeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';

const { formatDate } = useRecordUtils();

// Helper function to format PiP position
const formatPipPosition = (position: string | undefined): string => {
  if (!position) return '';
  const key = `broadcastBox.pipPosition${position
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')}`;
  const translated = t(key);
  return translated !== key ? translated : position;
};

// Helper to format PiP size (number = "25%", legacy { width, height } = "320×240")
const formatPipSizeDisplay = (
  size: number | { width: number; height: number } | undefined
): string => {
  if (size == null) return '';
  if (typeof size === 'number') return `${Math.round(size * 100)}%`;
  return `${size.width}×${size.height}`;
};

definePageMeta({
  middleware: ['require-auth'],
});

const route = useRoute();
const { t } = useI18n();
const {
  getDevice,
  getDeviceHealth,
  listSessions,
  deleteSession,
  revokeDevice,
  regenerateEnrollmentCode,
} = useBroadcastBox();
const authStore = useAuthStore();
const toast = useToast();

const deviceId = route.params.id as string;
const device = ref<BroadcastDevice | null>(null);
const manualRecordingRef = ref<InstanceType<
  typeof DeviceManualRecording
> | null>(null);
const health = ref<any>(null);
const sessions = ref<BroadcastSession[]>([]);
const loading = ref(false);
const error = ref('');
const showConfigForm = ref(false);
const enrollmentCode = ref<{ code: string; expiresAt: string } | null>(null);
const enrollmentCodeStatus = ref<{
  exists: boolean;
  isExpired: boolean;
  isUsed: boolean;
  expiresAt: string | null;
  createdAt: string | null;
  usedAt: string | null;
} | null>(null);
const regenerating = ref(false);
const removingSessionId = ref<string | null>(null);
const uuidCopied = ref(false);
const codeCopied = ref(false);
const deviceIdCopied = ref(false);

const canManageDevices = computed(() => {
  return authStore.hasPermission('broadcast-box:admin');
});

// Use real-time connection status composable - single instance per page
const deviceUuidRef = computed(() => device.value?.deviceUuid || null);
const {
  status: connectionStatus,
  isConnected,
  subscribe,
  unsubscribe,
  wsConnection,
} = useDeviceConnectionStatus(null); // Don't auto-subscribe, we'll do it manually

// Define isDeviceConnected before it's used in watches
// Use a stable computed that only changes when the actual boolean value changes
// Memoize the result to prevent unnecessary re-evaluations
let lastConnectedValue: boolean | null = null;
const isDeviceConnected = computed(() => {
  // Use real-time connection status if available, otherwise fall back to lastSeenAt
  const wsConnected = connectionStatus.value.connected;
  let result: boolean;

  if (wsConnected !== undefined) {
    result = wsConnected;
  } else {
    // Fallback to lastSeenAt check
    if (!device.value || device.value.status !== 'active') {
      result = false;
    } else if (!device.value.lastSeenAt) {
      result = false;
    } else {
      const lastSeen = new Date(device.value.lastSeenAt);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastSeen.getTime()) / 1000 / 60;
      result = diffMinutes < 5;
    }
  }

  // Only update lastConnectedValue if it actually changed
  if (lastConnectedValue !== result) {
    lastConnectedValue = result;
  }

  return result;
});

// Subscribe when device is loaded (only once per UUID change)
let lastSubscribedUuid: string | null = null;
let isComponentMounted = false; // Track if component is mounted
let subscriptionTime: number | null = null; // Track when we last subscribed
const MIN_SUBSCRIPTION_TIME = 1000; // Minimum time before allowing unsubscribe (1 second)

// Watch for device UUID changes and subscribe when component is mounted
watch(
  () => device.value?.deviceUuid,
  (deviceUuid) => {
    // Only subscribe if UUID actually changed (not just device object reassigned)
    // and component is mounted
    if (deviceUuid && deviceUuid !== lastSubscribedUuid && isComponentMounted) {
      // Unsubscribe from previous device if any
      if (lastSubscribedUuid && lastSubscribedUuid !== deviceUuid) {
        unsubscribe(lastSubscribedUuid);
      }

      lastSubscribedUuid = deviceUuid;
      subscriptionTime = Date.now();
      console.log(
        `[DeviceDetail] Subscribing to device connection status: ${deviceUuid}`
      );
      subscribe(deviceUuid).catch((error) => {
        console.warn('Failed to subscribe to device connection status:', error);
      });
    }
  }
);

// Track if we've refreshed device data after receiving capabilities (per device)
let hasRefreshedAfterCapabilities = false;
let lastRefreshedDeviceUuid: string | null | undefined = null;

// Reset refresh flag when device changes
watch(
  () => device.value?.deviceUuid,
  (deviceUuid) => {
    if (deviceUuid !== lastRefreshedDeviceUuid) {
      hasRefreshedAfterCapabilities = false;
      lastRefreshedDeviceUuid = deviceUuid || null;
    }
  }
);

// Update device capabilities from connectionStatus when they're received
watch(
  () => connectionStatus.value,
  (status) => {
    if (!isComponentMounted || !device.value || !status?.capabilities) {
      return;
    }
    // Merge capabilities from status into device object
    if (!device.value.capabilities) {
      // Initialize with default structure matching BroadcastDevice type
      device.value.capabilities = {
        videoSources: [],
        audioSources: [],
        pipSupported: false,
        maxResolution: '',
      };
    }

    // Check if capabilities actually changed
    const capabilitiesChanged =
      JSON.stringify(status.capabilities) !==
      JSON.stringify(device.value.capabilities);

    // Update video sources if available
    if (
      status.capabilities.videoSources &&
      status.capabilities.videoSources.length > 0
    ) {
      device.value.capabilities.videoSources = status.capabilities.videoSources;
    }
    if (status.capabilities.videoSourceObjects) {
      device.value.capabilities.videoSourceObjects =
        status.capabilities.videoSourceObjects;
    }

    // Update audio sources if available
    if (
      status.capabilities.audioSources &&
      status.capabilities.audioSources.length > 0
    ) {
      device.value.capabilities.audioSources = status.capabilities.audioSources;
    }
    if (status.capabilities.audioSourceObjects) {
      device.value.capabilities.audioSourceObjects =
        status.capabilities.audioSourceObjects;
    }

    // Update other capability fields
    if (status.capabilities.pipSupported !== undefined) {
      device.value.capabilities.pipSupported = status.capabilities.pipSupported;
    }
    if (status.capabilities.maxResolution) {
      device.value.capabilities.maxResolution =
        status.capabilities.maxResolution;
    }

    // Update structured capability objects (from device.connected event)
    if (status.capabilities.pipCapabilities) {
      device.value.capabilities.pipCapabilities =
        status.capabilities.pipCapabilities;
    }
    if (status.capabilities.audioMixingCapabilities) {
      device.value.capabilities.audioMixingCapabilities =
        status.capabilities.audioMixingCapabilities;
    }
    if (status.capabilities.hardwareEncodingCapabilities) {
      device.value.capabilities.hardwareEncodingCapabilities =
        status.capabilities.hardwareEncodingCapabilities;
    }
    // Quality presets from device.connected (low, standard, high, ultra per integration doc)
    if (status.capabilities.quality) {
      device.value.capabilities.quality = status.capabilities.quality;
    }
    // Note: hardwareEncoding boolean is also available in DeviceConnectionStatus.capabilities
    // but is not part of BroadcastDevice.capabilities type - it's only in connectionStatus

    // If capabilities changed and we haven't refreshed yet, refresh device data from API
    // This ensures the UI shows the latest data from the database (which was updated by the backend)
    // We only do this once to avoid unnecessary API calls
    if (capabilitiesChanged && !hasRefreshedAfterCapabilities) {
      hasRefreshedAfterCapabilities = true;
      // Debounce the refresh slightly to avoid race conditions
      setTimeout(() => {
        if (!isComponentMounted) return;
        loadDevice(true).catch((error) => {
          console.warn(
            'Failed to refresh device data after capabilities update:',
            error
          );
        });
      }, 500);
    }
  },
  { deep: true }
);

// Don't auto-refresh device data - rely on WebSocket updates for real-time data
// Only refresh:
// 1. On initial mount
// 2. When user explicitly refreshes (via DeviceStatusControl)
// 3. After config changes
// 4. Periodically for sessions (every 5 minutes, very infrequent)
let sessionsRefreshInterval: NodeJS.Timeout | null = null;

// Set up a very infrequent refresh for sessions only (every 5 minutes)
// Health and capabilities come from WebSocket, so we don't need to refresh those
watch(
  () => device.value?.deviceUuid,
  (deviceUuid) => {
    // Clear existing interval
    if (sessionsRefreshInterval) {
      clearInterval(sessionsRefreshInterval);
      sessionsRefreshInterval = null;
    }

    // Only set up interval if device is loaded
    if (deviceUuid) {
      // Refresh sessions every 5 minutes (very infrequent, only for sessions)
      sessionsRefreshInterval = setInterval(() => {
        if (!isComponentMounted || !device.value) return;
        listSessions({ deviceId })
          .then((sessionsData) => {
            if (!isComponentMounted) return;
            sessions.value = sessionsData;
          })
          .catch(() => {
            // Silently fail - sessions are not critical
          });
      }, 300000); // 5 minutes
    }
  },
  { immediate: true }
);

// Cleanup is now handled in the onUnmounted hook below

// Use real-time health data from WebSocket, fallback to API data
const realtimeHealth = computed(() => {
  if (connectionStatus.value.health) {
    // Use WebSocket health data (real-time)
    return {
      score: connectionStatus.value.health.score,
      status: connectionStatus.value.health.status || 'healthy',
      metrics: {
        cpuPercent: connectionStatus.value.health.metrics.cpuPercent,
        memoryPercent: connectionStatus.value.health.metrics.memoryPercent,
        diskPercent: connectionStatus.value.health.metrics.diskPercent,
      },
    };
  }
  // Fallback to API health data
  return health.value;
});

// Debounce loadDevice to prevent multiple rapid calls from WebSocket updates
let loadDeviceTimeout: NodeJS.Timeout | null = null;
let isLoadDeviceInProgress = false;
const LOAD_DEVICE_DEBOUNCE_MS = 2000; // Don't reload more than once every 2 seconds

const loadDevice = async (force = false) => {
  // If already loading, skip unless forced
  if (isLoadDeviceInProgress && !force) {
    return;
  }

  // Clear any pending debounced call
  if (loadDeviceTimeout) {
    clearTimeout(loadDeviceTimeout);
    loadDeviceTimeout = null;
  }

  // Debounce: if not forced, wait a bit before loading
  if (!force) {
    loadDeviceTimeout = setTimeout(() => {
      loadDeviceTimeout = null;
      if (!isComponentMounted) return;
      loadDevice(true);
    }, LOAD_DEVICE_DEBOUNCE_MS);
    return;
  }

  // Preserve scroll position before loading (only on client side)
  const scrollPosition = process.client
    ? window.scrollY || document.documentElement.scrollTop
    : 0;

  isLoadDeviceInProgress = true;
  loading.value = true;
  error.value = '';

  try {
    const [deviceResponse, healthData, sessionsData] = await Promise.all([
      getDevice(deviceId),
      getDeviceHealth(deviceId),
      listSessions({ deviceId }).catch(() => []), // Don't fail if sessions fail
    ]);

    if (!isComponentMounted) return;

    if (deviceResponse) {
      // Map pipConfig to pip for consistency with connectionStatus
      const deviceData = { ...deviceResponse.device };
      if (deviceData.pipConfig && !deviceData.pip) {
        deviceData.pip = deviceData.pipConfig;
      }

      // Only update if device doesn't exist or if properties actually changed
      // This prevents unnecessary reactivity triggers and scroll resets
      if (!device.value) {
        device.value = deviceData;
      } else {
        // Deep compare and only update changed properties to minimize reactivity
        const newDevice = deviceData;
        const currentDevice = device.value;

        // Check if any significant properties changed
        const hasChanges =
          currentDevice.name !== newDevice.name ||
          currentDevice.status !== newDevice.status ||
          currentDevice.lastSeenAt !== newDevice.lastSeenAt ||
          JSON.stringify(currentDevice.capabilities) !==
            JSON.stringify(newDevice.capabilities) ||
          JSON.stringify(currentDevice.config) !==
            JSON.stringify(newDevice.config) ||
          JSON.stringify(currentDevice.activeSources) !==
            JSON.stringify(newDevice.activeSources) ||
          JSON.stringify(currentDevice.pip || currentDevice.pipConfig) !==
            JSON.stringify(newDevice.pip || newDevice.pipConfig);

        // Only update if there are actual changes
        if (hasChanges) {
          // Use Object.assign but wrap in nextTick to batch reactivity updates
          await nextTick();
          Object.assign(device.value, newDevice);
        }
      }
      enrollmentCodeStatus.value = deviceResponse.enrollmentCode || null;
    } else {
      // Device not found - set error and redirect after delay
      error.value =
        t('broadcastBox.errors.deviceNotFound') || 'Device not found';
      setTimeout(() => {
        navigateTo('/settings/broadcast-box');
      }, 3000); // Redirect after 3 seconds
      return;
    }
    health.value = healthData;
    sessions.value = sessionsData;

    // Restore scroll position after update (use nextTick to ensure DOM is updated)
    if (process.client && scrollPosition > 0 && isComponentMounted) {
      await nextTick();
      if (!isComponentMounted) return;
      requestAnimationFrame(() => {
        if (!isComponentMounted) return;
        window.scrollTo({ top: scrollPosition, behavior: 'instant' });
      });
    }
  } catch (err: any) {
    // Check if it's a 404 (device not found)
    const isNotFound =
      err.status === 404 ||
      err.message?.includes('not found') ||
      err.message?.includes('Device not found');

    if (isNotFound) {
      error.value =
        t('broadcastBox.errors.deviceNotFound') || 'Device not found';
      // Redirect to device list after showing error
      setTimeout(() => {
        navigateTo('/settings/broadcast-box');
      }, 3000);
    } else {
      error.value = err.message || t('broadcastBox.errors.loadFailed');
    }
  } finally {
    isLoadDeviceInProgress = false;
    loading.value = false;
  }
};

const handleRevoke = async () => {
  if (!device.value) return;

  if (!confirm(t('broadcastBox.confirmRevoke'))) {
    return;
  }

  try {
    await revokeDevice(device.value.id);
    navigateTo('/settings/broadcast-box');
  } catch (err: any) {
    error.value = err.message || t('broadcastBox.errors.revokeFailed');
  }
};

const handleConfigSuccess = () => {
  showConfigForm.value = false;
  // Force reload after config change (bypass debounce)
  loadDevice(true);
};

const handleRemoveSession = async (sessionId: string) => {
  removingSessionId.value = sessionId;
  try {
    await deleteSession(sessionId);
    sessions.value = await listSessions({ deviceId }).catch(() => []);
  } catch {
    // Toast already shown by deleteSession
  } finally {
    removingSessionId.value = null;
  }
};

/** Optimistically update device.config when DeviceConfigControl applies config. Device ACK only sends updated_keys, not the new values. */
const onConfigUpdated = (appliedConfig?: {
  qualityPreset?: string;
  autoStart?: boolean;
  defaultVideoSource?: string;
  defaultAudioSource?: string;
}) => {
  if (appliedConfig && device.value) {
    if (!device.value.config) {
      device.value.config = {};
    }
    if (appliedConfig.qualityPreset !== undefined) {
      device.value.config.qualityPreset = appliedConfig.qualityPreset as
        | 'low'
        | 'standard'
        | 'high'
        | 'ultra';
    }
    if (appliedConfig.autoStart !== undefined) {
      device.value.config.autoStart = appliedConfig.autoStart;
    }
    if (appliedConfig.defaultVideoSource !== undefined) {
      device.value.config.defaultVideoSource = appliedConfig.defaultVideoSource;
    }
    if (appliedConfig.defaultAudioSource !== undefined) {
      device.value.config.defaultAudioSource = appliedConfig.defaultAudioSource;
    }
  }
};

const handleRegenerateEnrollmentCode = async () => {
  if (!device.value) return;

  regenerating.value = true;
  try {
    const result = await regenerateEnrollmentCode(device.value.id);
    enrollmentCode.value = {
      code: result.enrollmentCode,
      expiresAt: result.expiresAt,
    };
    // Update status after regenerating
    enrollmentCodeStatus.value = {
      exists: true,
      isExpired: false,
      isUsed: false,
      expiresAt: result.expiresAt,
      createdAt: new Date().toISOString(),
      usedAt: null,
    };
  } catch (err: any) {
    console.error('Regenerate enrollment code error:', err);
    // Check if error is about method not existing (server-side issue)
    if (
      err.message?.includes('regenerateEnrollmentCode is not a function') ||
      err.message?.includes('not available')
    ) {
      error.value =
        t('broadcastBox.errors.serverRestartRequired') ||
        'Server needs to be restarted to enable this feature.';
    } else {
      error.value =
        err.message || t('broadcastBox.errors.regenerateEnrollmentFailed');
    }
  } finally {
    regenerating.value = false;
  }
};

const copyToClipboard = async (
  text: string,
  type: 'uuid' | 'code' | 'deviceId'
) => {
  try {
    await navigator.clipboard.writeText(text);
    if (type === 'uuid') {
      uuidCopied.value = true;
      setTimeout(() => {
        uuidCopied.value = false;
      }, 2000);
    } else if (type === 'code') {
      codeCopied.value = true;
      setTimeout(() => {
        codeCopied.value = false;
      }, 2000);
    } else if (type === 'deviceId') {
      deviceIdCopied.value = true;
      setTimeout(() => {
        deviceIdCopied.value = false;
      }, 2000);
    }
    toast.add({
      title: t('broadcastBox.copiedToClipboard'),
      color: 'primary',
    });
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    toast.add({
      title: t('broadcastBox.copyFailed'),
      color: 'error',
    });
  }
};

const getExpirationStatus = (expiresAt: string) => {
  const expires = new Date(expiresAt);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 1000 / 60);

  if (diffMinutes < 0) {
    return { status: 'expired', text: t('broadcastBox.enrollmentCodeExpired') };
  } else if (diffMinutes < 5) {
    return {
      status: 'warning',
      text: t('broadcastBox.enrollmentCodeExpiresSoon', {
        minutes: diffMinutes,
      }),
    };
  } else {
    return {
      status: 'active',
      text: t('broadcastBox.enrollmentCodeExpiresIn', { minutes: diffMinutes }),
    };
  }
};

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('settings.title'),
    to: '/settings',
  },
  {
    label: t('broadcastBox.deviceManagement'),
    to: '/settings/broadcast-box',
  },
  {
    label: device.value?.name || deviceId,
  },
]);

onMounted(() => {
  isComponentMounted = true; // Mark component as mounted

  if (canManageDevices.value) {
    // Force load on mount (bypass debounce)
    loadDevice(true);
  }

  // Subscribe to device connection status if device is already loaded
  if (
    device.value?.deviceUuid &&
    device.value.deviceUuid !== lastSubscribedUuid
  ) {
    lastSubscribedUuid = device.value.deviceUuid;
    subscriptionTime = Date.now();
    console.log(
      `[DeviceDetail] Subscribing to device connection status on mount: ${device.value.deviceUuid}`
    );
    subscribe(device.value.deviceUuid).catch((error) => {
      console.warn(
        'Failed to subscribe to device connection status on mount:',
        error
      );
    });
  }
});

// Cleanup debounce timeout on unmount
onUnmounted(() => {
  isComponentMounted = false; // Mark component as unmounted to prevent new subscriptions

  if (loadDeviceTimeout) {
    clearTimeout(loadDeviceTimeout);
    loadDeviceTimeout = null;
  }
  if (sessionsRefreshInterval) {
    clearInterval(sessionsRefreshInterval);
    sessionsRefreshInterval = null;
  }
  // Only unsubscribe if we actually subscribed to this device
  // and enough time has passed since subscription (prevent race conditions)
  if (
    device.value?.deviceUuid &&
    lastSubscribedUuid === device.value.deviceUuid
  ) {
    const timeSinceSubscription = subscriptionTime
      ? Date.now() - subscriptionTime
      : Infinity;

    if (timeSinceSubscription >= MIN_SUBSCRIPTION_TIME) {
      console.log(
        `[DeviceDetail] Unsubscribing from device connection status: ${device.value.deviceUuid}`
      );
      unsubscribe(device.value.deviceUuid);
    } else {
      console.log(
        `[DeviceDetail] Skipping unsubscribe (only ${timeSinceSubscription}ms since subscription)`
      );
      // Still clear the tracking variables
    }
    lastSubscribedUuid = null;
    subscriptionTime = null;
  }
});
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ device?.name || deviceId }}
          </h1>
        </template>
        <template #description>
          {{ t('broadcastBox.deviceDetails') }}
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Access Control -->
        <UAlert
          v-if="!canManageDevices"
          color="error"
          variant="soft"
          :title="t('broadcastBox.accessDenied')"
          :description="t('broadcastBox.noPermissionToManage')"
          icon="i-lucide-alert-circle"
        />

        <!-- Loading State -->
        <div v-else-if="loading" class="flex items-center justify-center py-16">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-gray-400 animate-spin"
          />
        </div>

        <!-- Error State -->
        <UAlert
          v-else-if="error"
          color="error"
          variant="soft"
          :title="t('broadcastBox.errors.loadFailed')"
          :description="error"
          icon="i-lucide-alert-circle"
        />

        <!-- Device Details -->
        <template v-else-if="device">
          <!-- Device Info Card -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">
                  {{ t('broadcastBox.deviceInformation') }}
                </h2>
                <div class="flex items-center gap-2">
                  <DeviceStatusBadge :status="device.status" />
                  <ConnectionStatusIndicator
                    :connected="isDeviceConnected"
                    :last-seen-at="
                      connectionStatus.lastSeenAt || device.lastSeenAt
                    "
                    :show-label="true"
                  />
                </div>
              </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400"
                >
                  {{ t('broadcastBox.deviceId') }}
                </label>
                <div class="flex items-center gap-2">
                  <p
                    class="text-sm font-mono text-gray-900 dark:text-gray-100 flex-1"
                  >
                    {{ device.id }}
                  </p>
                  <UButton
                    :icon="deviceIdCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                    size="xs"
                    variant="ghost"
                    :color="deviceIdCopied ? 'primary' : 'neutral'"
                    @click="copyToClipboard(device.id, 'deviceId')"
                  />
                </div>
              </div>

              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400"
                >
                  {{ t('broadcastBox.deviceUuid') }}
                </label>
                <div class="flex items-center gap-2">
                  <p
                    class="text-sm font-mono text-gray-900 dark:text-gray-100 flex-1"
                  >
                    {{ device.deviceUuid }}
                  </p>
                  <UButton
                    :icon="uuidCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                    size="xs"
                    variant="ghost"
                    :color="uuidCopied ? 'primary' : 'neutral'"
                    @click="copyToClipboard(device.deviceUuid, 'uuid')"
                  />
                </div>
              </div>

              <div v-if="device.roomLocation">
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400"
                >
                  {{ t('broadcastBox.roomLocation') }}
                </label>
                <p class="text-sm text-gray-900 dark:text-gray-100">
                  {{ device.roomLocation }}
                </p>
              </div>

              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400"
                >
                  {{ t('broadcastBox.createdAt') }}
                </label>
                <p class="text-sm text-gray-900 dark:text-gray-100">
                  {{ formatDate(device.createdAt) }}
                </p>
              </div>

              <div v-if="device.lastSeenAt">
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400"
                >
                  {{ t('broadcastBox.lastSeen') }}
                </label>
                <p class="text-sm text-gray-900 dark:text-gray-100">
                  {{ formatDate(device.lastSeenAt) }}
                </p>
              </div>
            </div>

            <template #footer>
              <div class="flex justify-end gap-3">
                <UButton
                  variant="ghost"
                  icon="i-lucide-settings"
                  @click="showConfigForm = true"
                >
                  {{ t('broadcastBox.configure') }}
                </UButton>
                <UButton
                  v-if="device.status !== 'revoked'"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-ban"
                  @click="handleRevoke"
                >
                  {{ t('broadcastBox.revoke') }}
                </UButton>
              </div>
            </template>
          </UCard>

          <!-- Enrollment Code Section -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">
                  {{ t('broadcastBox.enrollmentCode') }}
                </h2>
                <UButton
                  color="primary"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-refresh-cw"
                  :loading="regenerating"
                  :disabled="regenerating"
                  @click="handleRegenerateEnrollmentCode"
                >
                  {{ t('broadcastBox.regenerateEnrollmentCode') }}
                </UButton>
              </div>
            </template>

            <!-- Show newly generated code (with actual code value) -->
            <div v-if="enrollmentCode" class="space-y-4">
              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{ t('broadcastBox.enrollmentCode') }}
                </label>
                <div class="flex items-center gap-2">
                  <p
                    class="text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    {{ enrollmentCode.code }}
                  </p>
                  <UButton
                    :icon="codeCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                    size="sm"
                    variant="ghost"
                    color="primary"
                    @click="copyToClipboard(enrollmentCode.code, 'code')"
                  >
                    {{
                      codeCopied
                        ? t('broadcastBox.copied')
                        : t('broadcastBox.copy')
                    }}
                  </UButton>
                </div>
              </div>

              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{ t('broadcastBox.expiration') }}
                </label>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="
                      getExpirationStatus(enrollmentCode.expiresAt).status ===
                      'expired'
                        ? 'error'
                        : 'primary'
                    "
                    variant="soft"
                  >
                    {{ getExpirationStatus(enrollmentCode.expiresAt).text }}
                  </UBadge>
                  <span class="text-sm text-gray-500">
                    {{ formatDate(enrollmentCode.expiresAt) }}
                  </span>
                </div>
              </div>

              <UAlert
                color="error"
                variant="soft"
                :title="t('broadcastBox.enrollmentCodeWarning')"
                :description="t('broadcastBox.enrollmentCodeWarningDesc')"
                icon="i-lucide-alert-triangle"
              />
            </div>

            <!-- Show existing enrollment code status (without actual code, since it's hashed) -->
            <div v-else-if="enrollmentCodeStatus?.exists" class="space-y-4">
              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{ t('broadcastBox.enrollmentCodeStatus') }}
                </label>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="
                      enrollmentCodeStatus.isUsed
                        ? 'neutral'
                        : enrollmentCodeStatus.isExpired
                          ? 'error'
                          : 'primary'
                    "
                    variant="soft"
                  >
                    {{
                      enrollmentCodeStatus.isUsed
                        ? t('broadcastBox.enrollmentCodeUsed')
                        : enrollmentCodeStatus.isExpired
                          ? t('broadcastBox.enrollmentCodeExpired')
                          : t('broadcastBox.enrollmentCodeActive')
                    }}
                  </UBadge>
                </div>
              </div>

              <div v-if="enrollmentCodeStatus.expiresAt">
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{ t('broadcastBox.expiration') }}
                </label>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-500">
                    {{ formatDate(enrollmentCodeStatus.expiresAt) }}
                  </span>
                  <span
                    v-if="
                      !enrollmentCodeStatus.isExpired &&
                      !enrollmentCodeStatus.isUsed
                    "
                    class="text-xs text-gray-400"
                  >
                    ({{
                      getExpirationStatus(enrollmentCodeStatus.expiresAt).text
                    }})
                  </span>
                </div>
              </div>

              <div v-if="enrollmentCodeStatus.usedAt">
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{ t('broadcastBox.usedAt') }}
                </label>
                <span class="text-sm text-gray-500">
                  {{ formatDate(enrollmentCodeStatus.usedAt) }}
                </span>
              </div>

              <UAlert
                v-if="
                  !enrollmentCodeStatus.isUsed &&
                  !enrollmentCodeStatus.isExpired
                "
                color="error"
                variant="soft"
                :title="t('broadcastBox.enrollmentCodeWarning')"
                :description="t('broadcastBox.enrollmentCodeWarningDesc')"
                icon="i-lucide-alert-triangle"
              />

              <UAlert
                v-else-if="enrollmentCodeStatus.isExpired"
                color="error"
                variant="soft"
                :title="t('broadcastBox.enrollmentCodeExpired')"
                :description="t('broadcastBox.enrollmentCodeExpiredDesc')"
                icon="i-lucide-alert-circle"
              />
            </div>

            <!-- No enrollment code -->
            <div v-else class="text-center py-8">
              <UIcon
                name="i-lucide-key"
                class="w-12 h-12 text-gray-300 mb-4 mx-auto"
              />
              <p class="text-gray-500 mb-4">
                {{ t('broadcastBox.noEnrollmentCode') }}
              </p>
              <UButton
                color="primary"
                icon="i-lucide-refresh-cw"
                :loading="regenerating"
                :disabled="regenerating"
                @click="handleRegenerateEnrollmentCode"
              >
                {{ t('broadcastBox.generateEnrollmentCode') }}
              </UButton>
            </div>
          </UCard>

          <!-- Device Capabilities -->
          <UCard v-if="device">
            <template #header>
              <h2 class="text-lg font-semibold">
                {{ t('broadcastBox.deviceCapabilities') }}
              </h2>
            </template>

            <div class="space-y-6">
              <!-- Video Sources -->
              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{ t('broadcastBox.videoSources') }}
                </label>
                <div class="space-y-2">
                  <div
                    v-for="source in device.capabilities?.videoSources || []"
                    :key="source"
                    class="flex items-center justify-between p-2 rounded-lg"
                    :class="{
                      'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800':
                        device.config?.defaultVideoSource === source,
                      'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700':
                        device.config?.defaultVideoSource !== source,
                    }"
                  >
                    <div class="flex items-center gap-2">
                      <UIcon
                        name="i-lucide-video"
                        class="w-4 h-4 text-gray-500"
                      />
                      <span class="text-sm font-medium">{{ source }}</span>
                    </div>
                    <UBadge
                      v-if="device.config?.defaultVideoSource === source"
                      color="primary"
                      variant="soft"
                      size="xs"
                    >
                      {{ t('broadcastBox.active') }}
                    </UBadge>
                  </div>
                  <p
                    v-if="!device.capabilities?.videoSources?.length"
                    class="text-sm text-gray-500"
                  >
                    {{ t('broadcastBox.noVideoSources') }}
                  </p>
                </div>
              </div>

              <!-- Audio Sources -->
              <div>
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{ t('broadcastBox.audioSources') }}
                </label>
                <div class="space-y-2">
                  <div
                    v-for="source in device.capabilities?.audioSources || []"
                    :key="source"
                    class="flex items-center justify-between p-2 rounded-lg"
                    :class="{
                      'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800':
                        device.config?.defaultAudioSource === source,
                      'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700':
                        device.config?.defaultAudioSource !== source,
                    }"
                  >
                    <div class="flex items-center gap-2">
                      <UIcon
                        name="i-lucide-mic"
                        class="w-4 h-4 text-gray-500"
                      />
                      <span class="text-sm font-medium">{{ source }}</span>
                    </div>
                    <UBadge
                      v-if="device.config?.defaultAudioSource === source"
                      color="primary"
                      variant="soft"
                      size="xs"
                    >
                      {{ t('broadcastBox.active') }}
                    </UBadge>
                  </div>
                  <p
                    v-if="!device.capabilities?.audioSources?.length"
                    class="text-sm text-gray-500"
                  >
                    {{ t('broadcastBox.noAudioSources') }}
                  </p>
                </div>
              </div>

              <!-- Other Capabilities -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <label
                    class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block"
                  >
                    {{ t('broadcastBox.maxResolution') }}
                  </label>
                  <p class="text-sm font-semibold">
                    {{ device.capabilities?.maxResolution || 'N/A' }}
                  </p>
                </div>
                <div>
                  <label
                    class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block"
                  >
                    {{ t('broadcastBox.pipSupport') }}
                  </label>
                  <div class="flex items-center gap-2">
                    <UBadge
                      :color="
                        device.capabilities?.pipSupported
                          ? 'primary'
                          : 'neutral'
                      "
                      variant="soft"
                      size="sm"
                    >
                      {{
                        device.capabilities?.pipSupported
                          ? t('broadcastBox.supported')
                          : t('broadcastBox.notSupported')
                      }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Manual Recording (hidden, kept mounted for composable state) -->
          <div v-if="device" v-show="false">
            <DeviceManualRecording
              ref="manualRecordingRef"
              :device="device"
              :is-device-connected="isDeviceConnected"
              :connection-status="connectionStatus"
            />
          </div>

          <!-- Preview Stream -->
          <DevicePreview
            v-if="device && isDeviceConnected"
            :device="device"
            :is-device-connected="isDeviceConnected"
            :connection-status="connectionStatus"
            :ws-connection="wsConnection"
            :is-recording="manualRecordingRef?.isRecording ?? false"
            :recording-duration="manualRecordingRef?.formattedDuration ?? ''"
            :recording-loading="manualRecordingRef?.loading ?? false"
            @start-recording="manualRecordingRef?.handleStart()"
            @stop-recording="manualRecordingRef?.handleStop()"
          />

          <!-- Device Control Cards (show when device is loaded; controls disabled when offline) -->
          <div v-if="device" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Source Control -->
            <DeviceSourceControl
              :device="device"
              :is-device-connected="isDeviceConnected"
              :connection-status="connectionStatus"
            />

            <!-- Configuration Control -->
            <DeviceConfigControl
              :device="device"
              :is-device-connected="isDeviceConnected"
              @updated="onConfigUpdated"
            />

            <!-- Streaming Control (RTMP) -->
            <DeviceStreamingControl
              v-if="device"
              :device="device"
              :is-device-connected="isDeviceConnected"
              :streaming-status="connectionStatus.streaming ?? null"
            />

            <!-- Watermark / Logo Overlay -->
            <DeviceWatermarkControl
              v-if="device"
              :device="device"
              :is-device-connected="isDeviceConnected"
            />
          </div>

          <!-- Status Control -->
          <DeviceStatusControl
            :device="device"
            :is-device-connected="isDeviceConnected"
            :connection-status="connectionStatus"
            @refreshed="loadDevice"
          />

          <!-- Device Health -->
          <UCard v-if="realtimeHealth">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">
                  {{ t('broadcastBox.deviceHealth') }}
                </h2>
                <UBadge
                  v-if="connectionStatus.health"
                  color="primary"
                  variant="soft"
                  size="xs"
                >
                  {{ t('broadcastBox.live') || 'Live' }}
                </UBadge>
              </div>
            </template>

            <div class="space-y-4">
              <div v-if="realtimeHealth.score !== undefined">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">{{
                    t('broadcastBox.healthScore')
                  }}</span>
                  <span
                    class="text-lg font-semibold"
                    :class="{
                      'text-green-600': realtimeHealth.score >= 80,
                      'text-yellow-600':
                        realtimeHealth.score >= 50 && realtimeHealth.score < 80,
                      'text-red-600': realtimeHealth.score < 50,
                    }"
                  >
                    {{ realtimeHealth.score }}%
                  </span>
                </div>
              </div>

              <div v-if="realtimeHealth.metrics" class="grid grid-cols-3 gap-4">
                <div>
                  <label class="text-xs text-gray-600 dark:text-gray-400">
                    {{ t('broadcastBox.cpu') }}
                  </label>
                  <p class="text-sm font-semibold">
                    {{ realtimeHealth.metrics.cpuPercent || 0 }}%
                  </p>
                </div>
                <div>
                  <label class="text-xs text-gray-600 dark:text-gray-400">
                    {{ t('broadcastBox.memory') }}
                  </label>
                  <p class="text-sm font-semibold">
                    {{ realtimeHealth.metrics.memoryPercent || 0 }}%
                  </p>
                </div>
                <div>
                  <label class="text-xs text-gray-600 dark:text-gray-400">
                    {{ t('broadcastBox.disk') }}
                  </label>
                  <p class="text-sm font-semibold">
                    {{ realtimeHealth.metrics.diskPercent || 0 }}%
                  </p>
                </div>
              </div>

              <!-- Network Connectivity -->
              <div
                v-if="
                  connectionStatus.health?.networkConnected !== undefined ||
                  realtimeHealth.networkConnected !== undefined
                "
                class="pt-4 border-t"
              >
                <div class="flex items-center justify-between">
                  <label
                    class="text-sm font-medium text-gray-600 dark:text-gray-400"
                  >
                    {{ t('broadcastBox.networkConnectivity') || 'Network' }}
                  </label>
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="
                        (connectionStatus.health?.networkConnected ??
                        realtimeHealth.networkConnected)
                          ? 'i-lucide-wifi'
                          : 'i-lucide-wifi-off'
                      "
                      :class="
                        (connectionStatus.health?.networkConnected ??
                        realtimeHealth.networkConnected)
                          ? 'w-5 h-5 text-green-600'
                          : 'w-5 h-5 text-red-600'
                      "
                    />
                    <UBadge
                      :color="
                        (connectionStatus.health?.networkConnected ??
                        realtimeHealth.networkConnected)
                          ? 'primary'
                          : 'error'
                      "
                      variant="soft"
                      size="sm"
                    >
                      {{
                        (connectionStatus.health?.networkConnected ??
                        realtimeHealth.networkConnected)
                          ? t('broadcastBox.connected') || 'Connected'
                          : t('broadcastBox.disconnected') || 'Disconnected'
                      }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Active Sources -->
          <UCard
            v-if="
              connectionStatus.activeSources?.video ||
              connectionStatus.activeSources?.audio ||
              device?.activeSources?.video ||
              device?.activeSources?.audio
            "
          >
            <template #header>
              <h2 class="text-lg font-semibold">
                {{ t('broadcastBox.activeSources') }}
              </h2>
            </template>
            <div class="space-y-4">
              <!-- Active Video Source -->
              <div
                v-if="
                  connectionStatus.activeSources?.video ||
                  device?.activeSources?.video
                "
              >
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block"
                >
                  {{ t('broadcastBox.activeVideoSource') }}
                </label>
                <div class="flex items-center gap-2">
                  <UBadge color="primary" variant="soft" size="lg">
                    {{
                      (
                        connectionStatus.activeSources?.video ||
                        device?.activeSources?.video
                      )?.identifier || 'Unknown'
                    }}
                  </UBadge>
                  <span
                    v-if="
                      (
                        connectionStatus.activeSources?.video ||
                        device?.activeSources?.video
                      )?.name
                    "
                    class="text-sm text-gray-600 dark:text-gray-400"
                  >
                    {{
                      (
                        connectionStatus.activeSources?.video ||
                        device?.activeSources?.video
                      )?.name
                    }}
                  </span>
                </div>
                <div
                  v-if="
                    (
                      connectionStatus.activeSources?.video ||
                      device?.activeSources?.video
                    )?.resolution
                  "
                  class="text-xs text-gray-500 mt-1"
                >
                  {{
                    (
                      connectionStatus.activeSources?.video ||
                      device?.activeSources?.video
                    )?.resolution?.[0]
                  }}x{{
                    (
                      connectionStatus.activeSources?.video ||
                      device?.activeSources?.video
                    )?.resolution?.[1]
                  }}
                  <span
                    v-if="
                      (
                        connectionStatus.activeSources?.video ||
                        device?.activeSources?.video
                      )?.framerate
                    "
                  >
                    @
                    {{
                      (
                        connectionStatus.activeSources?.video ||
                        device?.activeSources?.video
                      )?.framerate
                    }}
                    fps
                  </span>
                </div>
              </div>
              <UAlert
                v-else
                color="neutral"
                variant="soft"
                :title="t('broadcastBox.noActiveVideoSource')"
                icon="i-lucide-video-off"
              />

              <!-- Active Audio Source -->
              <div
                v-if="
                  connectionStatus.activeSources?.audio ||
                  device?.activeSources?.audio
                "
              >
                <label
                  class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block"
                >
                  {{ t('broadcastBox.activeAudioSource') }}
                </label>
                <div class="flex items-center gap-2">
                  <UBadge color="primary" variant="soft" size="lg">
                    {{
                      (
                        connectionStatus.activeSources?.audio ||
                        device?.activeSources?.audio
                      )?.identifier || 'Unknown'
                    }}
                  </UBadge>
                  <span
                    v-if="
                      (
                        connectionStatus.activeSources?.audio ||
                        device?.activeSources?.audio
                      )?.name
                    "
                    class="text-sm text-gray-600 dark:text-gray-400"
                  >
                    {{
                      (
                        connectionStatus.activeSources?.audio ||
                        device?.activeSources?.audio
                      )?.name
                    }}
                  </span>
                </div>
              </div>
              <UAlert
                v-else
                color="neutral"
                variant="soft"
                :title="t('broadcastBox.noActiveAudioSource')"
                icon="i-lucide-mic-off"
              />
            </div>
          </UCard>

          <!-- Picture-in-Picture Configuration (editable form and current state) -->
          <DevicePiPControl
            v-if="
              device &&
              (device.capabilities?.pipSupported !== undefined ||
                !!connectionStatus.pip ||
                !!device.pip)
            "
            :device="device"
            :is-device-connected="isDeviceConnected"
          />

          <!-- Recent Sessions -->
          <UCard>
            <template #header>
              <h2 class="text-lg font-semibold">
                {{ t('broadcastBox.recentSessions') }}
              </h2>
            </template>

            <div
              v-if="sessions.length === 0"
              class="text-center py-8 text-gray-500"
            >
              {{ t('broadcastBox.noSessions') }}
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="session in sessions"
                :key="session.id"
                class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <SessionStatusBadge :status="session.status" />
                    <span class="text-sm font-medium">{{ session.id }}</span>
                  </div>
                  <div v-if="session.startedAt" class="text-xs text-gray-500">
                    {{ t('broadcastBox.startedAt') }}:
                    {{ formatDate(session.startedAt) }}
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <UButton
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-arrow-right"
                    @click="
                      navigateTo(
                        `/records/session/${session.civicpressSessionId}`
                      )
                    "
                  >
                    {{ t('broadcastBox.viewSession') }}
                  </UButton>
                  <UButton
                    variant="ghost"
                    size="xs"
                    color="error"
                    icon="i-lucide-trash-2"
                    :loading="removingSessionId === session.id"
                    :disabled="removingSessionId !== null"
                    @click="handleRemoveSession(session.id)"
                  >
                    {{ t('broadcastBox.removeSession') }}
                  </UButton>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Device Recordings -->
          <UCard v-if="device">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">
                  {{ t('broadcastBox.recordingsList') }}
                </h2>
                <UButton
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-refresh-cw"
                  :loading="manualRecordingRef?.isLoadingRecordings"
                  :disabled="!isDeviceConnected"
                  @click="manualRecordingRef?.loadRecordings()"
                >
                  {{ t('common.refresh') }}
                </UButton>
              </div>
            </template>

            <!-- Loading State -->
            <div
              v-if="manualRecordingRef?.isLoadingRecordings"
              class="text-center py-4"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="w-5 h-5 animate-spin text-gray-400"
              />
            </div>

            <!-- Empty State -->
            <UAlert
              v-else-if="!manualRecordingRef?.recordings?.length"
              color="neutral"
              variant="soft"
              :title="t('broadcastBox.noRecordings')"
              :description="t('broadcastBox.noRecordingsDesc')"
              icon="i-lucide-info"
            />

            <!-- Recordings List -->
            <div v-else class="space-y-2">
              <div
                v-for="recording in manualRecordingRef.recordings"
                :key="recording.recording_id"
                class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-sm font-medium">
                      {{ formatDate(recording.started_at) }}
                    </span>
                    <UBadge
                      v-if="!recording.stopped_at"
                      color="error"
                      variant="soft"
                      size="xs"
                    >
                      {{ t('broadcastBox.recording') }}
                    </UBadge>
                  </div>
                  <div class="text-xs text-gray-500 space-y-1">
                    <div>
                      {{ t('broadcastBox.duration') }}:
                      {{
                        manualRecordingRef.formatDuration(
                          recording.duration_seconds
                        )
                      }}
                    </div>
                    <div>
                      {{ t('broadcastBox.fileSize') }}:
                      {{
                        manualRecordingRef.formatFileSize(
                          recording.file_size_bytes
                        )
                      }}
                    </div>
                    <div v-if="recording.quality" class="capitalize">
                      {{ t('broadcastBox.quality') }}: {{ recording.quality }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Footer -->
          <SystemFooter />
        </template>

        <!-- Configuration Form Modal -->
        <UModal
          v-model:open="showConfigForm"
          :title="t('broadcastBox.configureDevice')"
          :description="t('broadcastBox.deviceManagementDesc')"
        >
          <template #body>
            <DeviceConfigurationForm
              v-if="device"
              :device="device"
              @success="handleConfigSuccess"
              @close="showConfigForm = false"
            />
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
