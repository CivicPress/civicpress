export interface RecordStatusMetadata {
  key: string;
  label: string;
  description: string;
  source: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority: number;
}

export interface RecordStatusesResponse {
  success: boolean;
  data: {
    record_statuses: RecordStatusMetadata[];
    total: number;
  };
}

import { ref, readonly } from 'vue';

// Global cache for record statuses
let globalRecordStatuses: RecordStatusMetadata[] = [];
let globalFetched = false;
let globalLoading = false;
let globalError: string | null = null;

export function useRecordStatuses() {
  const recordStatuses = ref<RecordStatusMetadata[]>(globalRecordStatuses);
  const loading = ref(globalLoading);
  const error = ref<string | null>(globalError);
  const fetched = ref(globalFetched);

  const fetchRecordStatuses = async () => {
    // Skip if already fetched globally
    if (globalFetched && globalRecordStatuses.length > 0) {
      recordStatuses.value = globalRecordStatuses;
      loading.value = false;
      error.value = null;
      fetched.value = true;
      return;
    }

    // Skip if already fetched locally
    if (fetched.value && recordStatuses.value.length > 0) {
      return;
    }

    loading.value = true;
    error.value = null;
    globalLoading = true;
    globalError = null;

    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/v1/system/record-statuses'
      )) as {
        success: boolean;
        data: {
          record_statuses: RecordStatusMetadata[];
          total: number;
        };
      };

      if (response.success && response.data) {
        const newRecordStatuses = response.data.record_statuses || [];
        recordStatuses.value = newRecordStatuses;
        fetched.value = true;

        // Update global cache
        globalRecordStatuses = newRecordStatuses;
        globalFetched = true;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch record statuses';
      error.value = errorMessage;
      globalError = errorMessage;
      console.error('Error fetching record statuses:', err);
    } finally {
      loading.value = false;
      globalLoading = false;
    }
  };

  // Auto-fetch on first access
  const ensureData = async () => {
    if (!fetched.value) {
      await fetchRecordStatuses();
    }
  };

  const recordStatusOptions = () => {
    return recordStatuses.value.map((status) => ({
      label: status.label,
      value: status.key,
      type: 'item',
      icon: getRecordStatusIcon(status.key),
    }));
  };

  const sortedRecordStatuses = () => {
    return [...recordStatuses.value].sort((a, b) => a.priority - b.priority);
  };

  const getRecordStatusByKey = (key: string) => {
    return recordStatuses.value.find((status) => status.key === key);
  };

  const getRecordStatusLabel = (key: string) => {
    const recordStatus = getRecordStatusByKey(key);
    return recordStatus?.label || key;
  };

  const getRecordStatusDescription = (key: string) => {
    const recordStatus = getRecordStatusByKey(key);
    return recordStatus?.description || '';
  };

  const getRecordStatusIcon = (key: string) => {
    // Map status keys to appropriate icons
    const iconMap: Record<string, string> = {
      draft: 'i-lucide-file-text',
      proposed: 'i-lucide-clock',
      reviewed: 'i-lucide-eye',
      approved: 'i-lucide-check-circle',
      active: 'i-lucide-play-circle',
      archived: 'i-lucide-archive',
      rejected: 'i-lucide-x-circle',
      expired: 'i-lucide-alert-circle',
    };
    return iconMap[key] || 'i-lucide-circle';
  };

  onMounted(() => {
    ensureData();
  });

  return {
    recordStatuses: readonly(recordStatuses),
    loading: readonly(loading),
    error: readonly(error),
    fetchRecordStatuses,
    getRecordStatusByKey,
    getRecordStatusLabel,
    getRecordStatusDescription,
    recordStatusOptions,
    sortedRecordStatuses,
  };
}
