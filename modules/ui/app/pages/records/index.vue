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
const page = ref(1);
const pageSize = ref(50); // Default page size
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
    pageSize: pageSize.value,
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
  if (state.pageSize) {
    pageSize.value = state.pageSize;
    recordsStore.setPageSize(state.pageSize);
  }
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

// Handle search input changes (only updates local state, doesn't execute search)
const handleSearch = (query: string) => {
  searchQuery.value = query;
  filters.value.search = query;
  // Don't update URL or trigger search - wait for Enter key or suggestion click
};

// Handle search submission (Enter key or suggestion click)
const handleSearchSubmit = (query?: string) => {
  const queryToUse = query !== undefined ? query : searchQuery.value;
  searchQuery.value = queryToUse;
  filters.value.search = queryToUse;

  const trimmedQuery = queryToUse?.trim() || '';

  // Update URL when search is actually submitted
  updateURL();

  // Execute search or load initial records
  if (trimmedQuery.length === 0) {
    // Clear search
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
  } else {
    // Execute search (no minimum character requirement when user explicitly submits)
    isSearching.value = true;
    page.value = 1; // Reset to page 1 when search is submitted
    const typeFilter =
      filters.value.types.length > 0
        ? filters.value.types.join(',')
        : undefined;
    const statusFilter =
      filters.value.statuses.length > 0
        ? filters.value.statuses.join(',')
        : undefined;
    recordsStore.searchRecords(trimmedQuery, {
      type: typeFilter,
      status: statusFilter,
      page: 1, // Always start at page 1 for new searches
    });
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
  page.value = 1; // Reset to page 1 when filters change
  updateURL();

  // Trigger search with new filters
  const typeFilter =
    newFilters.types.length > 0 ? newFilters.types.join(',') : undefined;
  const statusFilter =
    newFilters.statuses.length > 0 ? newFilters.statuses.join(',') : undefined;

  // Only use searchRecords if there's a search query with at least 3 characters
  const trimmedQuery = searchQuery.value?.trim() || '';
  if (trimmedQuery.length >= 3) {
    // Reset to page 1 when filters change during search
    page.value = 1;
    recordsStore.searchRecords(trimmedQuery, {
      type: typeFilter,
      status: statusFilter,
      page: 1,
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
  filtersResetKey.value += 1;
  updateURL();
  await recordsStore.loadInitialRecords({});
};

// Handle pagination changes
const handlePageChange = async (newPage: number) => {
  page.value = newPage;
  updateURL();
  await loadRecordsFromState();
  scrollToTop();
};

const handlePageSizeChange = async (newSize: number) => {
  pageSize.value = newSize;
  page.value = 1;
  recordsStore.setPageSize(newSize);
  updateURL();
  await loadRecordsFromState();
  scrollToTop();
};

// Function to load records based on current state
const loadRecordsFromState = async () => {
  const typeFilter =
    filters.value.types.length > 0 ? filters.value.types.join(',') : undefined;
  const statusFilter =
    filters.value.statuses.length > 0
      ? filters.value.statuses.join(',')
      : undefined;

  // Ensure pageSize is synced to store
  recordsStore.setPageSize(pageSize.value);

  // Ensure we have a valid search query with at least 3 characters before calling searchRecords
  const trimmedQuery = searchQuery.value?.trim() || '';
  if (trimmedQuery.length >= 3) {
    // URL has a search query with at least 3 chars, trigger search with page-based pagination
    await recordsStore.searchRecords(trimmedQuery, {
      type: typeFilter,
      status: statusFilter,
      page: page.value,
    });
  } else {
    // No search query or less than 3 chars, load page using page-based pagination
    await recordsStore.loadPage(page.value, {
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

    // Don't reload records if search query is 1-2 characters (user is still typing)
    const trimmedSearchQuery = searchQuery.value?.trim() || '';
    if (trimmedSearchQuery.length > 0 && trimmedSearchQuery.length < 3) {
      // User is typing 1-2 characters - don't reload records, just update state
      return;
    }

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

// Scroll to top helper - scrolls the scrollable pane inside the dashboard panel
const scrollToTop = () => {
  // Use a small delay to ensure DOM updates are complete before scrolling
  setTimeout(() => {
    // Find the scrollable container (the div with overflow-y-auto inside dashboard panel)
    const dashboardPanel = document.querySelector('[id^="dashboard-panel"]');
    if (dashboardPanel) {
      const scrollablePane = dashboardPanel.querySelector(
        '.overflow-y-auto'
      ) as HTMLElement;
      if (scrollablePane) {
        scrollablePane.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    // Fallback to window scroll if we can't find the pane
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 100);
};
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
          @search-submit="handleSearchSubmit"
          @filter-change="handleFilterChange"
        />

        <!-- Records List Component -->
        <RecordList
          :filters="filters"
          :search-query="searchQuery"
          :breadcrumbs-ref="breadcrumbsRef as any"
          :is-searching="isSearching"
          :current-page="page"
          :page-size="pageSize"
          @resetFilters="resetAllFilters"
          @page-change="handlePageChange"
          @page-size-change="handlePageSizeChange"
        />

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
