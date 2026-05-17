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
import DevicePreview from '~/components/broadcast-box/DevicePreview.vue';
import DeviceManualRecording from '~/components/broadcast-box/DeviceManualRecording.vue';
import { useRecordUtils } from '~/composables/useRecordUtils';
import { useDeviceConnectionStatus } from '~/composables/useDeviceConnectionStatus';
import QRCode from 'qrcode';

const { formatDate } = useRecordUtils();

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
const showRevokeModal = ref(false);
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
const enrollmentQrDataUrl = ref('');

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
// 2. When user explicitly refreshes
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

// Device state from WebSocket connection status
const deviceState = computed(() => {
  return connectionStatus.value.state || 'idle';
});

// Accordion items for collapsible device details
const detailsAccordionItems = [
  {
    label: t('broadcastBox.deviceInformation'),
    slot: 'device-info',
    defaultOpen: false,
  },
  {
    label: t('broadcastBox.enrollmentCode'),
    slot: 'enrollment',
    defaultOpen: false,
  },
];

// Generate QR code when enrollment code is regenerated
watch(
  () => enrollmentCode.value?.code,
  async (code) => {
    if (code && device.value) {
      const payload = {
        type: 'civicpress-enrollment',
        url: window.location.origin + '/api/v1/broadcast-box/devices',
        code: code,
        v: 1,
      };
      enrollmentQrDataUrl.value = await QRCode.toDataURL(
        JSON.stringify(payload),
        { width: 256, margin: 2 }
      );
    } else {
      enrollmentQrDataUrl.value = '';
    }
  },
  { immediate: true }
);

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

  try {
    await revokeDevice(device.value.id);
    showRevokeModal.value = false;
    navigateTo('/settings/broadcast-box');
  } catch (err: any) {
    showRevokeModal.value = false;
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
            {{ t('broadcastBox.deviceDetails') }}
          </h1>
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
          <!-- Health & Status Row -->
          <UCard>
            <div class="flex flex-wrap items-center gap-4">
              <!-- Device Name + Connection Status -->
              <div class="flex items-center gap-2 mr-auto">
                <h2 class="text-lg font-semibold">{{ device.name }}</h2>
                <ConnectionStatusIndicator
                  :connected="isDeviceConnected"
                  :last-seen-at="
                    connectionStatus.lastSeenAt || device.lastSeenAt
                  "
                  :show-label="true"
                />
              </div>

              <!-- Health Score -->
              <div
                v-if="realtimeHealth?.score !== undefined"
                class="flex items-center gap-1.5"
              >
                <span class="text-xs text-gray-500">{{
                  t('broadcastBox.healthScore')
                }}</span>
                <UBadge
                  :color="
                    realtimeHealth.score >= 80
                      ? 'primary'
                      : realtimeHealth.score >= 50
                        ? 'neutral'
                        : 'error'
                  "
                  variant="soft"
                  size="sm"
                >
                  {{ realtimeHealth.score }}%
                </UBadge>
              </div>

              <!-- CPU -->
              <div
                v-if="isDeviceConnected && realtimeHealth?.metrics"
                class="flex items-center gap-1.5 min-w-[100px]"
              >
                <span class="text-xs text-gray-500 w-8">CPU</span>
                <UProgress
                  :value="realtimeHealth.metrics.cpuPercent || 0"
                  size="xs"
                  class="flex-1"
                />
                <span class="text-xs font-mono w-8 text-right"
                  >{{ realtimeHealth.metrics.cpuPercent || 0 }}%</span
                >
              </div>

              <!-- Memory -->
              <div
                v-if="isDeviceConnected && realtimeHealth?.metrics"
                class="flex items-center gap-1.5 min-w-[100px]"
              >
                <span class="text-xs text-gray-500 w-8">Mem</span>
                <UProgress
                  :value="realtimeHealth.metrics.memoryPercent || 0"
                  size="xs"
                  class="flex-1"
                />
                <span class="text-xs font-mono w-8 text-right"
                  >{{ realtimeHealth.metrics.memoryPercent || 0 }}%</span
                >
              </div>

              <!-- Disk -->
              <div
                v-if="isDeviceConnected && realtimeHealth?.metrics"
                class="flex items-center gap-1.5 min-w-[100px]"
              >
                <span class="text-xs text-gray-500 w-8">Disk</span>
                <UProgress
                  :value="realtimeHealth.metrics.diskPercent || 0"
                  size="xs"
                  class="flex-1"
                />
                <span class="text-xs font-mono w-8 text-right"
                  >{{ realtimeHealth.metrics.diskPercent || 0 }}%</span
                >
              </div>

              <!-- Network -->
              <UIcon
                v-if="connectionStatus.health?.networkConnected !== undefined"
                :name="
                  connectionStatus.health.networkConnected
                    ? 'i-lucide-wifi'
                    : 'i-lucide-wifi-off'
                "
                :class="
                  connectionStatus.health.networkConnected
                    ? 'text-green-600 w-5 h-5'
                    : 'text-red-600 w-5 h-5'
                "
              />

              <!-- Device State Badge -->
              <UBadge
                :color="
                  deviceState === 'recording'
                    ? 'error'
                    : deviceState === 'encoding' || deviceState === 'uploading'
                      ? 'primary'
                      : 'neutral'
                "
                variant="soft"
                size="sm"
              >
                <UIcon
                  :name="
                    deviceState === 'recording'
                      ? 'i-lucide-circle-dot'
                      : deviceState === 'encoding'
                        ? 'i-lucide-cog'
                        : deviceState === 'uploading'
                          ? 'i-lucide-upload'
                          : 'i-lucide-pause'
                  "
                  class="w-3 h-3 mr-1"
                />
                {{ t(`broadcastBox.state.${deviceState}`) }}
              </UBadge>

              <!-- Actions -->
              <div class="flex items-center gap-1">
                <UButton
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-settings"
                  @click="showConfigForm = true"
                />
                <UButton
                  v-if="device.status !== 'revoked'"
                  color="error"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-ban"
                  @click="showRevokeModal = true"
                />
              </div>
            </div>

            <!-- Fallback when no health data -->
            <div
              v-if="!realtimeHealth?.metrics && !realtimeHealth?.score"
              class="mt-2"
            >
              <span class="text-xs text-gray-400">{{
                t('broadcastBox.noHealthData') || 'No health data available'
              }}</span>
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

          <!-- Preview Stream (always rendered, greyed out when offline) -->
          <DevicePreview
            v-if="device"
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

          <!-- Device Control Cards (always rendered; controls disabled when offline) -->
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
              :device="device"
              :is-device-connected="isDeviceConnected"
              :streaming-status="connectionStatus.streaming ?? null"
            />

            <!-- Watermark / Logo Overlay -->
            <DeviceWatermarkControl
              :device="device"
              :is-device-connected="isDeviceConnected"
            />
          </div>

          <!-- Picture-in-Picture Configuration -->
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

          <!-- Recordings & Sessions -->
          <UCard v-if="device">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">
                  {{
                    t('broadcastBox.recordingsAndSessions') ||
                    'Recordings & Sessions'
                  }}
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

            <!-- Recordings Section -->
            <div>
              <h3
                class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3"
              >
                {{ t('broadcastBox.recordingsList') }}
              </h3>

              <UAlert
                v-if="!manualRecordingRef?.recordings?.length"
                color="neutral"
                variant="soft"
                :title="t('broadcastBox.noRecordings')"
                :description="t('broadcastBox.noRecordingsDesc')"
                icon="i-lucide-info"
              />

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
            </div>

            <!-- Divider -->
            <USeparator class="my-6" />

            <!-- Sessions Section -->
            <div>
              <h3
                class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3"
              >
                {{ t('broadcastBox.recentSessions') }}
              </h3>

              <div
                v-if="sessions.length === 0"
                class="text-center py-4 text-gray-500 text-sm"
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
            </div>
          </UCard>

          <!-- Device Details (Collapsible) -->
          <UAccordion :items="detailsAccordionItems" class="mt-2">
            <template #device-info>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
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
                      :icon="
                        deviceIdCopied ? 'i-lucide-check' : 'i-lucide-copy'
                      "
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

                <div>
                  <label
                    class="text-sm font-medium text-gray-600 dark:text-gray-400"
                  >
                    {{ t('broadcastBox.status') || 'Status' }}
                  </label>
                  <DeviceStatusBadge :status="device.status" />
                </div>
              </div>
            </template>

            <template #enrollment>
              <div class="p-4 space-y-4">
                <!-- QR Code (shown after regeneration) -->
                <div
                  v-if="enrollmentCode && enrollmentQrDataUrl"
                  class="flex flex-col items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20"
                >
                  <p class="text-sm font-medium">
                    {{ t('broadcastBox.scanQrCode') }}
                  </p>
                  <img
                    :src="enrollmentQrDataUrl"
                    alt="Enrollment QR Code"
                    class="w-48 h-48"
                  />
                  <p class="text-xs text-muted text-center max-w-xs">
                    {{ t('broadcastBox.scanQrCodeDesc') }}
                  </p>
                </div>

                <!-- Enrollment code value (when freshly generated) -->
                <div v-if="enrollmentCode">
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
                  <div
                    v-if="enrollmentCode.expiresAt"
                    class="flex items-center gap-2 mt-2"
                  >
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

                <!-- Enrollment status (when code already exists but value is hashed) -->
                <div v-else-if="enrollmentCodeStatus?.exists">
                  <div class="flex items-center gap-2 mb-2">
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
                    <span
                      v-if="enrollmentCodeStatus.expiresAt"
                      class="text-sm text-gray-500"
                    >
                      {{ formatDate(enrollmentCodeStatus.expiresAt) }}
                    </span>
                  </div>
                </div>

                <!-- No enrollment code -->
                <div v-else class="text-sm text-gray-500">
                  {{ t('broadcastBox.noEnrollmentCode') }}
                </div>

                <!-- Regenerate button -->
                <UButton
                  color="primary"
                  variant="soft"
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
          </UAccordion>

          <!-- Footer -->
          <SystemFooter />
        </template>

        <!-- Revoke Confirmation Modal -->
        <UModal
          v-model:open="showRevokeModal"
          :title="t('broadcastBox.revokeDevice') || 'Revoke Device'"
        >
          <template #body>
            <div class="space-y-4">
              <p class="text-gray-700 dark:text-gray-300">
                {{ t('broadcastBox.confirmRevoke') }}
              </p>
              <div
                class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
              >
                <div class="flex items-start space-x-3">
                  <UIcon
                    name="i-lucide-alert-triangle"
                    class="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0"
                  />
                  <p class="text-sm text-red-800 dark:text-red-200">
                    {{
                      t('broadcastBox.revokeWarning') ||
                      'This will permanently disconnect the device and invalidate its credentials. The device will need to be re-enrolled to reconnect.'
                    }}
                  </p>
                </div>
              </div>
            </div>
          </template>
          <template #footer="{ close }">
            <div class="flex justify-end space-x-3">
              <UButton color="neutral" variant="outline" @click="close">
                {{ t('common.cancel') }}
              </UButton>
              <UButton color="error" @click="handleRevoke">
                {{ t('broadcastBox.revoke') }}
              </UButton>
            </div>
          </template>
        </UModal>

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
