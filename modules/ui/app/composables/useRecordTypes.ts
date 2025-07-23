import { ref, readonly } from 'vue';

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
  const fetched = ref(false); // Cache flag

  const fetchRecordTypes = async () => {
    // Skip if already fetched
    if (fetched.value && recordTypes.value.length > 0) {
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/config/record-types'
      )) as RecordTypesResponse;

      if (response.success && response.data) {
        recordTypes.value = response.data.record_types || [];
        fetched.value = true;
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
    return [
      { label: 'All Types', value: '', type: 'item' },
      ...recordTypes.value.map((type) => ({
        label: type.label,
        value: type.key,
        type: 'item',
        icon: getRecordTypeIcon(type.key),
      })),
    ];
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
