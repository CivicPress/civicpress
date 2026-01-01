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
import { useRecordUtils } from '~/composables/useRecordUtils';

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
  revokeDevice,
  regenerateEnrollmentCode,
} = useBroadcastBox();
const authStore = useAuthStore();
const toast = useToast();

const deviceId = route.params.id as string;
const device = ref<BroadcastDevice | null>(null);
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
const uuidCopied = ref(false);
const codeCopied = ref(false);
const deviceIdCopied = ref(false);

const canManageDevices = computed(() => {
  return authStore.hasPermission('broadcast-box:admin');
});

const isDeviceConnected = computed(() => {
  if (!device.value || device.value.status !== 'active') {
    return false;
  }

  if (!device.value.lastSeenAt) {
    return false;
  }

  const lastSeen = new Date(device.value.lastSeenAt);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

  return diffMinutes < 5;
});

const loadDevice = async () => {
  loading.value = true;
  error.value = '';

  try {
    const [deviceResponse, healthData, sessionsData] = await Promise.all([
      getDevice(deviceId),
      getDeviceHealth(deviceId),
      listSessions({ deviceId }),
    ]);

    if (deviceResponse) {
      device.value = deviceResponse.device;
      enrollmentCodeStatus.value = deviceResponse.enrollmentCode || null;
    }
    health.value = healthData;
    sessions.value = sessionsData;
  } catch (err: any) {
    error.value = err.message || t('broadcastBox.errors.loadFailed');
  } finally {
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
  loadDevice();
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
  if (canManageDevices.value) {
    loadDevice();
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
                    :last-seen-at="device.lastSeenAt"
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

          <!-- Device Health -->
          <UCard v-if="health">
            <template #header>
              <h2 class="text-lg font-semibold">
                {{ t('broadcastBox.deviceHealth') }}
              </h2>
            </template>

            <div class="space-y-4">
              <div v-if="health.score !== undefined">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium">{{
                    t('broadcastBox.healthScore')
                  }}</span>
                  <span
                    class="text-lg font-semibold"
                    :class="{
                      'text-green-600': health.score >= 80,
                      'text-yellow-600':
                        health.score >= 50 && health.score < 80,
                      'text-red-600': health.score < 50,
                    }"
                  >
                    {{ health.score }}%
                  </span>
                </div>
                <UProgress :value="health.score" />
              </div>

              <div v-if="health.metrics" class="grid grid-cols-3 gap-4">
                <div>
                  <label class="text-xs text-gray-600 dark:text-gray-400">
                    {{ t('broadcastBox.cpu') }}
                  </label>
                  <p class="text-sm font-semibold">
                    {{ health.metrics.cpuPercent || 0 }}%
                  </p>
                </div>
                <div>
                  <label class="text-xs text-gray-600 dark:text-gray-400">
                    {{ t('broadcastBox.memory') }}
                  </label>
                  <p class="text-sm font-semibold">
                    {{ health.metrics.memoryPercent || 0 }}%
                  </p>
                </div>
                <div>
                  <label class="text-xs text-gray-600 dark:text-gray-400">
                    {{ t('broadcastBox.disk') }}
                  </label>
                  <p class="text-sm font-semibold">
                    {{ health.metrics.diskPercent || 0 }}%
                  </p>
                </div>
              </div>
            </div>
          </UCard>

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
