<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Record activity feed. Shows the record's Git commit history (most recent
 * first) from `GET /api/v1/diff/:recordId/history`. A record with no committed
 * history yet — a draft that has never been published — 404s; that is an empty
 * feed, not an error, so only genuine failures surface the error state.
 */
interface Props {
  recordId?: string;
}
const props = defineProps<Props>();

const { t } = useI18n();
const $civicApi = useNuxtApp().$civicApi;

interface CommitActivity {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
  changes: string[];
}

const activities = ref<CommitActivity[]>([]);
const loading = ref(false);
const failed = ref(false);

const statusOf = (err: unknown): number | undefined => {
  const e = err as {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
  };
  return e?.statusCode ?? e?.status ?? e?.response?.status;
};

const loadActivity = async (recordId: string) => {
  loading.value = true;
  failed.value = false;
  try {
    const response = (await $civicApi(
      `/api/v1/diff/${recordId}/history?limit=20`
    )) as { data?: { commits?: CommitActivity[] } };
    activities.value = response?.data?.commits ?? [];
  } catch (err: unknown) {
    activities.value = [];
    // 404 = no committed history yet (unpublished draft) → empty, not an error.
    failed.value = statusOf(err) !== 404;
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.recordId,
  (id) => {
    if (id) {
      loadActivity(id);
    } else {
      activities.value = [];
      failed.value = false;
    }
  },
  { immediate: true }
);

/** First line of a commit message — the summary shown in the feed. */
const summaryOf = (message: string): string => message.split('\n')[0] ?? '';

const formatTimestamp = (date: string): string => {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleString();
};
</script>

<template>
  <div class="space-y-3">
    <h4 class="text-sm font-medium">{{ t('records.editor.activity') }}</h4>

    <div v-if="loading" class="text-center py-4">
      <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin mx-auto" />
    </div>

    <div v-else-if="failed" class="text-center py-4">
      <p class="text-xs text-gray-500">
        {{ t('records.editor.activityError') }}
      </p>
    </div>

    <div v-else-if="activities.length > 0" class="space-y-2">
      <div
        v-for="activity in activities"
        :key="activity.hash"
        class="text-xs text-gray-600 dark:text-gray-400"
      >
        <p class="font-medium text-gray-700 dark:text-gray-300">
          {{ summaryOf(activity.message) }}
        </p>
        <p class="text-gray-500">
          {{ activity.author }} · {{ formatTimestamp(activity.date) }}
        </p>
      </div>
    </div>

    <div v-else class="text-center py-4">
      <p class="text-xs text-gray-500">
        {{ t('records.editor.activityEmpty') }}
      </p>
    </div>
  </div>
</template>
