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
  sort?:
    | 'relevance'
    | 'updated_desc'
    | 'created_desc'
    | 'title_asc'
    | 'title_desc';
}

const props = withDefaults(defineProps<Props>(), {
  recordType: null,
  filters: () => ({}),
  searchQuery: '',
  sort: 'relevance',
});

// Emits
const emit = defineEmits<{
  loadMore: [];
  recordClick: [record: CivicRecord];
  resetFilters: [];
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
  const base = displayRecords.value.map((record) => ({
    ...record,
    formattedDate: formatDate(record.created_at),
    statusColor: getStatusColor(record.status),
    statusLabel: getStatusLabel(record.status),
    typeIcon: getTypeIcon(record.type),
    typeLabel: getTypeLabel(record.type),
    summary: createSummary(record),
  }));

  // Client-side sort for now
  switch (props.sort) {
    case 'updated_desc':
      return base.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    case 'created_desc':
      return base.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    case 'title_asc':
      return base.sort((a, b) => a.title.localeCompare(b.title));
    case 'title_desc':
      return base.sort((a, b) => b.title.localeCompare(a.title));
    default:
      return base;
  }
});

// Check if we should show loading state
const shouldShowLoading = computed(() => {
  return recordsStore.isLoading;
});

// Check if we should show "Load More" button
const shouldShowLoadMore = computed(() => {
  return (
    recordsStore.hasMore &&
    displayRecords.value.length > 0 &&
    !recordsStore.isLoading
  );
});

const canCreateRecords = computed(() => {
  const role = authStore.currentUser?.role;
  return role === 'admin' || role === 'clerk';
});

// Load more records
const loadMoreRecords = async () => {
  if (!recordsStore.hasMore || recordsStore.isLoading) return;

  loading.value = true;
  try {
    await recordsStore.loadMoreRecords({
      type: props.filters?.types?.join(','),
      status: props.filters?.statuses?.join(','),
    });
    emit('loadMore');
  } catch (error) {
    console.error('Error loading more records:', error);
  } finally {
    loading.value = false;
  }
};

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

// Simple pagination for large datasets instead of virtual scrolling
const itemsPerPage = 50;
const currentPage = ref(1);

const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return processedRecords.value.slice(start, end);
});

const totalPages = computed(() =>
  Math.ceil(displayRecords.value.length / itemsPerPage)
);

const scrollToTop = () => {
  // Scroll to the breadcrumbs instead of the very top
  if (props.breadcrumbsRef?.value) {
    props.breadcrumbsRef.value.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    scrollToTop();
  }
};

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    scrollToTop();
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
    <!-- Records List - Show immediately, don't wait for loading -->
    <div class="space-y-6">
      <!-- Show existing records immediately if we have them -->
      <div v-if="displayRecords.length > 0" class="space-y-6">
        <!-- Pagination for Large Lists -->
        <div v-if="displayRecords.length > 50" class="space-y-6">
          <!-- Paginated Records -->
          <div class="space-y-6">
            <UCard
              v-for="record in paginatedRecords"
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
                  v-if="
                    record.metadata?.tags && record.metadata.tags.length > 0
                  "
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
          <div class="flex items-center justify-between">
            <UButton
              @click="prevPage"
              :disabled="currentPage === 1"
              variant="outline"
              size="sm"
            >
              <UIcon name="i-lucide-chevron-left" class="w-4 h-4 mr-1" />
              {{ t('common.previous') }}
            </UButton>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{
                t('records.pagination.pageOf', {
                  current: currentPage,
                  total: totalPages,
                })
              }}
            </span>
            <UButton
              @click="nextPage"
              :disabled="currentPage === totalPages"
              variant="outline"
              size="sm"
            >
              {{ t('common.next') }}
              <UIcon name="i-lucide-chevron-right" class="w-4 h-4 ml-1" />
            </UButton>
          </div>
        </div>

        <!-- Regular List for Smaller Datasets -->
        <div v-else class="space-y-6">
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

    <!-- Load More Button -->
    <div v-if="shouldShowLoadMore" class="text-center py-6">
      <UButton
        @click="loadMoreRecords"
        color="primary"
        variant="outline"
        size="lg"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4 mr-2" />
        Load More Records
      </UButton>
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
