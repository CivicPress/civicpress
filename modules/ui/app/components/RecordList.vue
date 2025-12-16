<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import { useVirtualList } from '@vueuse/core';
import { useRecordsStore } from '~/stores/records';
import { useAuthStore } from '~/stores/auth';

// Props
interface Props {
  recordType?: string | null; // Filter by specific record type
  filters?: {
    search?: string;
    types?: string[];
    statuses?: string[];
  };
  searchQuery?: string;
  breadcrumbsRef?: Ref<HTMLElement | undefined>;
  isSearching?: boolean; // True when user is typing or search is in progress
  currentPage?: number; // Current page number (from parent)
  pageSize?: number; // Records per page
}

const props = withDefaults(defineProps<Props>(), {
  recordType: null,
  filters: () => ({}),
  searchQuery: '',
  isSearching: false,
  currentPage: 1,
  pageSize: 50,
});

// Emits
const emit = defineEmits<{
  recordClick: [record: CivicRecord];
  resetFilters: [];
  pageChange: [page: number];
  pageSizeChange: [pageSize: number];
}>();

// Store
const recordsStore = useRecordsStore();
const authStore = useAuthStore();

// Record utilities composable
const {
  formatDate,
  getStatusColor,
  getTypeIcon,
  getTypeLabel,
  getStatusLabel,
} = useRecordUtils();

// i18n
const { t } = useI18n();

// Reactive data
const loading = ref(false);

// Computed properties for better reactivity
const displayRecords = computed(() => {
  return recordsStore.records;
});

// Records for display (same as displayRecords since we're cursor-based)
const createSummary = (record: CivicRecord): string => {
  const summarySource =
    record.metadata?.summary ||
    record.metadata?.description ||
    record.content ||
    '';

  const normalized = summarySource.replace(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    return '';
  }

  return normalized.length > 180
    ? `${normalized.slice(0, 180).trim()}...`
    : normalized;
};

const processedRecords = computed(() => {
  // API already handles sorting (kind priority + created_at for listings, relevance for searches)
  // No client-side sorting needed - just format the records for display
  return displayRecords.value.map((record) => {
    return {
      ...record,
      formattedDate: formatDate(record.created_at),
      statusColor: getStatusColor(record.status),
      statusLabel: getStatusLabel(record.status),
      typeIcon: getTypeIcon(record.type),
      typeLabel: getTypeLabel(record.type),
      summary: createSummary(record),
    };
  });
});

// Check if we should show loading state
// Show loading when: user is typing/searching OR store is loading
const shouldShowLoading = computed(() => {
  return props.isSearching || recordsStore.isLoading;
});

// Check if we should hide records and show loading instead
// Hide records when: user is typing/searching OR store is loading during a search
const shouldHideRecords = computed(() => {
  return (
    props.isSearching ||
    (recordsStore.isLoading && props.searchQuery?.trim().length >= 3)
  );
});

const canCreateRecords = computed(() => {
  const role = authStore.currentUser?.role;
  return role === 'admin' || role === 'clerk';
});

const resetFilters = () => {
  emit('resetFilters');
};

const goToCreateRecord = () => {
  if (props.recordType) {
    navigateTo(`/records/${props.recordType}/new`);
  } else {
    navigateTo('/records/new');
  }
};

// Navigate to record detail
const navigateToRecord = (record: CivicRecord) => {
  emit('recordClick', record);
  navigateTo(`/records/${record.type}/${record.id}`);
};

// Pagination helpers
const scrollToTop = () => {
  // Scroll to the breadcrumbs instead of the very top
  if (props.breadcrumbsRef?.value) {
    props.breadcrumbsRef.value.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
};

// Get pagination info from store
const totalPages = computed(() => recordsStore.totalPages);
const totalCount = computed(() => recordsStore.totalCount);
const currentPageNum = computed(
  () => props.currentPage || recordsStore.currentPage
);

// Calculate "Showing X-Y of Z" range
const showingRange = computed(() => {
  if (totalCount.value === 0) return { start: 0, end: 0 };
  const pageSize = props.pageSize || 50;
  const start = (currentPageNum.value - 1) * pageSize + 1;
  const end = Math.min(
    start + displayRecords.value.length - 1,
    totalCount.value
  );
  return { start, end };
});

// Handle page changes
const handlePageChange = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    emit('pageChange', newPage);
    // Don't call scrollToTop here - let the parent handle it after data loads
  }
};

const handlePageSizeChange = (value: any) => {
  // USelectMenu passes SelectMenuItem, but with simple number options it may be the number directly
  // Extract number value - handle both direct number and SelectMenuItem object
  let pageSize: number;
  if (typeof value === 'number') {
    pageSize = value;
  } else if (typeof value === 'string') {
    pageSize = parseInt(value, 10);
  } else if (value && typeof value === 'object' && 'value' in value) {
    pageSize =
      typeof value.value === 'number'
        ? value.value
        : parseInt(String(value.value), 10);
  } else {
    pageSize = 50; // default fallback
  }

  if (!isNaN(pageSize) && pageSize > 0) {
    emit('pageSizeChange', pageSize);
  }
};

// Initialize records if needed
onMounted(async () => {
  if (displayRecords.value.length === 0) {
    await recordsStore.loadInitialRecords({
      type: props.filters?.types?.join(','),
      status: props.filters?.statuses?.join(','),
    });
  }
});
</script>

<template>
  <div class="space-y-6">
    <!-- Records List -->
    <div class="space-y-6">
      <!-- Show loading when typing/searching, hide records during search -->
      <div v-if="shouldHideRecords" class="text-center py-12">
        <div class="space-y-4">
          <div class="flex items-center justify-center space-x-2 mb-4">
            <UIcon
              name="i-lucide-loader-2"
              class="w-5 h-5 animate-spin text-gray-500"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('records.loadingData') }}
            </span>
          </div>
          <RecordCardSkeleton v-for="i in 3" :key="i" />
        </div>
      </div>

      <!-- Show existing records if we have them and not searching -->
      <div v-else-if="displayRecords.length > 0" class="space-y-6">
        <!-- Records List -->
        <div class="space-y-6">
          <UCard
            v-for="record in processedRecords"
            :key="record.id"
            :ui="{ body: 'p-0' }"
            class="hover:shadow-md transition-shadow cursor-pointer"
            @click="navigateToRecord(record)"
          >
            <div class="px-6 py-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-4">
                  <!-- Type Icon -->
                  <div class="flex-shrink-0 mt-1">
                    <UIcon
                      :name="record.typeIcon"
                      class="w-4 h-4 text-gray-400"
                    />
                  </div>

                  <!-- Record Info -->
                  <div class="flex-1 min-w-0">
                    <h3
                      class="text-xl font-semibold leading-tight text-gray-900 dark:text-white line-clamp-2"
                    >
                      {{ record.title }}
                    </h3>
                    <p
                      v-if="record.summary"
                      class="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 leading-snug"
                    >
                      {{ record.summary }}
                    </p>
                    <div
                      class="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400"
                    >
                      <UBadge
                        size="xs"
                        color="neutral"
                        variant="soft"
                        class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-300"
                      >
                        <UIcon
                          :name="record.typeIcon"
                          class="w-3 h-3 text-gray-400"
                        />
                        <span>{{ record.typeLabel }}</span>
                      </UBadge>
                      <UBadge
                        v-if="
                          authStore.hasPermission('records:edit') &&
                          record.hasUnpublishedChanges
                        "
                        size="xs"
                        color="error"
                        variant="soft"
                        class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-300"
                      >
                        <UIcon name="i-lucide-file-edit" class="w-3 h-3" />
                        {{ t('records.unpublishedChanges') }}
                      </UBadge>
                      <span
                        class="flex items-center gap-1 text-gray-500 dark:text-gray-400"
                      >
                        <UIcon
                          name="i-lucide-calendar"
                          class="w-3 h-3 text-gray-400"
                        />
                        {{ record.formattedDate }}
                      </span>
                    </div>
                  </div>
                </div>

                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200 dark:text-green-200 dark:ring-green-800"
                >
                  <UIcon
                    name="i-lucide-badge-check"
                    class="w-4 h-4 text-current"
                  />
                  {{ record.statusLabel }}
                </span>
              </div>

              <div
                v-if="record.metadata?.tags && record.metadata.tags.length > 0"
                class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800"
              >
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="tag in record.metadata.tags"
                    :key="tag"
                    color="neutral"
                    variant="soft"
                    size="xs"
                  >
                    {{ tag }}
                  </UBadge>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Pagination Controls -->
        <div
          v-if="totalPages > 1"
          class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200 dark:border-gray-800"
        >
          <!-- Showing X-Y of Z results -->
          <div class="text-sm text-gray-600 dark:text-gray-400">
            {{
              t('records.pagination.showing', {
                start: showingRange.start,
                end: showingRange.end,
                total: totalCount,
              })
            }}
          </div>

          <!-- Page Size Selector -->
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('records.pagination.perPage') }}
            </span>
            <USelectMenu
              :model-value="props.pageSize"
              :options="[10, 25, 50, 100]"
              @update:model-value="handlePageSizeChange"
              class="w-20"
            />
          </div>

          <!-- Page Navigation using UPagination -->
          <UPagination
            :page="currentPageNum"
            :total="totalCount"
            :items-per-page="props.pageSize"
            :sibling-count="2"
            :show-edges="totalPages > 7"
            size="sm"
            @update:page="handlePageChange"
          />
        </div>
      </div>

      <!-- Show loading only when no existing records -->
      <div
        v-else-if="shouldShowLoading && displayRecords.length === 0"
        class="text-center py-12"
      >
        <div class="space-y-4">
          <RecordCardSkeleton v-for="i in 3" :key="i" />
        </div>
      </div>

      <!-- Show no results when not loading and no records -->
      <div
        v-else-if="displayRecords.length === 0 && !shouldShowLoading"
        class="py-16"
      >
        <div
          class="mx-auto flex max-w-xl flex-col items-center rounded-xl border border-dashed border-gray-200 bg-white px-8 py-12 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900/40"
        >
          <UIcon
            name="i-lucide-file-search"
            class="mb-6 h-16 w-16 text-gray-300 dark:text-gray-600"
          />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {{ t('records.noRecordsMatchFilters') }}
          </h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ t('records.noRecordsMatchFiltersDesc') }}
          </p>
          <div class="mt-6 flex flex-col items-center gap-3 sm:flex-row">
            <UButton
              variant="link"
              color="primary"
              class="text-sm"
              @click="resetFilters"
            >
              {{ t('records.filters.clearAllFilters') }}
            </UButton>
            <UButton
              v-if="canCreateRecords"
              variant="link"
              color="primary"
              class="text-sm"
              @click.stop="goToCreateRecord"
            >
              {{ t('records.createNewRecord') }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading Indicator (below records) -->
    <div
      v-if="shouldShowLoading && displayRecords.length > 0"
      class="text-center py-6"
    >
      <div class="flex items-center justify-center space-x-2">
        <UIcon
          name="i-lucide-loader-2"
          class="w-4 h-4 animate-spin text-gray-500"
        />
        <span class="text-sm text-gray-600 dark:text-gray-400"
          >Loading more records...</span
        >
      </div>
    </div>

    <!-- Error Display -->
    <UAlert
      v-if="recordsStore.recordsError"
      color="error"
      variant="soft"
      :title="recordsStore.recordsError"
      icon="i-lucide-alert-circle"
    />
  </div>
</template>
