<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">
          {{ t('broadcastBox.recordingControls') }}
        </h3>
        <SessionStatusBadge v-if="session" :status="session.status" />
      </div>
    </template>

    <div class="space-y-4">
      <!-- Device Selector: locked to session device when recording/pending/stopping -->
      <UFormField
        v-if="!deviceId"
        :label="t('broadcastBox.selectDevice')"
        :description="t('broadcastBox.selectDeviceDesc')"
        required
      >
        <USelectMenu
          v-model="selectedDeviceOption"
          :items="deviceOptions"
          value-attribute="value"
          :placeholder="t('broadcastBox.selectDevice')"
          :loading="devicesLoading"
          :disabled="devicesLoading || isDeviceLockedBySession"
        />
      </UFormField>

      <!-- Current Device Info -->
      <div
        v-if="currentDevice"
        class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium">{{ currentDevice.name }}</span>
          <ConnectionStatusIndicator
            :connected="isDeviceConnected(currentDevice)"
            :last-seen-at="currentDevice.lastSeenAt"
            :show-label="true"
          />
        </div>
        <div v-if="currentDevice.roomLocation" class="text-sm text-gray-600">
          <UIcon name="i-lucide-map-pin" class="w-4 h-4 inline mr-1" />
          {{ currentDevice.roomLocation }}
        </div>
      </div>

      <!-- Recording Status -->
      <div v-if="session" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600">{{
            t('broadcastBox.sessionStatus')
          }}</span>
          <SessionStatusBadge :status="session.status" />
        </div>
        <div v-if="session.startedAt" class="text-xs text-gray-500">
          {{ t('broadcastBox.startedAt') }}: {{ formatDate(session.startedAt) }}
        </div>
      </div>

      <!-- Control Buttons -->
      <div class="flex gap-3 pt-4">
        <UButton
          v-if="
            !session ||
            session.status === 'complete' ||
            session.status === 'failed'
          "
          color="primary"
          icon="i-lucide-circle"
          :loading="starting"
          :disabled="!canStartRecording || !selectedDeviceId"
          @click="handleStart"
          class="flex-1"
        >
          {{ t('broadcastBox.startRecording') }}
        </UButton>

        <UButton
          v-if="
            session &&
            (session.status === 'recording' ||
              session.status === 'pending' ||
              session.status === 'stopping')
          "
          color="error"
          icon="i-lucide-square"
          :loading="stopping"
          :disabled="!canStopRecording && session?.status !== 'stopping'"
          @click="handleStop"
          class="flex-1"
        >
          {{
            session?.status === 'stopping'
              ? t('broadcastBox.stoppingSession')
              : t('broadcastBox.stopRecording')
          }}
        </UButton>
      </div>

      <!-- Error Display -->
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="t('broadcastBox.errors.operationFailed')"
        :description="error"
        icon="i-lucide-alert-circle"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type {
  BroadcastDevice,
  BroadcastSession,
} from '~/composables/useBroadcastBox';
import { useBroadcastBox } from '~/composables/useBroadcastBox';
import SessionStatusBadge from './SessionStatusBadge.vue';
import ConnectionStatusIndicator from './ConnectionStatusIndicator.vue';
import { useRecordUtils } from '~/composables/useRecordUtils';

const props = defineProps<{
  deviceId?: string;
  civicpressSessionId: string;
  session?: BroadcastSession | null;
}>();

const emit = defineEmits<{
  started: [session: BroadcastSession];
  stopped: [session: BroadcastSession];
  error: [error: string];
}>();

const { t } = useI18n();
const { formatDate } = useRecordUtils();
const { listDevices, startSession, stopSession } = useBroadcastBox();

const devices = ref<BroadcastDevice[]>([]);
const devicesLoading = ref(false);
const selectedDeviceOption = ref<
  { label: string; value: string; device: BroadcastDevice } | undefined
>(undefined);
const starting = ref(false);
const stopping = ref(false);
const error = ref('');

const selectedDeviceId = computed(() => {
  return selectedDeviceOption.value?.value || props.deviceId || '';
});

const currentDevice = computed(() => {
  const deviceId = selectedDeviceId.value;
  return devices.value.find((d) => d.id === deviceId);
});

const deviceOptions = computed(() => {
  return devices.value.map((device) => ({
    label: device.name,
    value: device.id,
    device,
  }));
});

const canStartRecording = computed(() => {
  if (!currentDevice.value) return false;
  return (
    currentDevice.value.status === 'active' &&
    isDeviceConnected(currentDevice.value)
  );
});

const canStopRecording = computed(() => {
  return (
    props.session?.status === 'recording' ||
    props.session?.status === 'pending' ||
    props.session?.status === 'stopping'
  );
});

/** When there is an active session, lock dropdown to the session's device so "selected device" always matches "device recording" */
const isDeviceLockedBySession = computed(() => {
  if (!props.session?.deviceId) return false;
  return (
    props.session.status === 'recording' ||
    props.session.status === 'pending' ||
    props.session.status === 'stopping'
  );
});

const isDeviceConnected = (device: BroadcastDevice): boolean => {
  if (device.status !== 'active') {
    return false;
  }

  if (!device.lastSeenAt) {
    return false;
  }

  const lastSeen = new Date(device.lastSeenAt);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

  return diffMinutes < 5;
};

/** Sync selected device to the session's device when there is an active session (so UI always shows "this session is on this device") */
function syncSelectedDeviceToSession() {
  if (
    !props.session?.deviceId ||
    (props.session.status !== 'recording' &&
      props.session.status !== 'pending' &&
      props.session.status !== 'stopping')
  ) {
    return;
  }
  const device = devices.value.find((d) => d.id === props.session!.deviceId);
  if (device) {
    selectedDeviceOption.value = {
      label: device.name,
      value: device.id,
      device,
    };
  }
}

const loadDevices = async () => {
  devicesLoading.value = true;
  try {
    // Fetch all devices so the dropdown is never empty (enrolled + active); Start is disabled for non-active/disconnected
    devices.value = await listDevices();
    if (props.deviceId && !selectedDeviceOption.value) {
      const device = devices.value.find((d) => d.id === props.deviceId);
      if (device) {
        selectedDeviceOption.value = {
          label: device.name,
          value: device.id,
          device,
        };
      }
    }
    syncSelectedDeviceToSession();
  } catch (err: any) {
    error.value = err.message || t('broadcastBox.errors.loadDevicesFailed');
  } finally {
    devicesLoading.value = false;
  }
};

const handleStart = async () => {
  const deviceId = selectedDeviceOption.value?.value || props.deviceId;
  if (!deviceId) {
    error.value = t('broadcastBox.errors.noDeviceSelected');
    return;
  }

  starting.value = true;
  error.value = '';

  try {
    const session = await startSession({
      deviceId,
      civicpressSessionId: props.civicpressSessionId,
    });
    emit('started', session);
  } catch (err: any) {
    error.value = err.message || t('broadcastBox.errors.startFailed');
    emit('error', error.value);
  } finally {
    starting.value = false;
  }
};

const handleStop = async () => {
  if (!props.session) {
    error.value = t('broadcastBox.errors.noSession');
    return;
  }

  stopping.value = true;
  error.value = '';

  try {
    const session = await stopSession(props.session.id);
    emit('stopped', session);
  } catch (err: any) {
    error.value = err.message || t('broadcastBox.errors.stopFailed');
    emit('error', error.value);
  } finally {
    stopping.value = false;
  }
};

onMounted(() => {
  loadDevices();
});

watch(
  () => [props.session?.id, props.session?.deviceId, props.session?.status],
  () => {
    syncSelectedDeviceToSession();
  },
  { immediate: true }
);
</script>
