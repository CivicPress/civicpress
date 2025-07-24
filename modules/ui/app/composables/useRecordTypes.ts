import { ref, readonly } from 'vue';

// Global cache for record types
let globalRecordTypes: RecordTypeMetadata[] = [];
let globalFetched = false;
let globalLoading = false;
let globalError: string | null = null;

export interface RecordTypeMetadata {
  key: string;
  label: string;
  description: string;
  source: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority: number;
}

export interface RecordTypesResponse {
  success: boolean;
  data: {
    record_types: RecordTypeMetadata[];
    total: number;
  };
}

export function useRecordTypes() {
  const recordTypes = ref<RecordTypeMetadata[]>(globalRecordTypes);
  const loading = ref(globalLoading);
  const error = ref<string | null>(globalError);
  const fetched = ref(globalFetched);

  const fetchRecordTypes = async () => {
    // Skip if already fetched globally
    if (globalFetched && globalRecordTypes.length > 0) {
      recordTypes.value = globalRecordTypes;
      loading.value = false;
      error.value = null;
      fetched.value = true;
      return;
    }

    // Skip if already fetched locally
    if (fetched.value && recordTypes.value.length > 0) {
      return;
    }

    loading.value = true;
    error.value = null;
    globalLoading = true;
    globalError = null;

    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/config/record-types'
      )) as RecordTypesResponse;

      if (response.success && response.data) {
        const newRecordTypes = response.data.record_types || [];
        recordTypes.value = newRecordTypes;
        fetched.value = true;

        // Update global cache
        globalRecordTypes = newRecordTypes;
        globalFetched = true;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch record types';
      error.value = errorMessage;
      globalError = errorMessage;
      console.error('Error fetching record types:', err);
    } finally {
      loading.value = false;
      globalLoading = false;
    }
  };

  // Auto-fetch on first access
  const ensureData = async () => {
    if (!fetched.value) {
      await fetchRecordTypes();
    }
  };

  const getRecordTypeByKey = (key: string) => {
    return recordTypes.value.find((type) => type.key === key);
  };

  const getRecordTypeLabel = (key: string) => {
    const recordType = getRecordTypeByKey(key);
    return recordType?.label || key;
  };

  const getRecordTypeDescription = (key: string) => {
    const recordType = getRecordTypeByKey(key);
    return recordType?.description || '';
  };
  const getRecordTypeIcon = (key: string) => {
    // Map record types to icons (UI-specific concern)
    const iconMap: Record<string, string> = {
      bylaw: 'i-lucide-file-text',
      ordinance: 'i-lucide-gavel',
      policy: 'i-lucide-book-open',
      proclamation: 'i-lucide-megaphone',
      resolution: 'i-lucide-vote',
    };
    return iconMap[key] || 'i-lucide-file';
  };

  const getRecordTypeColor = (key: string) => {
    // Map record types to colors (UI-secifi concern)
    const colorMap: Record<string, string> = {
      bylaw: 'primary',
      ordinance: 'primary',
      policy: 'primary',
      proclamation: 'primary',
      resolution: 'primary',
    };
    return colorMap[key] || 'neutral';
  };

  const recordTypeOptions = () => {
    return recordTypes.value.map((type) => ({
      label: type.label,
      value: type.key,
      type: 'item',
      icon: getRecordTypeIcon(type.key),
    }));
  };

  const sortedRecordTypes = () => {
    return [...recordTypes.value].sort((a, b) => a.priority - b.priority);
  };

  onMounted(() => {
    ensureData();
  });

  return {
    recordTypes: readonly(recordTypes),
    loading: readonly(loading),
    error: readonly(error),
    fetchRecordTypes,
    getRecordTypeByKey,
    getRecordTypeLabel,
    getRecordTypeDescription,
    getRecordTypeIcon,
    getRecordTypeColor,
    recordTypeOptions,
    sortedRecordTypes,
  };
}
