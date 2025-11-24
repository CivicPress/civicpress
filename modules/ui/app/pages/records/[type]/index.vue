<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import SystemFooter from '~/components/SystemFooter.vue';

const { t } = useI18n();
const recordsStore = useRecordsStore();
const authStore = useAuthStore();

// Route and router for URL state management
const route = useRoute();
const router = useRouter();

// Get the record type from the route
const type = route.params.type as string;

// Reactive data
const searchQuery = ref('');
const filters = ref({
  search: '',
  types: [type], // Pre-select the record type
  statuses: [] as string[],
});
const filtersResetKey = ref(0);

// Track when user is typing/searching (for showing loading state)
const isSearching = ref(false);

// URL state management functions
const updateURL = () => {
  const query: any = {};

  if (searchQuery.value) query.search = searchQuery.value;
  if (filters.value.statuses.length > 0)
    query.statuses = filters.value.statuses.join(',');

  navigateTo({ query }, { replace: true });
};

const restoreFromURL = () => {
  // Restore search query
  if (route.query.search) {
    searchQuery.value = route.query.search as string;
    filters.value.search = route.query.search as string;
  }

  // Restore record statuses (types are always pre-selected)
  if (route.query.statuses) {
    const statuses = (route.query.statuses as string).split(',');
    filters.value.statuses = statuses;
  }
};

// Debounced API search function
// Only triggers search if query has at least 3 characters
const debouncedApiSearch = useDebounceFn(async (query: string) => {
  const statusFilter =
    filters.value.statuses.length > 0
      ? filters.value.statuses.join(',')
      : undefined;

  const trimmedQuery = query?.trim() || '';

  // Only search if query has at least 3 characters, otherwise load initial records
  if (trimmedQuery.length >= 3) {
    await recordsStore.searchRecords(trimmedQuery, {
      type: type,
      status: statusFilter,
    });
  } else {
    // Query is empty or less than 3 chars - load initial records
    await recordsStore.loadInitialRecords({
      type: type,
      status: statusFilter,
    });
    await ensureBylawHierarchyLoaded();
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
    const statusFilter =
      filters.value.statuses.length > 0
        ? filters.value.statuses.join(',')
        : undefined;
    recordsStore.loadInitialRecords({
      type: type,
      status: statusFilter,
    });
    ensureBylawHierarchyLoaded();
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
const handleFilterChange = async (newFilters: {
  search: string;
  types: string[];
  statuses: string[];
}) => {
  // Always keep the record type selected
  newFilters.types = [type];
  filters.value = newFilters;
  updateURL();

  // Trigger search with new filters
  const statusFilter =
    newFilters.statuses.length > 0 ? newFilters.statuses.join(',') : undefined;

  // Only use searchRecords if there's a search query with at least 3 characters
  const trimmedQuery = searchQuery.value?.trim() || '';
  if (trimmedQuery.length >= 3) {
    await recordsStore.searchRecords(trimmedQuery, {
      type: type,
      status: statusFilter,
    });
  } else {
    await recordsStore.loadInitialRecords({
      type: type,
      status: statusFilter,
    });
    await ensureBylawHierarchyLoaded();
  }
};

const resetFilters = async () => {
  searchQuery.value = '';
  filters.value = {
    search: '',
    types: [type],
    statuses: [],
  };
  filtersResetKey.value += 1;
  updateURL();
  await recordsStore.loadInitialRecords({
    type,
  });
  await ensureBylawHierarchyLoaded();
};
// Get record type display name
const { getRecordTypeLabel } = useRecordTypes();
const recordTypeLabel = computed(() => getRecordTypeLabel(type));

const ensureBylawHierarchyLoaded = async () => {
  if (type !== 'bylaw') {
    return;
  }

  const hasHierarchyRecords = () =>
    recordsStore.records.some(
      (record) =>
        record.id === 'bylaw-286' ||
        record.metadata?.kind === 'root' ||
        record.metadata?.kind === 'chapter'
    );

  let attempts = 0;
  while (!hasHierarchyRecords() && recordsStore.hasMore && attempts < 5) {
    await recordsStore.loadMoreRecords({
      type,
      status:
        filters.value.statuses.length > 0
          ? filters.value.statuses.join(',')
          : undefined,
    });
    attempts += 1;
  }
};

// On mounted - restore from URL and fetch data
onMounted(async () => {
  // Restore state from URL first
  restoreFromURL();

  // Start fetching records immediately
  await recordsStore.loadInitialRecords({
    type: type,
    status:
      filters.value.statuses.length > 0
        ? filters.value.statuses.join(',')
        : undefined,
  });
  await ensureBylawHierarchyLoaded();
});

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('records.allRecords'),
    to: '/records',
  },
  {
    label: recordTypeLabel.value,
  },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">{{ recordTypeLabel }} Records</h1>
        </template>
        <template #description>
          Browse and search through {{ recordTypeLabel.toLowerCase() }} records
        </template>
        <template #right>
          <HeaderActions
            v-if="
              authStore.isLoggedIn && authStore.hasPermission('records:create')
            "
            :actions="[
              {
                label: `Create ${recordTypeLabel}`,
                icon: 'i-lucide-plus',
                to: `/records/${type}/new`,
                color: 'primary',
              },
            ]"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Search and Filters Component -->
        <RecordSearch
          :key="filtersResetKey"
          :initial-filters="filters"
          :record-type="type"
          :disable-type-filter="true"
          @search="handleSearch"
          @filter-change="handleFilterChange"
        />

        <!-- Records List Component -->
        <RecordList
          :record-type="type"
          :filters="filters"
          :search-query="searchQuery"
          :is-searching="isSearching"
          @resetFilters="resetFilters"
        />

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
