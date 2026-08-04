<script setup lang="ts">
import SystemFooter from '~/components/SystemFooter.vue';
// Import the composable explicitly (not via auto-import): pulling `type`s from
// this file below would otherwise suppress the auto-import of useBroadcastBox.
import {
  useBroadcastBox,
  type BroadcastDevice,
  type BroadcastSession,
} from '~/composables/useBroadcastBox';

const { t } = useI18n();
const authStore = useAuthStore();
const toast = useToast();
const ready = computed(() => authStore.isInitialized);
const bb = useBroadcastBox();

const canEnroll = computed(() =>
  authStore.hasPermission('broadcast-box:devices:enroll')
);
const canCreateSessions = computed(() =>
  authStore.hasPermission('broadcast-box:sessions:create')
);
const canManageSessions = computed(() =>
  authStore.hasPermission('broadcast-box:sessions:manage')
);

const devices = ref<BroadcastDevice[]>([]);
const sessions = ref<BroadcastSession[]>([]);
const redaction = ref<Record<string, string>>({});
const loading = ref(true);
const error = ref('');

const refresh = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [d, s] = await Promise.all([bb.listDevices(), bb.listSessions()]);
    devices.value = d;
    sessions.value = s;
    const statuses = await Promise.all(
      s.map((sess: BroadcastSession) =>
        bb.getRedactionStatus(sess.civicpressSessionId)
      )
    );
    const next: Record<string, string> = {};
    s.forEach((sess: BroadcastSession, i: number) => {
      const st = statuses[i];
      if (st) next[sess.civicpressSessionId] = st;
    });
    redaction.value = next;
  } catch (err: unknown) {
    error.value =
      (err instanceof Error ? err.message : '') ||
      t('settings.broadcastBox.loadFailed');
  } finally {
    loading.value = false;
  }
};

// --- Enroll a device ---
const enrollOpen = ref(false);
const enrollName = ref('');
const enrollRoom = ref('');
const enrollBusy = ref(false);
const enrollResult = ref<{
  deviceUuid: string;
  enrollmentCode: string;
  expiresAt: string;
} | null>(null);

const openEnroll = () => {
  enrollName.value = '';
  enrollRoom.value = '';
  enrollResult.value = null;
  enrollOpen.value = true;
};

const submitEnroll = async () => {
  if (!enrollName.value.trim()) return;
  enrollBusy.value = true;
  try {
    enrollResult.value = await bb.enrollDevice({
      name: enrollName.value.trim(),
      roomLocation: enrollRoom.value.trim() || undefined,
    });
    toast.add({
      title: t('common.success'),
      description: t('settings.broadcastBox.deviceEnrolled'),
      color: 'primary',
    });
    await refresh();
  } catch (err: unknown) {
    // $civicApi already surfaces the error toast; keep the modal open.
    console.error('Enroll failed:', err);
  } finally {
    enrollBusy.value = false;
  }
};

// --- Start a session ---
const startOpen = ref(false);
const startDeviceId = ref<string | undefined>(undefined);
const startTitle = ref('');
const startBusy = ref(false);
const deviceOptions = computed(() =>
  devices.value.map((d) => ({ label: `${d.name} (${d.status})`, value: d.id }))
);

const openStart = () => {
  startDeviceId.value = devices.value[0]?.id;
  startTitle.value = '';
  startOpen.value = true;
};

const submitStart = async () => {
  if (!startDeviceId.value) return;
  startBusy.value = true;
  try {
    await bb.quickStartSession({
      deviceId: startDeviceId.value,
      title: startTitle.value.trim() || undefined,
    });
    toast.add({
      title: t('common.success'),
      description: t('settings.broadcastBox.sessionStarted'),
      color: 'primary',
    });
    startOpen.value = false;
    await refresh();
  } catch (err: unknown) {
    console.error('Start session failed:', err);
  } finally {
    startBusy.value = false;
  }
};

// --- Stop a session ---
const stopBusyId = ref<string | null>(null);
const stop = async (sess: BroadcastSession) => {
  stopBusyId.value = sess.id;
  try {
    await bb.stopSession(sess.id);
    toast.add({
      title: t('common.success'),
      description: t('settings.broadcastBox.sessionStopped'),
      color: 'primary',
    });
    await refresh();
  } catch (err: unknown) {
    console.error('Stop session failed:', err);
  } finally {
    stopBusyId.value = null;
  }
};

const isActive = (s: BroadcastSession) =>
  ['pending', 'recording', 'stopping', 'encoding', 'uploading'].includes(
    s.status
  );

const deviceColor = (s: string) =>
  s === 'active'
    ? 'success'
    : s === 'enrolled'
      ? 'info'
      : s === 'revoked' || s === 'decommissioned'
        ? 'error'
        : 'neutral';
const sessionColor = (s: string) =>
  s === 'complete'
    ? 'success'
    : s === 'failed'
      ? 'error'
      : s === 'recording'
        ? 'warning'
        : 'neutral';
const redactionColor = (s?: string) =>
  s === 'complete'
    ? 'success'
    : s === 'awaiting_visibility'
      ? 'error'
      : s === 'pending'
        ? 'warning'
        : 'neutral';

const sessionTitle = (s: BroadcastSession) =>
  (s.metadata?.title as string) || s.civicpressSessionId;
const formatDate = (d?: string) => (d ? new Date(d).toLocaleString() : '—');

const breadcrumbItems = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('common.settings'), to: '/settings' },
  { label: t('settings.broadcastBox.title') },
]);

definePageMeta({
  middleware: ['require-auth', 'require-broadcast-box'],
});

onMounted(refresh);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('settings.broadcastBox.title') }}
          </h1>
        </template>
        <template #description>
          {{ t('settings.broadcastBox.description') }}
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="loading"
            @click="refresh"
          >
            {{ t('settings.broadcastBox.refresh') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <div v-if="!ready || loading" class="py-12 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>

      <UAlert
        v-else-if="error"
        :title="error"
        color="error"
        variant="soft"
        class="mb-6"
      />

      <template v-else>
        <!-- Devices -->
        <UCard class="mb-6 overflow-visible">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  {{ t('settings.broadcastBox.devices') }}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('settings.broadcastBox.devicesDescription') }}
                </p>
              </div>
              <UButton
                v-if="canEnroll"
                icon="i-lucide-plus"
                color="primary"
                @click="openEnroll"
              >
                {{ t('settings.broadcastBox.enrollDevice') }}
              </UButton>
            </div>
          </template>

          <div
            v-if="devices.length === 0"
            class="py-6 text-center text-gray-500"
          >
            {{ t('settings.broadcastBox.noDevices') }}
          </div>
          <div v-else class="grid gap-3">
            <div
              v-for="d in devices"
              :key="d.id"
              class="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-3"
            >
              <div>
                <div class="font-medium">{{ d.name }}</div>
                <div class="text-xs text-gray-500">
                  {{ d.roomLocation || '—' }} ·
                  {{ t('settings.broadcastBox.lastSeen') }}
                  {{ formatDate(d.lastSeenAt) }}
                </div>
              </div>
              <UBadge :color="deviceColor(d.status)" variant="soft">
                {{ d.status }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <!-- Sessions -->
        <UCard class="overflow-visible">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  {{ t('settings.broadcastBox.sessions') }}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('settings.broadcastBox.sessionsDescription') }}
                </p>
              </div>
              <UButton
                v-if="canCreateSessions"
                icon="i-lucide-circle-play"
                color="primary"
                :disabled="devices.length === 0"
                @click="openStart"
              >
                {{ t('settings.broadcastBox.startSession') }}
              </UButton>
            </div>
          </template>

          <div
            v-if="sessions.length === 0"
            class="py-6 text-center text-gray-500"
          >
            {{ t('settings.broadcastBox.noSessions') }}
          </div>
          <div v-else class="grid gap-3">
            <div
              v-for="s in sessions"
              :key="s.id"
              class="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-3"
            >
              <div class="min-w-0">
                <div class="font-medium truncate">{{ sessionTitle(s) }}</div>
                <div class="text-xs text-gray-500">
                  {{ t('settings.broadcastBox.started') }}
                  {{ formatDate(s.startedAt) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UBadge :color="sessionColor(s.status)" variant="soft">
                  {{ s.status }}
                </UBadge>
                <UBadge
                  v-if="redaction[s.civicpressSessionId]"
                  :color="redactionColor(redaction[s.civicpressSessionId])"
                  variant="soft"
                >
                  {{ t('settings.broadcastBox.redaction') }}:
                  {{ redaction[s.civicpressSessionId] }}
                </UBadge>
                <UButton
                  :to="`/records/session/${s.civicpressSessionId}`"
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-external-link"
                >
                  {{ t('settings.broadcastBox.viewRecord') }}
                </UButton>
                <UButton
                  v-if="canManageSessions && isActive(s)"
                  size="sm"
                  color="error"
                  variant="soft"
                  icon="i-lucide-circle-stop"
                  :loading="stopBusyId === s.id"
                  @click="stop(s)"
                >
                  {{ t('settings.broadcastBox.stop') }}
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </template>

      <!-- Enroll device modal -->
      <UModal
        v-model:open="enrollOpen"
        :title="t('settings.broadcastBox.enrollDevice')"
        :description="t('settings.broadcastBox.enrollDescription')"
      >
        <template #body>
          <div v-if="!enrollResult" class="space-y-4">
            <UFormField :label="t('settings.broadcastBox.deviceName')" required>
              <UInput
                v-model="enrollName"
                :placeholder="t('settings.broadcastBox.deviceNamePlaceholder')"
              />
            </UFormField>
            <UFormField :label="t('settings.broadcastBox.roomLocation')">
              <UInput v-model="enrollRoom" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="enrollOpen = false"
              >
                {{ t('common.cancel') }}
              </UButton>
              <UButton
                color="primary"
                :loading="enrollBusy"
                :disabled="!enrollName.trim()"
                @click="submitEnroll"
              >
                {{ t('settings.broadcastBox.enroll') }}
              </UButton>
            </div>
          </div>

          <div v-else class="space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('settings.broadcastBox.enrollResultHelp') }}
            </p>
            <div class="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 space-y-2">
              <div>
                <div class="text-xs text-gray-500">
                  {{ t('settings.broadcastBox.enrollmentCode') }}
                </div>
                <code class="font-mono text-sm break-all">{{
                  enrollResult.enrollmentCode
                }}</code>
              </div>
              <div>
                <div class="text-xs text-gray-500">
                  {{ t('settings.broadcastBox.deviceUuid') }}
                </div>
                <code class="font-mono text-sm break-all">{{
                  enrollResult.deviceUuid
                }}</code>
              </div>
              <div class="text-xs text-gray-500">
                {{ t('settings.broadcastBox.expires') }}
                {{ formatDate(enrollResult.expiresAt) }}
              </div>
            </div>
            <div class="flex justify-end">
              <UButton color="primary" @click="enrollOpen = false">
                {{ t('settings.broadcastBox.done') }}
              </UButton>
            </div>
          </div>
        </template>
      </UModal>

      <!-- Start session modal -->
      <UModal
        v-model:open="startOpen"
        :title="t('settings.broadcastBox.startSession')"
        :description="t('settings.broadcastBox.startDescription')"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('settings.broadcastBox.device')" required>
              <USelectMenu
                v-model="startDeviceId"
                :items="deviceOptions"
                value-key="value"
                :placeholder="t('settings.broadcastBox.selectDevice')"
              />
            </UFormField>
            <UFormField :label="t('settings.broadcastBox.sessionTitle')">
              <UInput v-model="startTitle" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="startOpen = false">
                {{ t('common.cancel') }}
              </UButton>
              <UButton
                color="primary"
                :loading="startBusy"
                :disabled="!startDeviceId"
                @click="submitStart"
              >
                {{ t('settings.broadcastBox.start') }}
              </UButton>
            </div>
          </div>
        </template>
      </UModal>

      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>
