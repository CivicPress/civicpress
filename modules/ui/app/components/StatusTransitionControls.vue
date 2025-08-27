<script setup lang="ts">
interface Props {
  recordId: string;
  currentStatus: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  changed: [{ newStatus: string; record?: any }];
}>();

const { getStatusColor, getStatusLabel, getStatusIcon } = useRecordUtils();
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

onMounted(async () => {
  try {
    await fetchRecordStatuses();
    // Fetch allowed transitions for current user/record
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
  <div class="rounded-lg border">
    <div class="border-b px-6 py-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Status Transitions</h2>
      <UBadge :color="getStatusColor(currentStatus) as any" variant="soft">
        Current: {{ getStatusLabel(currentStatus) }}
      </UBadge>
    </div>

    <div class="p-6 space-y-4">
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

      <div class="flex flex-wrap gap-2" v-if="!statusesLoading">
        <UButton
          v-for="opt in availableTargets"
          :key="opt.value"
          :icon="getStatusIcon(opt.value)"
          :color="getStatusColor(opt.value) as any"
          variant="outline"
          size="sm"
          @click="openConfirm(opt.value)"
        >
          {{ getStatusLabel(opt.value) }}
        </UButton>
        <span v-if="availableTargets.length === 0" class="text-sm text-gray-500"
          >No available transitions</span
        >
      </div>

      <div v-else class="text-sm text-gray-500 flex items-center gap-2">
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading
        statuses...
      </div>
    </div>

    <UModal
      v-model="showConfirm"
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
