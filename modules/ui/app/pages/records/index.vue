<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import SystemFooter from '~/components/SystemFooter.vue';

const { t } = useI18n();
const recordsStore = useRecordsStore();
const authStore = useAuthStore();
const { buildQueryFromState, parseQueryToState } = await import(
  '~/composables/useRecordQueryState'
);

// Route and router for URL state management
const route = useRoute();
const router = useRouter();

// Reactive data
const searchQuery = ref('');
const filters = ref({
  search: '',
  types: [] as string[],
  statuses: [] as string[],
});
const sort = ref<
  'relevance' | 'updated_desc' | 'created_desc' | 'title_asc' | 'title_desc'
>('relevance');
const page = ref(1);
const filtersResetKey = ref(0);

// Track when user is typing/searching (for showing loading state)
const isSearching = ref(false);

// URL state management functions
const updateURL = () => {
  const query = buildQueryFromState({
    search: searchQuery.value,
    types: filters.value.types,
    statuses: filters.value.statuses,
    page: page.value,
    sort: sort.value,
  });
  navigateTo({ query }, { replace: true });
};

const restoreFromURL = () => {
  const state = parseQueryToState(route as any);
  if (state.search) {
    searchQuery.value = state.search;
    filters.value.search = state.search;
  }
  if (state.types) filters.value.types = state.types;
  if (state.statuses) filters.value.statuses = state.statuses;
  if (state.page) page.value = state.page;
  if (state.sort) sort.value = state.sort;
};

// Debounced API search function
// Only triggers search if query has at least 3 characters
const debouncedApiSearch = useDebounceFn(async (query: string) => {
  const typeFilter =
    filters.value.types.length > 0 ? filters.value.types.join(',') : undefined;
  const statusFilter =
    filters.value.statuses.length > 0
      ? filters.value.statuses.join(',')
      : undefined;

  const trimmedQuery = query?.trim() || '';

  // Only search if query has at least 3 characters, otherwise load initial records
  if (trimmedQuery.length >= 3) {
    await recordsStore.searchRecords(trimmedQuery, {
      type: typeFilter,
      status: statusFilter,
    });
  } else {
    // Query is empty or less than 3 chars - load initial records
    await recordsStore.loadInitialRecords({
      type: typeFilter,
      status: statusFilter,
    });
  }

  // Clear searching state after search completes
  isSearching.value = false;
}, 300);

// Handle search changes
const handleSearch = (query: string) => {
  searchQuery.value = query;
  filters.value.search = query;
  updateURL();

  const trimmedQuery = query?.trim() || '';

  // If query is cleared or less than 3 chars, load initial records immediately
  // Otherwise, trigger debounced search
  if (trimmedQuery.length === 0) {
    // Clear search immediately
    isSearching.value = false;
    const typeFilter =
      filters.value.types.length > 0
        ? filters.value.types.join(',')
        : undefined;
    const statusFilter =
      filters.value.statuses.length > 0
        ? filters.value.statuses.join(',')
        : undefined;
    recordsStore.loadInitialRecords({
      type: typeFilter,
      status: statusFilter,
    });
  } else if (trimmedQuery.length >= 3) {
    // Only trigger debounced search if we have at least 3 characters
    isSearching.value = true; // Set searching state
    debouncedApiSearch(query);
  } else {
    // Query is 1-2 characters - keep records visible, no search happening yet
    isSearching.value = false;
  }
};

// Handle filter changes
const handleFilterChange = (newFilters: {
  search: string;
  types: string[];
  statuses: string[];
}) => {
  filters.value = newFilters;
  page.value = 1;
  updateURL();

  // Trigger search with new filters
  const typeFilter =
    newFilters.types.length > 0 ? newFilters.types.join(',') : undefined;
  const statusFilter =
    newFilters.statuses.length > 0 ? newFilters.statuses.join(',') : undefined;

  // Only use searchRecords if there's a search query with at least 3 characters
  const trimmedQuery = searchQuery.value?.trim() || '';
  if (trimmedQuery.length >= 3) {
    recordsStore.searchRecords(trimmedQuery, {
      type: typeFilter,
      status: statusFilter,
    });
  } else {
    recordsStore.loadInitialRecords({
      type: typeFilter,
      status: statusFilter,
    });
  }
};

const resetAllFilters = async () => {
  searchQuery.value = '';
  filters.value = {
    search: '',
    types: [],
    statuses: [],
  };
  page.value = 1;
  sort.value = 'relevance';
  filtersResetKey.value += 1;
  updateURL();
  await recordsStore.loadInitialRecords({});
};

// Sort handling
const sortOptions = computed(() => [
  { label: t('records.sortBy.relevance'), value: 'relevance' },
  { label: t('records.sortBy.lastUpdated'), value: 'updated_desc' },
  { label: t('records.sortBy.recentlyCreated'), value: 'created_desc' },
  { label: t('records.sortBy.titleAsc'), value: 'title_asc' },
  { label: t('records.sortBy.titleDesc'), value: 'title_desc' },
]);

watch(sort, () => {
  page.value = 1;
  updateURL();
  // Re-run search or load with current filters
  const trimmedQuery = searchQuery.value?.trim() || '';
  if (trimmedQuery.length >= 3) {
    recordsStore.searchRecords(trimmedQuery, {
      type:
        filters.value.types.length > 0
          ? filters.value.types.join(',')
          : undefined,
      status:
        filters.value.statuses.length > 0
          ? filters.value.statuses.join(',')
          : undefined,
    });
  } else {
    recordsStore.loadInitialRecords({
      type:
        filters.value.types.length > 0
          ? filters.value.types.join(',')
          : undefined,
      status:
        filters.value.statuses.length > 0
          ? filters.value.statuses.join(',')
          : undefined,
    });
  }
});

// Function to load records based on current state
const loadRecordsFromState = async () => {
  const typeFilter =
    filters.value.types.length > 0 ? filters.value.types.join(',') : undefined;
  const statusFilter =
    filters.value.statuses.length > 0
      ? filters.value.statuses.join(',')
      : undefined;

  // Ensure we have a valid search query with at least 3 characters before calling searchRecords
  const trimmedQuery = searchQuery.value?.trim() || '';
  if (trimmedQuery.length >= 3) {
    // URL has a search query with at least 3 chars, trigger search
    await recordsStore.searchRecords(trimmedQuery, {
      type: typeFilter,
      status: statusFilter,
    });
  } else {
    // No search query or less than 3 chars, load initial records
    await recordsStore.loadInitialRecords({
      type: typeFilter,
      status: statusFilter,
    });
  }
};

// Track initial query to detect actual changes
const initialQuery = ref<string>(JSON.stringify(route.query));

// On mounted - restore from URL and fetch data
onMounted(async () => {
  // Restore state from URL first
  restoreFromURL();
  // Load records based on restored state
  await loadRecordsFromState();
  // Store initial query state after first load
  initialQuery.value = JSON.stringify(route.query);
});

// Watch for route query changes (e.g., browser back/forward)
watch(
  () => route.query,
  async (newQuery) => {
    const newQueryString = JSON.stringify(newQuery);
    // Only run if query actually changed (skip initial mount)
    if (newQueryString === initialQuery.value) return;

    // Update initial query reference
    initialQuery.value = newQueryString;

    // Restore state from URL when route changes
    restoreFromURL();
    // Reload records based on new state
    await loadRecordsFromState();
  },
  { deep: true }
);

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('records.allRecords'),
  },
]);

// Breadcrumbs ref for scroll-to-top functionality
const breadcrumbsRef = ref<HTMLElement | undefined>();
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">{{ t('records.allRecords') }}</h1>
        </template>
        <template #description>
          {{ t('records.browseCatalog') }}
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="sort"
              :items="sortOptions"
              value-key="value"
              option-attribute="label"
              class="w-44"
            />
            <HeaderActions
              v-if="
                authStore.isLoggedIn &&
                authStore.hasPermission('records:create')
              "
              :actions="[
                {
                  label: t('records.createRecord'),
                  icon: 'i-lucide-plus',
                  to: '/records/new',
                  color: 'primary',
                },
              ]"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb ref="breadcrumbsRef" :items="breadcrumbItems" />

        <!-- Search and Filters Component -->
        <RecordSearch
          :key="filtersResetKey"
          :initial-filters="filters"
          @search="handleSearch"
          @filter-change="handleFilterChange"
        />

        <!-- Records List Component -->
        <RecordList
          :filters="filters"
          :search-query="searchQuery"
          :breadcrumbs-ref="breadcrumbsRef as any"
          :sort="sort"
          :is-searching="isSearching"
          @resetFilters="resetAllFilters"
        />

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
