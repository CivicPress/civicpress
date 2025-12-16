<script setup lang="ts">
import SystemFooter from '~/components/SystemFooter.vue';
import {
  buildQueryFromState,
  parseQueryToState,
} from '~/composables/useRecordQueryState';

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

// Pagination state
const page = ref(1);
const pageSize = ref(50);
const sort = ref<
  'relevance' | 'updated_desc' | 'created_desc' | 'title_asc' | 'title_desc'
>(
  'created_desc' // Default for records listing
);

// Track when user is typing/searching (for showing loading state)
const isSearching = ref(false);

// Track if we're handling pagination programmatically to prevent route watcher from interfering
const isHandlingPagination = ref(false);
// Track the last page we handled to prevent duplicate processing
const lastHandledPage = ref(1);

// URL state management functions
const updateURL = () => {
  const query = buildQueryFromState({
    search: searchQuery.value,
    types: [type], // Always use the route type
    statuses: filters.value.statuses,
    page: page.value,
    pageSize: pageSize.value,
    sort: sort.value,
  });
  navigateTo({ query }, { replace: true });
};

const restoreFromURL = () => {
  const state = parseQueryToState(route as any);
  // Restore search query
  if (state.search) {
    searchQuery.value = state.search;
    filters.value.search = state.search;
  }

  // Restore record statuses (types are always pre-selected from route)
  if (state.statuses) {
    filters.value.statuses = state.statuses;
  }

  // Restore pagination
  if (state.page) page.value = state.page;
  if (state.pageSize) {
    pageSize.value = state.pageSize;
    recordsStore.setPageSize(state.pageSize);
  }
  if (state.sort) {
    // Sanitize: relevance is only valid when there's a search query
    if (state.sort === 'relevance' && !searchQuery.value) {
      sort.value = 'created_desc';
    } else {
      sort.value = state.sort;
    }
  } else {
    // Set default based on context
    sort.value = searchQuery.value ? 'relevance' : 'created_desc';
  }
};

// Handle search query changes (for suggestions only, doesn't trigger search)
const handleSearch = (query: string) => {
  // Only update local state, don't trigger actual search
  // This is used for suggestions display while typing
  searchQuery.value = query;
  filters.value.search = query;
};

// Handle search submission (Enter key or suggestion click)
const handleSearchSubmit = (query: string) => {
  searchQuery.value = query;
  filters.value.search = query;
  page.value = 1; // Reset to page 1 for new search
  updateURL();

  const trimmedQuery = query?.trim() || '';

  // If query is cleared, load initial records immediately
  if (trimmedQuery.length === 0) {
    isSearching.value = false;
    const statusFilter =
      filters.value.statuses.length > 0
        ? filters.value.statuses.join(',')
        : undefined;
    // Sanitize sort: relevance is only valid for search, not for records listing
    const sanitizedSort =
      sort.value === 'relevance' ? 'created_desc' : sort.value;
    recordsStore.loadPage(1, {
      type: type,
      status: statusFilter,
      sort: sanitizedSort,
    });
    ensureBylawHierarchyLoaded();
  } else if (trimmedQuery.length >= 3) {
    // Only search if query has at least 3 characters
    isSearching.value = true;
    const statusFilter =
      filters.value.statuses.length > 0
        ? filters.value.statuses.join(',')
        : undefined;
    // Set sort to relevance for search if not already set
    if (!sort.value || sort.value === 'created_desc') {
      sort.value = 'relevance';
    }
    // Reset to page 1 for new search
    recordsStore.searchRecords(trimmedQuery, {
      type: type,
      status: statusFilter,
      page: 1,
      sort: sort.value,
    });
    isSearching.value = false;
  } else {
    // Query is less than 3 chars - load initial records
    isSearching.value = false;
    const statusFilter =
      filters.value.statuses.length > 0
        ? filters.value.statuses.join(',')
        : undefined;
    // Sanitize sort: relevance is only valid for search, not for records listing
    const sanitizedSort =
      sort.value === 'relevance' ? 'created_desc' : sort.value;
    recordsStore.loadPage(1, {
      type: type,
      status: statusFilter,
      sort: sanitizedSort,
    });
    ensureBylawHierarchyLoaded();
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
  // Update search query from filters
  searchQuery.value = newFilters.search || '';
  page.value = 1; // Reset to page 1 when filters change
  updateURL();

  // Trigger search with new filters
  const statusFilter =
    newFilters.statuses.length > 0 ? newFilters.statuses.join(',') : undefined;

  // Only use searchRecords if there's a search query with at least 3 characters
  const trimmedQuery = searchQuery.value?.trim() || '';
  if (trimmedQuery.length >= 3) {
    // Reset to page 1 when filters change during search
    await recordsStore.searchRecords(trimmedQuery, {
      type: type,
      status: statusFilter,
      page: 1,
      sort: sort.value,
    });
  } else {
    // Sanitize sort: relevance is only valid for search, not for records listing
    const sanitizedSort =
      sort.value === 'relevance' ? 'created_desc' : sort.value;
    await recordsStore.loadPage(1, {
      type: type,
      status: statusFilter,
      sort: sanitizedSort,
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
  page.value = 1; // Reset to page 1 when filters are reset
  filtersResetKey.value += 1;
  updateURL();
  // Sanitize sort: relevance is only valid for search, not for records listing
  const sanitizedSort =
    sort.value === 'relevance' ? 'created_desc' : sort.value;
  await recordsStore.loadPage(1, {
    type,
    sort: sanitizedSort,
  });
  await ensureBylawHierarchyLoaded();
};
// Get record type display name
const { getRecordTypeLabel } = useRecordTypes();
const recordTypeLabel = computed(() => getRecordTypeLabel(type));

const ensureBylawHierarchyLoaded = async () => {
  // Don't run during pagination changes - only on initial load or filter changes
  if (isHandlingPagination.value) return;

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

  // Try to load more pages if hierarchy records not found yet
  // But only on initial load, not during pagination
  let attempts = 0;
  let currentPage = page.value; // Start from current page
  while (
    !hasHierarchyRecords() &&
    recordsStore.hasMoreRecords &&
    attempts < 5
  ) {
    currentPage += 1;
    // Sanitize sort: relevance is only valid for search, not for records listing
    const sanitizedSort =
      sort.value === 'relevance' ? 'created_desc' : sort.value;
    await recordsStore.loadPage(currentPage, {
      type,
      status:
        filters.value.statuses.length > 0
          ? filters.value.statuses.join(',')
          : undefined,
      sort: sanitizedSort,
    });
    attempts += 1;
  }
};

// Function to load records based on current state
const loadRecordsFromState = async () => {
  // Prevent duplicate concurrent calls
  if (isLoading.value) {
    return;
  }

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
      type: type,
      status: statusFilter,
      page: page.value,
      sort: sort.value,
    });
  } else {
    // No search query or less than 3 chars, load page using page-based pagination
    // Sanitize sort: relevance is only valid for search, not for records listing
    const sanitizedSort =
      sort.value === 'relevance' ? 'created_desc' : sort.value;
    await recordsStore.loadPage(page.value, {
      type: type,
      status: statusFilter,
      sort: sanitizedSort,
    });
    // Only ensure hierarchy is loaded for bylaw type and if not handling pagination
    // (to prevent multiple API calls during pagination - hierarchy should be loaded on initial load only)
    if (type === 'bylaw' && !isHandlingPagination.value) {
      await ensureBylawHierarchyLoaded();
    }
  }
};

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

// Handle pagination changes
const handlePageChange = async (newPage: number) => {
  // Prevent concurrent pagination changes
  if (isHandlingPagination.value) return;

  // Don't do anything if it's already the current page
  if (newPage === page.value) return;

  isHandlingPagination.value = true;
  lastHandledPage.value = newPage;

  try {
    page.value = newPage;
    // Update URL first, then load - route watcher will skip due to flag
    updateURL();
    await loadRecordsFromState();
    scrollToTop();
  } catch (error) {
    console.error('Error handling page change:', error);
    // Reset on error
    lastHandledPage.value = page.value;
  } finally {
    // Clear the flag after a delay to ensure route watcher doesn't interfere
    setTimeout(() => {
      isHandlingPagination.value = false;
    }, 500);
  }
};

const handlePageSizeChange = async (newPageSize: number) => {
  // Prevent concurrent pagination changes
  if (isHandlingPagination.value) return;

  isHandlingPagination.value = true;
  try {
    pageSize.value = newPageSize;
    page.value = 1; // Reset to page 1 when page size changes
    recordsStore.setPageSize(newPageSize);
    updateURL();
    await loadRecordsFromState();
    scrollToTop();
  } finally {
    // Small delay to ensure route watcher doesn't interfere
    setTimeout(() => {
      isHandlingPagination.value = false;
    }, 100);
  }
};

// Track initial query to detect actual changes
const initialQuery = ref<string | null>(null);
const isInitialMount = ref(true);
const isLoading = ref(false); // Guard to prevent duplicate loads

// On mounted - restore from URL and fetch data
onMounted(async () => {
  // Skip if not on client side (SSR)
  if (!process.client) return;

  // Prevent duplicate calls
  if (isLoading.value) return;
  isLoading.value = true;

  try {
    // Restore state from URL first
    restoreFromURL();
    // Store initial query state BEFORE loading (to prevent watcher from triggering)
    initialQuery.value = JSON.stringify(route.query);
    // Load records based on restored state
    await loadRecordsFromState();
  } finally {
    // Mark initial mount as complete
    isInitialMount.value = false;
    isLoading.value = false;
  }
});

// Watch for route query changes (e.g., browser back/forward)
// Use immediate: false to prevent firing on initial mount
watch(
  () => route.query,
  async (newQuery, oldQuery) => {
    // Skip watcher on initial mount - onMounted handles it
    if (isInitialMount.value || isLoading.value) return;

    // Skip if we're handling pagination programmatically (prevents double loads)
    if (isHandlingPagination.value) {
      // Update initialQuery to prevent it from firing when flag clears
      initialQuery.value = JSON.stringify(newQuery);
      return;
    }

    // Skip if oldQuery is null/undefined (first watch after mount)
    if (!oldQuery) return;

    const newQueryString = JSON.stringify(newQuery);
    const oldQueryString = JSON.stringify(oldQuery);

    // Only run if query actually changed
    if (
      newQueryString === oldQueryString ||
      newQueryString === initialQuery.value
    ) {
      return;
    }

    isLoading.value = true;
    try {
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
    } finally {
      isLoading.value = false;
    }
  },
  { deep: true, immediate: false }
);

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
          :sort="sort"
          :is-searching="!!searchQuery"
          @search="handleSearch"
          @search-submit="handleSearchSubmit"
          @filter-change="handleFilterChange"
          @sort-change="
            (newSort) => {
              sort = newSort;
              page = 1;
              updateURL();
              handleFilterChange(filters);
            }
          "
        />

        <!-- Records List Component -->
        <RecordList
          :record-type="type"
          :filters="filters"
          :search-query="searchQuery"
          :is-searching="isSearching"
          :current-page="page"
          :page-size="pageSize"
          @resetFilters="resetFilters"
          @page-change="handlePageChange"
          @page-size-change="handlePageSizeChange"
        />

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
