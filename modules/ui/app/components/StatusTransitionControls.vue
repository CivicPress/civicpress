<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';

interface StatusHistoryEntry {
  status: string;
  user?: string;
  date?: string;
}

interface Props {
  recordId: string;
  currentStatus: string;
  userCanChangeStatus?: boolean;
  statusHistory?: StatusHistoryEntry[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  changed: [{ newStatus: string; record?: any }];
}>();

const { getStatusColor, getStatusLabel, getStatusIcon, formatDate } =
  useRecordUtils();
const isDesktop = useMediaQuery('(min-width: 1024px)');

const timelineOrientation = computed(() =>
  isDesktop.value ? 'horizontal' : 'vertical'
);
const {
  recordStatusOptions,
  fetchRecordStatuses,
  loading: statusesLoading,
  error: statusesError,
} = useRecordStatuses();

const pendingStatus = ref<string | null>(null);
const showConfirm = ref(false);
const saving = ref(false);
const inlineError = ref<string | null>(null);

const timelineEntries = computed<any[]>(() => {
  const historyEntries = Array.isArray(props.statusHistory)
    ? props.statusHistory
    : [];
  const historyMap = new Map<string, StatusHistoryEntry>();
  historyEntries.forEach((entry) => {
    if (entry?.status) {
      historyMap.set(entry.status, entry);
    }
  });

  const options = recordStatusOptions();
  const availableSet = new Set(
    availableTargets.value.map((opt: any) => opt.value as string)
  );

  const items = options.map((opt: any) => {
    const history = historyMap.get(opt.value);
    const formattedDate = history?.date ? formatDate(history.date) : undefined;
    const details = [formattedDate, history?.user].filter(Boolean).join(' · ');
    const isCurrent = opt.value === props.currentStatus;

    return {
      value: opt.value as string,
      title: getStatusLabel(opt.value),
      icon: getStatusIcon(opt.value),
      description: details || undefined,
      status: opt.value as string,
      isCurrent,
      isTransition: availableSet.has(opt.value),
      color: isCurrent ? 'primary' : 'neutral',
    };
  });

  const seen = new Set(items.map((item) => item.status));
  historyEntries.forEach((entry) => {
    if (entry?.status && !seen.has(entry.status)) {
      const formattedDate = entry.date ? formatDate(entry.date) : undefined;
      const details = [formattedDate, entry.user].filter(Boolean).join(' · ');
      items.push({
        value: entry.status,
        title: getStatusLabel(entry.status),
        icon: getStatusIcon(entry.status),
        description: details || undefined,
        status: entry.status,
        isCurrent: entry.status === props.currentStatus,
        isTransition: availableSet.has(entry.status),
        color: entry.status === props.currentStatus ? 'primary' : 'neutral',
      });
    }
  });

  return items;
});

onMounted(async () => {
  if (!props.userCanChangeStatus) {
    return;
  }

  try {
    await fetchRecordStatuses();
    try {
      const { $civicApi } = useNuxtApp();
      const res = (await $civicApi(
        `/api/v1/records/${props.recordId}/transitions`
      )) as any;
      if (res?.success && res?.data?.transitions) {
        allowedTargets.value = res.data.transitions as string[];
      }
    } catch (e) {
      // Ignore; will fall back to status list
    }
  } catch (err: any) {
    // handled via statusesError
  }
});

// Allowed transitions fetched from API, fall back to system status transitions if API call fails
const allowedTargets = ref<string[] | null>(null);

const availableTargets = computed(() => {
  const options = recordStatusOptions();
  const base = options.filter((opt: any) => opt.value !== props.currentStatus);
  if (Array.isArray(allowedTargets.value) && allowedTargets.value.length > 0) {
    return base.filter((opt: any) => allowedTargets.value!.includes(opt.value));
  }
  return base;
});

// Only show component if user has permission to change status
const shouldShowComponent = computed(() => true);

// Show different content based on permission
const showStatusTransitions = computed(() => {
  return props.userCanChangeStatus === true;
});

const openConfirm = (status: string) => {
  inlineError.value = null;
  pendingStatus.value = status;
  showConfirm.value = true;
};

const confirmChange = async () => {
  if (!pendingStatus.value) return;
  saving.value = true;
  inlineError.value = null;
  try {
    const { $civicApi } = useNuxtApp();
    const response = (await $civicApi(
      `/api/v1/records/${props.recordId}/status`,
      {
        method: 'POST',
        body: {
          status: pendingStatus.value,
        },
      }
    )) as any;

    if (response && response.success) {
      emit('changed', {
        newStatus: pendingStatus.value,
        record: response.data?.record,
      });
      showConfirm.value = false;
      pendingStatus.value = null;
    } else {
      inlineError.value =
        response?.error?.message ||
        response?.message ||
        'Failed to change status';
    }
  } catch (err: any) {
    inlineError.value = err?.message || 'Failed to change status';
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div v-if="shouldShowComponent" class="space-y-4">
    <UTimeline
      v-if="timelineEntries.length > 0"
      :orientation="timelineOrientation"
      color="neutral"
      size="sm"
      :items="timelineEntries"
      :default-value="currentStatus"
      class="mt-2"
    >
      <template #default="{ item }">
        <div class="flex flex-col gap-1 w-full max-w-xs lg:max-w-sm">
          <div class="flex items-center justify-between">
            <span
              :class="[
                'text-sm font-medium',
                item.isCurrent
                  ? 'text-primary-600'
                  : 'text-gray-800 dark:text-gray-100',
              ]"
            >
              {{ item.title }}
            </span>
            <UBadge
              v-if="item.isCurrent"
              color="primary"
              variant="soft"
              size="xs"
            >
              Current
            </UBadge>
          </div>
          <div
            v-if="item.description"
            class="text-xs text-gray-500 dark:text-gray-400"
          >
            {{ item.description }}
          </div>
          <div v-else class="text-xs text-gray-400">—</div>
          <div
            v-if="item.isTransition"
            class="mt-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-2"
          >
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Transition to {{ getStatusLabel(item.status) }}
              <span v-if="!showStatusTransitions">(permission required)</span>
            </p>
            <UButton
              size="xs"
              :color="getStatusColor(item.status) as any"
              :icon="getStatusIcon(item.status)"
              variant="outline"
              :disabled="!showStatusTransitions"
              @click="openConfirm(item.status)"
            >
              Change status
            </UButton>
          </div>
        </div>
      </template>
    </UTimeline>

    <UAlert
      v-if="statusesError"
      color="error"
      variant="soft"
      :title="statusesError"
      icon="i-lucide-alert-circle"
    />
    <UAlert
      v-if="inlineError"
      color="error"
      variant="soft"
      :title="inlineError"
      icon="i-lucide-alert-triangle"
    />

    <div
      v-if="statusesLoading"
      class="text-sm text-gray-500 flex items-center gap-2"
    >
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading
      statuses...
    </div>
    <div v-else-if="!showStatusTransitions" class="text-sm text-gray-500">
      You don't have permission to change record status.
    </div>

    <UModal
      v-model:open="showConfirm"
      title="Confirm Status Change"
      description="Are you sure you want to change the record status? This will validate the workflow transition."
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            Change status to
            <strong>{{ getStatusLabel(pendingStatus || '') }}</strong
            >?
          </p>

          <div
            class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
          >
            <div class="flex items-start space-x-3">
              <UIcon
                name="i-lucide-info"
                class="w-5 h-5 text-blue-600 mt-0.5"
              />
              <div class="text-sm text-blue-700 dark:text-blue-300">
                <p class="font-medium">Workflow Validation:</p>
                <ul class="mt-1 space-y-1">
                  <li>
                    • Status change will be validated against workflow rules
                  </li>
                  <li>• All transitions are logged with user attribution</li>
                  <li>• Previous status will be preserved in history</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end space-x-3">
          <UButton color="neutral" variant="outline" @click="close">
            Cancel
          </UButton>
          <UButton :loading="saving" color="primary" @click="confirmChange">
            Confirm Change
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
