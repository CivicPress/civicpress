<script setup lang="ts">
import { useRecordTypes } from '~/composables/useRecordTypes';
import { useRecordStatuses } from '~/composables/useRecordStatuses';
import { useSearchSuggestions } from '~/composables/useSearchSuggestions';

// Props
interface Props {
  initialFilters?: {
    search?: string;
    types?: string[];
    statuses?: string[];
  };
  recordType?: string | null; // Pre-select a specific record type
  disableTypeFilter?: boolean; // Disable type filter (for type-specific pages)
}

const props = withDefaults(defineProps<Props>(), {
  initialFilters: () => ({}),
  recordType: null,
  disableTypeFilter: false,
});

// Emits
const emit = defineEmits<{
  search: [query: string];
  filterChange: [
    filters: { search: string; types: string[]; statuses: string[] },
  ];
}>();

// Composables
const {
  recordTypes,
  loading: recordTypesLoading,
  error: recordTypesError,
  fetchRecordTypes,
  getRecordTypeIcon,
  getRecordTypeLabel,
  getRecordTypeOptions,
} = useRecordTypes();

const {
  recordStatuses,
  loading: recordStatusesLoading,
  error: recordStatusesError,
  fetchRecordStatuses,
  getRecordStatusLabel,
  recordStatusOptions,
} = useRecordStatuses();

// Search suggestions composable
const {
  suggestions,
  isLoading: suggestionsLoading,
  error: suggestionsError,
  fetchSuggestions,
  clearSuggestions,
} = useSearchSuggestions();

// Record utilities composable
const { getTypeLabel, getStatusLabel } = useRecordUtils();

// i18n
const { t } = useI18n();

// Reactive data
const searchQuery = ref(props.initialFilters.search || '');
const selectedRecordTypes = ref<any[]>([]);
const selectedRecordStatuses = ref<any[]>([]);

// Track if we're syncing from props to prevent emitting during initial sync
const isSyncingFromProps = ref(false);

// Watch for changes to initialFilters.search prop (e.g., from URL restoration)
watch(
  () => props.initialFilters.search,
  (newSearch) => {
    if (newSearch !== undefined && newSearch !== searchQuery.value) {
      isSyncingFromProps.value = true;
      searchQuery.value = newSearch || '';
      // Reset flag after next tick to allow the searchQuery watch to skip emitting
      nextTick(() => {
        isSyncingFromProps.value = false;
      });
    }
  },
  { immediate: true }
);

// Initialize filters based on props
onMounted(async () => {
  await Promise.all([fetchRecordTypes(), fetchRecordStatuses()]);

  // Initialize filters
  if (props.initialFilters.types) {
    selectedRecordTypes.value = props.initialFilters.types.map((type) => ({
      value: type,
      label: getTypeLabel(type),
    }));
  }

  if (props.initialFilters.statuses) {
    selectedRecordStatuses.value = props.initialFilters.statuses.map(
      (status) => ({
        value: status,
        label: getStatusLabel(status),
      })
    );
  }

  // Pre-select record type if specified
  if (props.recordType) {
    const typeOption = recordTypeOptionsComputed.value.find(
      (option) => option.value === props.recordType
    );
    if (typeOption) {
      selectedRecordTypes.value = [typeOption];
    }
  }
});
// Facet counts from store
const recordsStore = useRecordsStore();
const typeFacetItems = computed(() => {
  const options = recordTypeOptionsComputed.value;
  const counts = recordsStore.facetCounts.types || {};
  return options.map((opt: any) => ({
    ...opt,
    label: `${opt.label} (${counts[opt.value] || 0})`,
  }));
});

const statusFacetItems = computed(() => {
  const options = recordStatusOptionsComputed.value;
  const counts = recordsStore.facetCounts.statuses || {};
  return options.map((opt: any) => ({
    ...opt,
    label: `${opt.label} (${counts[opt.value] || 0})`,
  }));
});

// Computed properties for select options
const recordTypeOptionsComputed = computed(() => {
  return getRecordTypeOptions().map((option: any) => {
    return {
      label: option.label,
      icon: option.icon,
      value: option.value,
    };
  });
});

const recordStatusOptionsComputed = computed(() => {
  return recordStatusOptions().map((option: any) => {
    return {
      label: option.label,
      icon: option.icon,
      value: option.value,
    };
  });
});

// Watch for changes and emit events (but skip if syncing from props)
watch(searchQuery, (newQuery) => {
  // Don't emit if we're syncing from props (prevents duplicate API calls on mount)
  if (isSyncingFromProps.value) return;

  emit('search', newQuery);
  emitFilterChange();

  // Fetch suggestions while typing (when query has 2+ characters)
  if (newQuery && newQuery.trim().length >= 2) {
    fetchSuggestions(newQuery);
  } else {
    clearSuggestions();
  }
});

watch(
  selectedRecordTypes,
  () => {
    emitFilterChange();
  },
  { deep: true }
);

watch(
  selectedRecordStatuses,
  () => {
    emitFilterChange();
  },
  { deep: true }
);

// Emit filter changes
const emitFilterChange = () => {
  const typeValues = selectedRecordTypes.value.map((item: any) =>
    typeof item === 'string' ? item : item.value || item.id
  );
  const statusValues = selectedRecordStatuses.value.map((item: any) =>
    typeof item === 'string' ? item : item.value || item.id
  );

  emit('filterChange', {
    search: searchQuery.value,
    types: typeValues,
    statuses: statusValues,
  });
};

// Search suggestions
const handleInputBlur = () => {
  if (searchQuery.value && searchQuery.value.trim().length >= 2) {
    fetchSuggestions(searchQuery.value);
  }
};

const handleSuggestionClick = (suggestion: string) => {
  searchQuery.value = suggestion;
  clearSuggestions();
};

const handleClickOutside = (event: Event) => {
  const target = event.target as Element;
  if (
    !target.closest('.search-suggestions-container') &&
    searchQuery.value &&
    searchQuery.value.trim()
  ) {
    clearSuggestions();
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="space-y-4">
    <!-- Search and Filters -->
    <div
      class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40 space-y-3"
    >
      <div class="sm:hidden">
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Filters
        </span>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <!-- Search Input with Suggestions -->
        <div class="flex-1 relative search-suggestions-container">
          <UInput
            v-model="searchQuery"
            @blur="handleInputBlur"
            :placeholder="t('records.filters.searchPlaceholder')"
            icon="i-lucide-search"
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="searchQuery?.length" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-circle-x"
                aria-label="Clear search"
                @click="searchQuery = ''"
              />
            </template>
          </UInput>

          <!-- Suggestions Dropdown -->
          <div
            v-if="suggestions.length > 0"
            class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
          >
            <div class="p-2">
              <div class="text-xs text-gray-500 mb-2 px-2">
                <UIcon name="i-lucide-lightbulb" class="w-3 h-3 inline mr-1" />
                {{ t('records.filters.suggestions') }}
              </div>
              <div
                v-for="suggestion in suggestions"
                :key="suggestion"
                class="px-3 py-2 hover:bg-gray-100 rounded cursor-pointer text-sm"
                @click="handleSuggestionClick(suggestion)"
              >
                <UIcon
                  name="i-lucide-search"
                  class="w-3 h-3 inline mr-2 text-gray-400"
                />
                {{ suggestion }}
              </div>
            </div>
          </div>

          <!-- Loading indicator for suggestions -->
          <div
            v-if="
              suggestionsLoading &&
              searchQuery &&
              searchQuery.trim().length >= 2
            "
            class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3"
          >
            <div class="flex items-center justify-center text-sm text-gray-500">
              <UIcon
                name="i-lucide-loader-2"
                class="w-4 h-4 animate-spin mr-2"
              />
              {{ t('records.filters.loadingSuggestions') }}
            </div>
          </div>
        </div>

        <USelectMenu
          v-if="!disableTypeFilter"
          v-model="selectedRecordTypes"
          :items="typeFacetItems"
          multiple
          :loading="recordTypesLoading"
          :placeholder="t('records.filters.filterByTypePlaceholder')"
          class="w-full sm:w-48"
        >
          <template #trailing>
            <UButton
              v-if="selectedRecordTypes.length > 0"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="selectedRecordTypes = []"
            />
          </template>
        </USelectMenu>

        <USelectMenu
          v-model="selectedRecordStatuses"
          :items="statusFacetItems"
          multiple
          :loading="recordStatusesLoading"
          :placeholder="t('records.filters.statusPlaceholder')"
          class="w-full sm:w-48"
        >
          <template #trailing>
            <UButton
              v-if="selectedRecordStatuses.length > 0"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="selectedRecordStatuses = []"
            />
          </template>
        </USelectMenu>
      </div>
    </div>

    <!-- Records Summary -->
    <div class="text-sm text-gray-600">
      <span
        v-if="
          selectedRecordTypes.length > 0 ||
          selectedRecordStatuses.length > 0 ||
          searchQuery
        "
      >
        {{ t('records.filters.showingFilteredRecords') }}
        <span v-if="disableTypeFilter && recordType" class="text-gray-500">
          ({{ getRecordTypeLabel(recordType) }} {{ t('common.only') }})
        </span>
      </span>
      <span v-else>
        <span v-if="disableTypeFilter && recordType">
          {{
            t('records.filters.showingAllTypeRecords', {
              type: getRecordTypeLabel(recordType),
            })
          }}
        </span>
        <span v-else>{{ t('records.filters.showingAllRecords') }}</span>
      </span>
    </div>

    <!-- Error Display -->
    <UAlert
      v-if="recordTypesError"
      color="error"
      variant="soft"
      :title="recordTypesError"
      icon="i-lucide-alert-circle"
    />
    <UAlert
      v-if="recordStatusesError"
      color="error"
      variant="soft"
      :title="recordStatusesError"
      icon="i-lucide-alert-circle"
    />
  </div>
</template>
