import { ref, readonly } from 'vue';

// Define the interface locally
export interface RecordTypeMetadata {
  key: string;
  label: string;
  description: string;
  source: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority: number;
}

// Global state to avoid multiple fetches
let globalRecordTypes: RecordTypeMetadata[] = [];
let globalError: string | null = null;
let globalFetched = false;

export function useRecordTypes() {
  const recordTypes = ref<RecordTypeMetadata[]>(globalRecordTypes);
  const loading = ref(!globalFetched);
  const error = ref<string | null>(globalError);
  const fetched = ref(globalFetched);

  // Get icons from central registry
  const { getIcon } = useIcons();

  const fetchRecordTypes = async () => {
    // Skip if already fetched globally
    if (globalFetched && globalRecordTypes.length > 0) {
      recordTypes.value = globalRecordTypes;
      loading.value = false;
      error.value = globalError;
      fetched.value = globalFetched;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/v1/system/record-types'
      )) as {
        success: boolean;
        data: {
          record_types: RecordTypeMetadata[];
          total: number;
        };
      };

      // Extract the record_types from the nested response
      const recordTypesData = response.data?.record_types || [];
      recordTypes.value = recordTypesData;
      globalRecordTypes = recordTypesData;
      globalError = null;
      globalFetched = true;
      fetched.value = true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch record types';
      error.value = errorMessage;
      globalError = errorMessage;
    } finally {
      loading.value = false;
    }
  };

  const getRecordTypeByKey = (key: string): RecordTypeMetadata | undefined => {
    return recordTypes.value.find(
      (type: RecordTypeMetadata) => type.key === key
    );
  };

  const getRecordTypeLabel = (key: string): string => {
    const recordType = getRecordTypeByKey(key);
    return recordType?.label || key;
  };

  const getRecordTypeDescription = (key: string): string => {
    const recordType = getRecordTypeByKey(key);
    return recordType?.description || '';
  };

  const getRecordTypeIcon = (key: string) => {
    // Map record types to icon registry keys
    const typeIconMap: Record<string, string> = {
      bylaw: 'bylaw',
      policy: 'policy',
      resolution: 'resolution',
      ordinance: 'ordinance',
      proclamation: 'proclamation',
      regulation: 'regulation',
      directive: 'directive',
      guideline: 'guideline',
    };

    const iconKey = typeIconMap[key];
    return iconKey ? getIcon(iconKey as any) : getIcon('file');
  };

  const getRecordTypeColor = (key: string) => {
    // Map record types to colors (UI-specific concern)
    const colorMap: Record<string, string> = {
      bylaw: 'primary',
      ordinance: 'primary',
      policy: 'blue',
      resolution: 'green',
      proclamation: 'orange',
      regulation: 'purple',
      directive: 'indigo',
      guideline: 'gray',
    };

    return colorMap[key] || 'gray';
  };

  const getRecordTypeOptions = () => {
    return recordTypes.value.map((type: RecordTypeMetadata) => ({
      value: type.key,
      label: type.label,
      description: type.description,
      icon: getRecordTypeIcon(type.key),
      color: getRecordTypeColor(type.key),
    }));
  };

  const isValidRecordType = (type: string): boolean => {
    if (!type) return false;
    return recordTypes.value.some((rt: RecordTypeMetadata) => rt.key === type);
  };

  const getAvailableRecordTypes = (): string[] => {
    return recordTypes.value.map((type: RecordTypeMetadata) => type.key);
  };

  return {
    // State
    recordTypes: readonly(recordTypes),
    loading: readonly(loading),
    error: readonly(error),
    fetched: readonly(fetched),

    // Actions
    fetchRecordTypes,

    // Utilities
    getRecordTypeByKey,
    getRecordTypeLabel,
    getRecordTypeDescription,
    getRecordTypeIcon,
    getRecordTypeColor,
    getRecordTypeOptions,
    isValidRecordType,
    getAvailableRecordTypes,
  };
}
