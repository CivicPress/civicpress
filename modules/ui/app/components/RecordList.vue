<script setup lang="ts">
import type { CivicRecord } from '~/stores/records'
import { useVirtualList } from '@vueuse/core'
import { useRecordsStore } from '~/stores/records'

// Props
interface Props {
  recordType?: string | null // Filter by specific record type
  filters?: {
    search?: string
    types?: string[]
    statuses?: string[]
  }
  searchQuery?: string
  breadcrumbsRef?: Ref<HTMLElement | undefined>
}

const props = withDefaults(defineProps<Props>(), {
  recordType: null,
  filters: () => ({}),
  searchQuery: ''
})

// Emits
const emit = defineEmits<{
  loadMore: []
  recordClick: [record: CivicRecord]
}>()

// Store
const recordsStore = useRecordsStore()

// Record utilities composable
const { formatDate, getStatusColor, getTypeIcon, getTypeLabel, getStatusLabel } = useRecordUtils()

// Reactive data
const loading = ref(false)

// Computed properties for better reactivity
const displayRecords = computed(() => {
  return recordsStore.records
})

// Records for display (same as displayRecords since we're cursor-based)
const processedRecords = computed(() => {
  return displayRecords.value.map(record => ({
    ...record,
    formattedDate: formatDate(record.created_at),
    statusColor: getStatusColor(record.status),
    typeIcon: getTypeIcon(record.type),
    typeLabel: getTypeLabel(record.type),
    statusLabel: getStatusLabel(record.status),
    excerpt: record.content.substring(0, 150) + '...'
  }))
})

// Check if we should show loading state
const shouldShowLoading = computed(() => {
  return recordsStore.isLoading
})

// Check if we should show "Load More" button
const shouldShowLoadMore = computed(() => {
  return recordsStore.hasMore && displayRecords.value.length > 0 && !recordsStore.isLoading
})

// Load more records
const loadMoreRecords = async () => {
  if (!recordsStore.hasMore || recordsStore.isLoading) return

  loading.value = true
  try {
    await recordsStore.loadMoreRecords({
      type: props.filters?.types?.join(','),
      status: props.filters?.statuses?.join(',')
    })
    emit('loadMore')
  } catch (error) {
    console.error('Error loading more records:', error)
  } finally {
    loading.value = false
  }
}

// Navigate to record detail
const navigateToRecord = (record: CivicRecord) => {
  emit('recordClick', record)
  navigateTo(`/records/${record.type}/${record.id}`)
}

// Simple pagination for large datasets instead of virtual scrolling
const itemsPerPage = 50
const currentPage = ref(1)

const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return processedRecords.value.slice(start, end)
})

const totalPages = computed(() => Math.ceil(displayRecords.value.length / itemsPerPage))

const scrollToTop = () => {
  // Scroll to the breadcrumbs instead of the very top
  if (props.breadcrumbsRef?.value) {
    props.breadcrumbsRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    scrollToTop()
  }
}

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    scrollToTop()
  }
}

// Initialize records if needed
onMounted(async () => {
  if (displayRecords.value.length === 0) {
    await recordsStore.loadInitialRecords({
      type: props.filters?.types?.join(','),
      status: props.filters?.statuses?.join(',')
    })
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Records List - Show immediately, don't wait for loading -->
    <div class="space-y-4">
      <!-- Show existing records immediately if we have them -->
      <div v-if="displayRecords.length > 0" class="space-y-4">
        <!-- Pagination for Large Lists -->
        <div v-if="displayRecords.length > 50" class="space-y-4">
          <!-- Paginated Records -->
          <div class="space-y-4">
            <UCard v-for="record in paginatedRecords" :key="record.id"
              class="hover:shadow-md transition-shadow cursor-pointer" @click="navigateToRecord(record)">
              <div class="flex items-start justify-between">
                <div class="flex items-start space-x-4 flex-1">
                  <!-- Type Icon -->
                  <div class="flex-shrink-0">
                    <UIcon :name="record.typeIcon" class="w-8 h-8 text-gray-500" />
                  </div>

                  <!-- Record Info -->
                  <div class="flex-1 min-w-0">
                    <h3 class="text-lg font-semibold mb-1">
                      {{ record.title }}
                    </h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                      {{ record.excerpt }}
                    </p>
                    <div class="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Type: {{ record.typeLabel }}</span>
                      <span>Created: {{ record.formattedDate }}</span>
                      <span v-if="record.author">By: {{ record.author }}</span>
                    </div>
                  </div>
                </div>

                <!-- Status Badge -->
                <div class="flex-shrink-0">
                  <UBadge :color="record.statusColor as any" variant="soft" size="sm">
                    {{ record.statusLabel }}
                  </UBadge>
                </div>
              </div>

              <!-- Tags -->
              <div v-if="record.metadata?.tags && record.metadata.tags.length > 0" class="mt-3 pt-3 border-t">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="tag in record.metadata.tags" :key="tag" color="neutral" variant="soft" size="xs">
                    {{ tag }}
                  </UBadge>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Pagination Controls -->
          <div class="flex items-center justify-between">
            <UButton @click="prevPage" :disabled="currentPage === 1" variant="outline" size="sm">
              <UIcon name="i-lucide-chevron-left" class="w-4 h-4 mr-1" />
              Previous
            </UButton>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Page {{ currentPage }} of {{ totalPages }}
            </span>
            <UButton @click="nextPage" :disabled="currentPage === totalPages" variant="outline" size="sm">
              Next
              <UIcon name="i-lucide-chevron-right" class="w-4 h-4 ml-1" />
            </UButton>
          </div>
        </div>

        <!-- Regular List for Smaller Datasets -->
        <div v-else class="space-y-4">
          <UCard v-for="record in processedRecords" :key="record.id"
            class="hover:shadow-md transition-shadow cursor-pointer" @click="navigateToRecord(record)">
            <div class="flex items-start justify-between">
              <div class="flex items-start space-x-4 flex-1">
                <!-- Type Icon -->
                <div class="flex-shrink-0">
                  <UIcon :name="record.typeIcon" class="w-8 h-8 text-gray-500" />
                </div>

                <!-- Record Info -->
                <div class="flex-1 min-w-0">
                  <h3 class="text-lg font-semibold mb-1">
                    {{ record.title }}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                    {{ record.excerpt }}
                  </p>
                  <div class="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Type: {{ record.typeLabel }}</span>
                    <span>Created: {{ record.formattedDate }}</span>
                    <span v-if="record.author">By: {{ record.author }}</span>
                  </div>
                </div>
              </div>

              <!-- Status Badge -->
              <div class="flex-shrink-0">
                <UBadge :color="record.statusColor as any" variant="soft" size="sm">
                  {{ record.statusLabel }}
                </UBadge>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="record.metadata?.tags && record.metadata.tags.length > 0" class="mt-3 pt-3 border-t">
              <div class="flex flex-wrap gap-1">
                <UBadge v-for="tag in record.metadata.tags" :key="tag" color="neutral" variant="soft" size="xs">
                  {{ tag }}
                </UBadge>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Show loading only when no existing records -->
      <div v-else-if="shouldShowLoading && displayRecords.length === 0" class="text-center py-12">
        <div class="space-y-4">
          <RecordCardSkeleton v-for="i in 3" :key="i" />
        </div>
      </div>

      <!-- Show no results when not loading and no records -->
      <div v-else-if="displayRecords.length === 0 && !shouldShowLoading" class="text-center py-12">
        <UIcon name="i-lucide-file-text" size="4xl" class="mx-auto mb-4 text-gray-400" />
        <h3 class="text-lg font-medium mb-2">
          {{ searchQuery ? 'No search results found' : 'No records found' }}
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          {{ searchQuery ? 'Try adjusting your search terms.' : 'Try adjusting your filters.' }}
        </p>
      </div>
    </div>

    <!-- Loading Indicator (below records) -->
    <div v-if="shouldShowLoading && displayRecords.length > 0" class="text-center py-6">
      <div class="flex items-center justify-center space-x-2">
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-gray-500" />
        <span class="text-sm text-gray-600 dark:text-gray-400">Loading more records...</span>
      </div>
    </div>

    <!-- Load More Button -->
    <div v-if="shouldShowLoadMore" class="text-center py-6">
      <UButton @click="loadMoreRecords" color="primary" variant="outline" size="lg">
        <UIcon name="i-lucide-plus" class="w-4 h-4 mr-2" />
        Load More Records
      </UButton>
    </div>

    <!-- Error Display -->
    <UAlert v-if="recordsStore.recordsError" color="error" variant="soft" :title="recordsStore.recordsError"
      icon="i-lucide-alert-circle" />
  </div>
</template>