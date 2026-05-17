<template>
  <div class="device-list">
    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-16">
      <UIcon
        name="i-lucide-loader-2"
        class="w-8 h-8 text-gray-400 animate-spin mb-4"
      />
      <span class="text-gray-600">{{ t('broadcastBox.loading') }}</span>
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      :title="t('broadcastBox.errors.loadFailed')"
      :description="error"
      icon="i-lucide-alert-circle"
      class="mb-6"
    />

    <!-- Empty State -->
    <div v-else-if="devices.length === 0" class="text-center py-16">
      <UIcon
        name="i-lucide-video"
        class="w-16 h-16 text-gray-300 mb-4 mx-auto"
      />
      <h3 class="text-lg font-semibold text-gray-900 mb-2">
        {{ t('broadcastBox.noDevices') }}
      </h3>
      <p class="text-gray-500 mb-6">{{ t('broadcastBox.noDevicesDesc') }}</p>
      <UButton
        v-if="canManageDevices"
        @click="$emit('register')"
        color="primary"
        icon="i-lucide-plus"
      >
        {{ t('broadcastBox.registerDevice') }}
      </UButton>
    </div>

    <!-- Device Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <UCard
        v-for="device in devices"
        :key="device.id"
        class="device-card cursor-pointer hover:shadow-lg transition-shadow"
        @click="$emit('deviceClick', device)"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-lg">{{ device.name }}</h3>
            <DeviceStatusBadge :status="device.status" />
          </div>
        </template>

        <div class="space-y-3">
          <!-- Connection Status -->
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600">{{
              t('broadcastBox.connectionStatus')
            }}</span>
            <ConnectionStatusIndicator
              :connected="isDeviceConnected(device)"
              :last-seen-at="
                statuses.get(device.deviceUuid)?.lastSeenAt || device.lastSeenAt
              "
            />
          </div>

          <!-- Room Location -->
          <div v-if="device.roomLocation" class="flex items-center gap-2">
            <UIcon name="i-lucide-map-pin" class="w-4 h-4 text-gray-400" />
            <span class="text-sm text-gray-600">{{ device.roomLocation }}</span>
          </div>

          <!-- Device UUID -->
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-hash" class="w-4 h-4 text-gray-400" />
            <span class="text-xs text-gray-500 font-mono flex-1 truncate">{{
              device.deviceUuid
            }}</span>
            <UButton
              variant="ghost"
              size="xs"
              icon="i-lucide-copy"
              @click.stop="copyToClipboard(device.deviceUuid)"
            />
          </div>

          <!-- Capabilities -->
          <div class="flex flex-wrap gap-2 pt-2 border-t">
            <UBadge
              v-if="device.capabilities.pipSupported"
              color="primary"
              variant="soft"
              size="xs"
              label="PiP"
            />
            <UBadge
              :label="device.capabilities.maxResolution"
              color="neutral"
              variant="soft"
              size="xs"
            />
          </div>
        </div>

        <template #footer>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500">
              {{ t('broadcastBox.lastSeen') }}:
              {{
                device.lastSeenAt
                  ? formatDate(device.lastSeenAt)
                  : t('broadcastBox.never')
              }}
            </span>
            <UButton
              v-if="canManageDevices"
              variant="ghost"
              size="xs"
              icon="i-lucide-settings"
              @click.stop="$emit('configure', device)"
            >
              {{ t('broadcastBox.configure') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import DeviceStatusBadge from './DeviceStatusBadge.vue';
import ConnectionStatusIndicator from './ConnectionStatusIndicator.vue';
import { useAuthStore } from '~/stores/auth';
import { useRecordUtils } from '~/composables/useRecordUtils';
import { useDeviceConnectionStatuses } from '~/composables/useDeviceConnectionStatus';

const props = defineProps<{
  devices: BroadcastDevice[];
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  deviceClick: [device: BroadcastDevice];
  register: [];
  configure: [device: BroadcastDevice];
}>();

const { t } = useI18n();
const authStore = useAuthStore();
const { formatDate } = useRecordUtils();
const toast = useToast();

const canManageDevices = computed(() => {
  const role = authStore.currentUser?.role;
  return role === 'admin';
});

// Use real-time connection status for all devices
const deviceUuids = computed(() => props.devices.map((d) => d.deviceUuid));
const { statuses } = useDeviceConnectionStatuses(deviceUuids);

// Check if device is connected (uses real-time status if available)
const isDeviceConnected = (device: BroadcastDevice): boolean => {
  // Use real-time status if available
  const realtimeStatus = statuses.value.get(device.deviceUuid);
  if (realtimeStatus && realtimeStatus.connected !== undefined) {
    return realtimeStatus.connected;
  }

  // Fallback to lastSeenAt check
  if (device.status !== 'active') {
    return false;
  }

  if (!device.lastSeenAt) {
    return false;
  }

  const lastSeen = new Date(device.lastSeenAt);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

  // Consider connected if last seen within 5 minutes
  return diffMinutes < 5;
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
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
</script>
