<template>
  <div class="broadcast-box-controls">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold">
        {{ t('broadcastBox.recordingControls') }}
      </h3>
      <UIcon name="i-lucide-video" class="w-5 h-5 text-gray-400" />
    </div>

    <!-- Show recording controls if session record -->
    <RecordingControls
      v-if="recordId"
      :device-id="broadcastDeviceId"
      :civicpress-session-id="recordId"
      :session="broadcastSession"
      @started="handleSessionStarted"
      @stopped="handleSessionStopped"
      @error="handleError"
    />

    <!-- Session Status Display -->
    <div
      v-if="broadcastSession"
      class="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
    >
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">{{
            t('broadcastBox.broadcastSession')
          }}</span>
          <SessionStatusBadge :status="broadcastSession.status" />
        </div>
        <div v-if="broadcastSession.startedAt" class="text-xs text-gray-600">
          {{ t('broadcastBox.startedAt') }}:
          {{ formatDate(broadcastSession.startedAt) }}
        </div>
        <div v-if="broadcastSession.error" class="text-xs text-red-600">
          {{ t('broadcastBox.error') }}: {{ broadcastSession.error }}
        </div>
      </div>
    </div>

    <!-- Device Info from Metadata -->
    <div
      v-if="broadcastDeviceId"
      class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
    >
      <div class="text-sm">
        <div class="font-medium text-blue-900 dark:text-blue-200 mb-1">
          {{ t('broadcastBox.linkedDevice') }}
        </div>
        <div class="text-blue-700 dark:text-blue-300">
          {{ t('broadcastBox.deviceId') }}: {{ broadcastDeviceId }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BroadcastSession } from '~/composables/useBroadcastBox';
import { useBroadcastBox } from '~/composables/useBroadcastBox';
import RecordingControls from './RecordingControls.vue';
import SessionStatusBadge from './SessionStatusBadge.vue';
import { useRecordUtils } from '~/composables/useRecordUtils';

const props = defineProps<{
  recordId?: string;
  metadata?: Record<string, any>;
}>();

const { t } = useI18n();
const { formatDate } = useRecordUtils();
const { getSession, listSessions } = useBroadcastBox();

const broadcastSession = ref<BroadcastSession | null>(null);
const loading = ref(false);

// Extract broadcast session info from metadata
const broadcastSessionId = computed(() => {
  return props.metadata?.broadcastSessionId;
});

const broadcastDeviceId = computed(() => {
  return props.metadata?.broadcastDeviceId;
});

const loadBroadcastSession = async () => {
  if (!broadcastSessionId.value) {
    // Try to find session by civicpressSessionId
    if (props.recordId) {
      try {
        const sessions = await listSessions({
          civicpressSessionId: props.recordId,
        });
        if (sessions.length > 0) {
          broadcastSession.value = sessions[0] || null;
          return;
        }
      } catch (error) {
        console.error('Failed to load broadcast sessions:', error);
      }
    }
    broadcastSession.value = null;
    return;
  }

  loading.value = true;
  try {
    const session = await getSession(broadcastSessionId.value);
    broadcastSession.value = session;
  } catch (error) {
    console.error('Failed to load broadcast session:', error);
    broadcastSession.value = null;
  } finally {
    loading.value = false;
  }
};

const handleSessionStarted = (session: BroadcastSession) => {
  broadcastSession.value = session;
  // Emit event to parent to update metadata
  // This would typically trigger a record update
};

const handleSessionStopped = (session: BroadcastSession) => {
  broadcastSession.value = session;
  // Emit event to parent to update metadata
};

const handleError = (error: string) => {
  console.error('Broadcast Box error:', error);
};

watch(
  () => [props.recordId, broadcastSessionId.value],
  () => {
    loadBroadcastSession();
  },
  { immediate: true }
);
</script>
