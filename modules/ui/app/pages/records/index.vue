<script setup lang="ts">

import { useRecordTypes } from '~/composables/useRecordTypes'
import { useRecordStatuses } from '~/composables/useRecordStatuses'
import { useDebounceFn } from '@vueuse/core'

const recordsStore = useRecordsStore()
const {
    recordTypes,
    loading: recordTypesLoading,
    error: recordTypesError,
    fetchRecordTypes,
    getRecordTypeIcon,
    getRecordTypeLabel,
    recordTypeOptions,
} = useRecordTypes()

const {
    recordStatuses,
    loading: recordStatusesLoading,
    error: recordStatusesError,
    fetchRecordStatuses,
    getRecordStatusLabel,
    recordStatusOptions,
} = useRecordStatuses()

// Record utilities composable
const { formatDate, getStatusColor, getTypeIcon, getTypeLabel, getStatusLabel } = useRecordUtils()

// Route and router for URL state management
const route = useRoute()
const router = useRouter()

// Reactive data
const searchQuery = ref('')
const selectedRecordTypes = ref<any[]>([])
const selectedRecordStatuses = ref<any[]>([])

// Pagination state - use store pagination
const currentPage = computed({
    get: () => recordsStore.pagination.page,
    set: (page: number) => {
        recordsStore.setPagination({ page })
    }
})

const pageSize = computed({
    get: () => recordsStore.pagination.limit,
    set: (limit: number) => {
        recordsStore.setPagination({ limit })
    }
})

// Page size options
const pageSizeOptions = [
    { label: '10 per page', value: 10 },
    { label: '20 per page', value: 20 },
    { label: '50 per page', value: 50 },
    { label: '100 per page', value: 100 }
]

// Computed property for selected page size option
const selectedPageSizeOption = computed({
    get: () => pageSizeOptions.find(option => option.value === pageSize.value) || pageSizeOptions[0],
    set: (option: any) => {
        pageSize.value = option.value
    }
})

// URL state management functions
const updateURL = (replace = true) => {
    const query: any = {}

    if (searchQuery.value) query.search = searchQuery.value
    if (selectedRecordTypes.value.length > 0) {
        query.types = selectedRecordTypes.value.map(item =>
            typeof item === 'string' ? item : item.value || item.id
        ).join(',')
    }
    if (selectedRecordStatuses.value.length > 0) {
        query.statuses = selectedRecordStatuses.value.map(item =>
            typeof item === 'string' ? item : item.value || item.id
        ).join(',')
    }
    if (recordsStore.pagination.page > 1) query.page = recordsStore.pagination.page.toString()
    if (recordsStore.pagination.limit !== 10) query.size = recordsStore.pagination.limit.toString()

    if (replace) {
        router.replace({ query })
    } else {
        router.push({ query })
    }
}

const restoreFromURL = () => {
    // Restore search query
    if (route.query.search) {
        searchQuery.value = route.query.search as string
    }

    // Restore record types
    if (route.query.types) {
        const typeValues = (route.query.types as string).split(',')
        selectedRecordTypes.value = typeValues.map(value => ({ value, label: getTypeLabel(value) }))
    }

    // Restore record statuses
    if (route.query.statuses) {
        const statusValues = (route.query.statuses as string).split(',')
        selectedRecordStatuses.value = statusValues.map(value => ({ value, label: getStatusLabel(value) }))
    }

    // Restore pagination
    if (route.query.page) {
        recordsStore.setPagination({ page: Math.max(1, parseInt(route.query.page as string)) })
    }
    if (route.query.size) {
        recordsStore.setPagination({ limit: parseInt(route.query.size as string) || 10 })
    }
}

// Debounced API search - only for API calls
const debouncedApiSearch = useDebounceFn(async (query: string) => {
    if (query && query.trim()) {
        // Extract string values from the selected objects
        const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
        const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

        const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
        const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

        // For search, we still use the search API to get new results
        await recordsStore.searchRecords(query, {
            type: typeFilter,
            status: statusFilter,
            offset: (currentPage.value - 1) * pageSize.value,
            limit: pageSize.value,
        })
    }
}, 300)

// On mounted - restore from URL and fetch data
onMounted(async () => {
    // Restore state from URL first
    restoreFromURL()

    // Start fetching records immediately (don't wait for types/statuses)
    await fetchRecordsForCurrentPage()

    // Fetch record types and statuses in parallel (will use global cache if already fetched)
    Promise.all([
        fetchRecordTypes(),
        fetchRecordStatuses()
    ]).catch(error => {
        console.error('Error fetching record types/statuses:', error)
    })
})

// Function to fetch records for current page
const fetchRecordsForCurrentPage = async () => {
    // Extract string values from the selected objects
    const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
    const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

    const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
    const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

    if (typeFilter || statusFilter) {
        // Fetch filtered records from server
        await recordsStore.fetchFilteredRecords({
            type: typeFilter,
            status: statusFilter,
        })
    } else {
        // If no filters, fetch all records
        await recordsStore.fetchAllRecords()
    }
}

// Watch for filter changes - fetch fresh data and update URL
watch([selectedRecordTypes, selectedRecordStatuses], async () => {
    // Reset to first page when filters change
    recordsStore.setPagination({ page: 1 })

    // Extract string values from the selected objects
    const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
    const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

    const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
    const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

    // Update the store filters for client-side filtering
    recordsStore.setFilters({
        type: typeFilter,
        status: statusFilter
    })

    // Update URL
    updateURL()

    await fetchRecordsForCurrentPage()
})

// Watch for search query changes - fetch fresh data and update URL
watch(searchQuery, (newQuery) => {
    // Reset to first page when search changes
    recordsStore.setPagination({ page: 1 })

    // Extract current type and status filters to preserve them
    const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
    const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

    const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
    const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

    // Update the filter for client-side filtering, preserving type and status filters
    recordsStore.setFilters({
        type: typeFilter,
        status: statusFilter,
        search: newQuery
    })

    // Update URL
    updateURL()

    // Debounced API call for server-side search
    if (newQuery && newQuery.trim()) {
        debouncedApiSearch(newQuery)
    } else {
        // When search is cleared, fetch current filtered records or all records
        fetchRecordsForCurrentPage()
    }
})

// Watch for page changes
watch(currentPage, async () => {
    // Update URL
    updateURL()
    // No need to fetch since pagination is handled by the store getter
})

// Watch for page size changes
watch(pageSize, async () => {
    // Reset to first page when page size changes
    recordsStore.setPagination({ page: 1 })
    // Update URL
    updateURL()
    // No need to fetch since pagination is handled by the store getter
})

// Handle page change from pagination component
const handlePageChange = async (page: number) => {
    recordsStore.setPagination({ page })
    // No need to fetch since pagination is handled by the store getter
}

// Computed properties for better reactivity
const displayRecords = computed(() => {
    return recordsStore.filteredRecords
})

const hasActiveFilters = computed(() => {
    return searchQuery.value || selectedRecordTypes.value.length > 0 || selectedRecordStatuses.value.length > 0
})

const totalRecords = computed(() => {
    return recordsStore.totalRecords
})

const totalFilteredRecords = computed(() => {
    return recordsStore.totalFilteredRecords
})

// Check if we should show loading state
const shouldShowLoading = computed(() => {
    return recordsStore.isLoading
})

// Computed properties for reactive pagination data
const paginationTotal = computed(() => recordsStore.totalFilteredRecords)
const paginationLimit = computed(() => recordsStore.pagination.limit)

// Ensure pagination data is reactive to page size changes
const effectivePageSize = computed(() => recordsStore.pagination.limit)

const totalPages = computed(() => {
    return Math.ceil(paginationTotal.value / effectivePageSize.value)
})

const currentPageStart = computed(() => {
    return paginationTotal.value > 0 ? ((currentPage.value - 1) * effectivePageSize.value + 1) : 0
})

const currentPageEnd = computed(() => {
    return Math.min(currentPage.value * effectivePageSize.value, paginationTotal.value)
})

const recordTypeOptionsComputed = computed(() => {
    return recordTypeOptions().map((option: any) => {
        return {
            label: option.label,
            icon: option.icon,
            value: option.value // Use value instead of id
        }
    })
})

const recordStatusOptionsComputed = computed(() => {
    return recordStatusOptions().map((option: any) => {
        return {
            label: option.label,
            icon: option.icon,
            value: option.value // Use value instead of id
        }
    })
})

</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar title="Records" />
        </template>

        <template #body>
            <div class="space-y-6">
                <!-- Search and Filters -->
                <div class="flex flex-col sm:flex-row gap-4">
                    <UInput v-model="searchQuery" placeholder="Search records..." icon="i-lucide-search" class="flex-1"
                        :ui="{ trailing: 'pe-1' }">
                        <template v-if="searchQuery?.length" #trailing>
                            <UButton color="neutral" variant="link" size="sm" icon="i-lucide-circle-x"
                                aria-label="Clear search" @click="searchQuery = ''" />
                        </template>
                    </UInput>
                    <USelectMenu v-model="selectedRecordTypes" :items="recordTypeOptionsComputed" multiple
                        :loading="recordTypesLoading" placeholder="Select Record Types" class="w-full sm:w-48">
                        <template #trailing>
                            <UButton v-if="selectedRecordTypes.length > 0" icon="i-lucide-x" color="neutral"
                                variant="ghost" size="xs" @click="selectedRecordTypes = []" />
                        </template>
                    </USelectMenu>
                    <USelectMenu v-model="selectedRecordStatuses" :items="recordStatusOptionsComputed" multiple
                        :loading="recordStatusesLoading" placeholder="Select Record Statuses" class="w-full sm:w-48">
                        <template #trailing>
                            <UButton v-if="selectedRecordStatuses.length > 0" icon="i-lucide-x" color="neutral"
                                variant="ghost" size="xs" @click="selectedRecordStatuses = []" />
                        </template>
                    </USelectMenu>
                </div>

                <!-- Records Summary -->
                <div class="text-sm text-gray-600">
                    <span v-if="hasActiveFilters">
                        Showing {{ currentPageStart }}-{{ currentPageEnd }}
                        of {{ paginationTotal }} filtered records
                        ({{ totalPages }} pages)
                    </span>
                    <span v-else>
                        Showing {{ currentPageStart }}-{{ currentPageEnd }}
                        of {{ paginationTotal }} records
                        ({{ totalPages }} pages)
                    </span>
                </div>

                <!-- Error Display -->
                <UAlert v-if="recordsStore.recordsError" color="error" variant="soft" :title="recordsStore.recordsError"
                    icon="i-lucide-alert-circle" />
                <UAlert v-if="recordStatusesError" color="error" variant="soft" :title="recordStatusesError"
                    icon="i-lucide-alert-circle" />

                <!-- Records List - Show immediately, don't wait for loading -->
                <div class="space-y-4">
                    <div v-if="displayRecords.length === 0 && !recordsStore.isLoading" class="text-center py-12">
                        <UIcon name="i-lucide-file-text" size="4xl" class="mx-auto mb-4 text-gray-400" />
                        <h3 class="text-lg font-medium text-gray-900 mb-2">
                            {{ searchQuery ? 'No search results found' : 'No records found' }}
                        </h3>
                        <p class="text-gray-600">
                            {{ searchQuery ? 'Try adjusting your search terms.' : 'Try adjusting your filters.' }}
                        </p>
                    </div>

                    <div v-else-if="recordsStore.isLoading" class="text-center py-12">
                        <UIcon name="i-lucide-loader-2" class="w-8 h-8 mx-auto animate-spin text-gray-400" />
                        <p class="mt-2 text-gray-600">Loading records...</p>
                    </div>

                    <div v-else class="grid gap-4">
                        <UCard v-for="record in displayRecords" :key="record.id"
                            class="hover:shadow-md transition-shadow cursor-pointer"
                            @click="navigateTo(`/records/${record.type}/${record.id}`)">
                            <div class="flex items-start justify-between">
                                <div class="flex items-start space-x-4 flex-1">
                                    <!-- Type Icon -->
                                    <div class="flex-shrink-0">
                                        <UIcon :name="getTypeIcon(record.type)" class="w-8 h-8 text-gray-500" />
                                    </div>

                                    <!-- Record Info -->
                                    <div class="flex-1 min-w-0">
                                        <h3 class="text-lg font-semibold text-gray-900 mb-1">
                                            {{ record.title }}
                                        </h3>
                                        <p class="text-sm text-gray-600 mb-2 line-clamp-2">
                                            {{ record.content.substring(0, 150) }}...
                                        </p>
                                        <div class="flex items-center space-x-4 text-xs text-gray-500">
                                            <span>Type: {{ record.type }}</span>
                                            <span>Created: {{ formatDate(record.created_at) }}</span>
                                            <span v-if="record.author">By: {{ record.author }}</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Status Badge -->
                                <div class="flex-shrink-0">
                                    <UBadge :color="getStatusColor(record.status) as any" variant="soft" size="sm">
                                        {{ record.status }}
                                    </UBadge>
                                </div>
                            </div>

                            <!-- Tags -->
                            <div v-if="record.metadata?.tags && record.metadata.tags.length > 0"
                                class="mt-3 pt-3 border-t">
                                <div class="flex flex-wrap gap-1">
                                    <UBadge v-for="tag in record.metadata.tags" :key="tag" color="neutral"
                                        variant="soft" size="xs">
                                        {{ tag }}
                                    </UBadge>
                                </div>
                            </div>
                        </UCard>
                    </div>
                </div>

                <!-- Loading indicator for background updates -->
                <div v-if="recordsStore.isLoading && displayRecords.length > 0" class="text-center py-4">
                    <div class="flex items-center justify-center space-x-2 text-sm text-gray-600">
                        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
                        <span>Updating records...</span>
                    </div>
                </div>

                <!-- Pagination -->
                <div class="flex justify-between items-center mt-6">
                    <!-- Page size dropdown on the left -->
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-600">Show:</span>
                        <USelectMenu v-model="selectedPageSizeOption" :items="pageSizeOptions" class="w-32" size="sm" />
                    </div>

                    <!-- Pagination on the right -->
                    <UPagination v-model:page="currentPage" :total="paginationTotal" :per-page="effectivePageSize"
                        variant="link" @update:page="handlePageChange" v-if="paginationTotal > effectivePageSize" />
                </div>
            </div>


        </template>
    </UDashboardPanel>
</template>
