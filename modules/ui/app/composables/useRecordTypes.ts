import { ref, computed, readonly } from 'vue';

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
  const recordTypes = ref<RecordTypeMetadata[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchRecordTypes = async () => {
    loading.value = true;
    error.value = null;

    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/config/record-types'
      )) as RecordTypesResponse;

      if (response.success && response.data) {
        recordTypes.value = response.data.record_types || [];
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch record types';
      console.error('Error fetching record types:', err);
    } finally {
      loading.value = false;
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
    // Map record types to colors (UI-specific concern)
    const colorMap: Record<string, string> = {
      bylaw: 'primary',
      ordinance: 'primary',
      policy: 'primary',
      proclamation: 'primary',
      resolution: 'primary',
    };
    return colorMap[key] || 'neutral';
  };

  const recordTypeOptions = computed(() => {
    return [
      { value: '', label: 'All Types' },
      ...recordTypes.value.map((type) => ({
        value: type.key,
        label: type.label,
      })),
    ];
  });

  const sortedRecordTypes = computed(() => {
    return [...recordTypes.value].sort((a, b) => a.priority - b.priority);
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
