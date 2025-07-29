<script setup lang="ts">

import { useRecordTypes } from '~/composables/useRecordTypes'
import { useRecordStatuses } from '~/composables/useRecordStatuses'
import { useSearchSuggestions } from '~/composables/useSearchSuggestions'
import { useDebounceFn, useIntersectionObserver, useVirtualList } from '@vueuse/core'

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

// Search suggestions composable
const {
    suggestions,
    isLoading: suggestionsLoading,
    error: suggestionsError,
    fetchSuggestions,
    clearSuggestions
} = useSearchSuggestions()

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
    if (currentPage.value > 1) query.page = currentPage.value.toString()
    if (pageSize.value !== 10) query.size = pageSize.value.toString()

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
        currentPage.value = Math.max(1, parseInt(route.query.page as string))
    }
    if (route.query.size) {
        pageSize.value = parseInt(route.query.size as string) || 10
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
    // Don't fetch suggestions if we're setting from a click
    if (isSettingFromClick.value) {
        return
    }

    // Reset to first page when search changes
    recordsStore.setPagination({ page: 1 })

    // Extract current type and status filters to preserve them
    const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
    const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

    const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
    const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

    // Update the filter for client-side filtering IMMEDIATELY and synchronously
    recordsStore.setFilters({
        type: typeFilter,
        status: statusFilter,
        search: newQuery
    })

    // Update URL
    updateURL()

    // Fetch suggestions for search input
    if (newQuery && newQuery.trim().length >= 2) {
        fetchSuggestions(newQuery)
    } else if (!newQuery || newQuery.trim().length === 0) {
        // Only clear suggestions when query is actually empty
        clearSuggestions()
    }
    // Don't clear suggestions while user is still typing

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
    currentPage.value = 1
    // Update URL
    updateURL()
    // No need to fetch since pagination is handled client-side
})

// Handle page change from pagination component
const handlePageChange = async (page: number) => {
    currentPage.value = page
    // Update URL
    updateURL()
    // No need to fetch since pagination is handled client-side
}

// Handle clicking outside suggestions dropdown
const handleClickOutside = (event: Event) => {
    const target = event.target as Element
    if (!target.closest('.search-suggestions-container')) {
        clearSuggestions()
    }
}

// Computed properties for better reactivity
const displayRecords = computed(() => {
    // Direct filtering based on current search query for immediate reactivity
    const currentSearch = searchQuery.value
    const currentRecords = recordsStore.records

    // If no search query, return all records
    if (!currentSearch || !currentSearch.trim()) {
        return currentRecords
    }

    // Apply search filter directly for immediate feedback
    const search = currentSearch.toLowerCase().trim()
    const filtered = currentRecords.filter(record =>
        record.title.toLowerCase().includes(search) ||
        record.content.toLowerCase().includes(search) ||
        record.metadata?.tags?.some(tag => tag.toLowerCase().includes(search)) ||
        false
    )

    return filtered
})

// Paginated records for display
const paginatedRecords = computed(() => {
    const startIndex = (currentPage.value - 1) * effectivePageSize.value
    const endIndex = startIndex + effectivePageSize.value
    return displayRecords.value.slice(startIndex, endIndex)
})

// Memoized computed properties for better performance
const memoizedRecordTypes = computed(() => recordTypeOptions())
const memoizedRecordStatuses = computed(() => recordStatusOptions())

// Cached record processing
const processedRecords = computed(() => {
    return paginatedRecords.value.map(record => ({
        ...record,
        formattedDate: formatDate(record.created_at),
        statusColor: getStatusColor(record.status),
        typeIcon: getTypeIcon(record.type),
        typeLabel: getTypeLabel(record.type),
        statusLabel: getStatusLabel(record.status),
        excerpt: record.content.substring(0, 150) + '...'
    }))
})

// Optimized filter computation
const hasActiveFilters = computed(() => {
    return searchQuery.value ||
        selectedRecordTypes.value.length > 0 ||
        selectedRecordStatuses.value.length > 0
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
const effectivePageSize = computed(() => pageSize.value)

// Client-side pagination for filtered records
const totalPages = computed(() => {
    return Math.ceil(displayRecords.value.length / effectivePageSize.value)
})

const currentPageStart = computed(() => {
    return displayRecords.value.length > 0 ? ((currentPage.value - 1) * effectivePageSize.value + 1) : 0
})

const currentPageEnd = computed(() => {
    return Math.min(currentPage.value * effectivePageSize.value, displayRecords.value.length)
})

// Computed property to determine if pagination should be shown
const shouldShowPagination = computed(() => {
    // Use client-side filtered records for immediate response
    const clientSideTotal = displayRecords.value.length
    return clientSideTotal > effectivePageSize.value
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

// Computed properties
const defaultDescription = computed(() => 'A modern civic technology platform for transparent, accessible, and accountable local government.')

// Lazy loading utilities
const useLazyLoad = () => {
    const isIntersecting = ref(false)
    const element = ref<HTMLElement>()

    const { stop } = useIntersectionObserver(element, ([entry]) => {
        if (entry) {
            isIntersecting.value = entry.isIntersecting
        }
    })

    onUnmounted(() => stop())

    return { isIntersecting, element }
}

// Debounced search for better performance
const debouncedSearch = useDebounceFn((query: string) => {
    searchQuery.value = query
    updateURL()
}, 300)

// Immediate search update (for suggestions)
const immediateSearch = (query: string) => {
    searchQuery.value = query
    updateURL()
}

// Flag to prevent fetching suggestions when setting from click
const isSettingFromClick = ref(false)

// Handle suggestion click
const handleSuggestionClick = (suggestion: string) => {
    // Set flag to prevent watcher from fetching suggestions
    isSettingFromClick.value = true
    searchQuery.value = suggestion

    // Small delay to ensure the click registers and input updates
    setTimeout(() => {
        clearSuggestions()
        // Reset flag after a short delay
        setTimeout(() => {
            isSettingFromClick.value = false
        }, 200)
    }, 100)
}

// Handle input blur with delay to allow suggestion clicks
const handleInputBlur = () => {
    // Delay clearing suggestions to allow click events to register
    setTimeout(() => {
        clearSuggestions()
    }, 150)
}

// Performance monitoring
const performanceMonitor = ref()
const isPerformanceMode = ref(false) // Toggle with Ctrl+Shift+P

// Virtual list for large datasets
const virtualListContainer = ref<HTMLElement>()
const { list: virtualList } = useVirtualList(processedRecords, {
    itemHeight: 120,
})

// Update performance metrics
const updatePerformanceMetrics = () => {
    if (performanceMonitor.value) {
        performanceMonitor.value.metrics.recordCount = processedRecords.value.length
        performanceMonitor.value.metrics.filterCount = selectedRecordTypes.value.length + selectedRecordStatuses.value.length
        performanceMonitor.value.trackRenderTime()
    }
}

// Keyboard shortcut for performance mode
const togglePerformanceMode = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'P') {
        isPerformanceMode.value = !isPerformanceMode.value
        event.preventDefault()

        // Show visual feedback
        console.log(`Performance mode ${isPerformanceMode.value ? 'enabled' : 'disabled'}`)
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', togglePerformanceMode)
    updatePerformanceMetrics()

    // Show help message
    console.log('Press Ctrl+Shift+P to toggle performance monitor')
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('keydown', togglePerformanceMode)
})

// Watch for changes and update metrics
watch([processedRecords, selectedRecordTypes, selectedRecordStatuses], () => {
    updatePerformanceMetrics()
})

</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar title="Records">
                <!-- Performance Mode Indicator -->
                <template #trailing>
                    <div v-if="isPerformanceMode" class="flex items-center space-x-2">
                        <UIcon name="i-lucide-zap" class="w-4 h-4 text-yellow-500" />
                        <span class="text-xs text-yellow-600 font-medium">Performance Mode</span>
                    </div>
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="space-y-6">
                <!-- Search and Filters -->
                <div class="flex flex-col sm:flex-row gap-4">
                    <!-- Search Input with Suggestions -->
                    <div class="flex-1 relative search-suggestions-container">
                        <UInput v-model="searchQuery" @blur="handleInputBlur" placeholder="Search records..."
                            icon="i-lucide-search" class="w-full" :ui="{ trailing: 'pe-1' }">
                            <template v-if="searchQuery?.length" #trailing>
                                <UButton color="neutral" variant="link" size="sm" icon="i-lucide-circle-x"
                                    aria-label="Clear search" @click="searchQuery = ''" />
                            </template>
                        </UInput>

                        <!-- Suggestions Dropdown -->
                        <div v-if="suggestions.length > 0"
                            class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                            <div class="p-2">
                                <div class="text-xs text-gray-500 mb-2 px-2">
                                    <UIcon name="i-lucide-lightbulb" class="w-3 h-3 inline mr-1" />
                                    Suggestions
                                </div>
                                <div v-for="suggestion in suggestions" :key="suggestion"
                                    class="px-3 py-2 hover:bg-gray-100 rounded cursor-pointer text-sm"
                                    @click="handleSuggestionClick(suggestion)">
                                    <UIcon name="i-lucide-search" class="w-3 h-3 inline mr-2 text-gray-400" />
                                    {{ suggestion }}
                                </div>
                            </div>
                        </div>

                        <!-- Loading indicator for suggestions -->
                        <div v-if="suggestionsLoading && searchQuery && searchQuery.trim().length >= 2"
                            class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                            <div class="flex items-center justify-center text-sm text-gray-500">
                                <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin mr-2" />
                                Loading suggestions...
                            </div>
                        </div>
                    </div>

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
                        of {{ displayRecords.length }} filtered records
                        ({{ totalPages }} pages)
                    </span>
                    <span v-else>
                        Showing {{ currentPageStart }}-{{ currentPageEnd }}
                        of {{ displayRecords.length }} records
                        ({{ totalPages }} pages)
                    </span>

                    <!-- Performance indicator -->
                    <div v-if="displayRecords.length > 50" class="mt-2 text-xs text-green-600">
                        <UIcon name="i-lucide-zap" class="w-3 h-3 inline mr-1" />
                        Virtual scrolling enabled for large dataset
                        <span class="text-gray-500 ml-2">(Press Ctrl+Shift+P for performance monitor)</span>
                    </div>
                </div>

                <!-- Error Display -->
                <UAlert v-if="recordsStore.recordsError" color="error" variant="soft" :title="recordsStore.recordsError"
                    icon="i-lucide-alert-circle" />
                <UAlert v-if="recordStatusesError" color="error" variant="soft" :title="recordStatusesError"
                    icon="i-lucide-alert-circle" />

                <!-- Records List - Show immediately, don't wait for loading -->
                <div class="space-y-4">
                    <!-- Show existing records immediately if we have them -->
                    <div v-if="displayRecords.length > 0" class="space-y-4">
                        <!-- Virtual Scrolling for Large Lists -->
                        <div v-if="displayRecords.length > 50" class="space-y-4">
                            <!-- Performance indicator for large lists -->
                            <div class="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                                <UIcon name="i-lucide-zap" class="w-4 h-4 inline mr-1" />
                                Showing {{ displayRecords.length }} records (virtual scrolling enabled)
                            </div>

                            <!-- Virtual List Container -->
                            <div ref="virtualListContainer" class="h-96 overflow-auto border rounded-lg">
                                <div :style="{ height: `${processedRecords.length * 120}px`, position: 'relative' }">
                                    <div v-for="item in virtualList" :key="item.data.id" :style="{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '120px',
                                        transform: `translateY(${item.index * 120}px)`
                                    }">
                                        <UCard class="hover:shadow-md transition-shadow cursor-pointer mx-4 mb-4"
                                            @click="navigateTo(`/records/${item.data.type}/${item.data.id}`)">
                                            <div class="flex items-start justify-between">
                                                <div class="flex items-start space-x-4 flex-1">
                                                    <!-- Type Icon -->
                                                    <div class="flex-shrink-0">
                                                        <UIcon :name="item.data.typeIcon"
                                                            class="w-8 h-8 text-gray-500" />
                                                    </div>

                                                    <!-- Record Info -->
                                                    <div class="flex-1 min-w-0">
                                                        <h3 class="text-lg font-semibold text-gray-900 mb-1">
                                                            {{ item.data.title }}
                                                        </h3>
                                                        <p class="text-sm text-gray-600 mb-2 line-clamp-2">
                                                            {{ item.data.excerpt }}
                                                        </p>
                                                        <div class="flex items-center space-x-4 text-xs text-gray-500">
                                                            <span>Type: {{ item.data.typeLabel }}</span>
                                                            <span>Created: {{ item.data.formattedDate }}</span>
                                                            <span v-if="item.data.author">By: {{ item.data.author
                                                            }}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <!-- Status Badge -->
                                                <div class="flex-shrink-0">
                                                    <UBadge :color="item.data.statusColor as any" variant="soft"
                                                        size="sm">
                                                        {{ item.data.statusLabel }}
                                                    </UBadge>
                                                </div>
                                            </div>

                                            <!-- Tags -->
                                            <div v-if="item.data.metadata?.tags && item.data.metadata.tags.length > 0"
                                                class="mt-3 pt-3 border-t">
                                                <div class="flex flex-wrap gap-1">
                                                    <UBadge v-for="tag in item.data.metadata.tags" :key="tag"
                                                        color="neutral" variant="soft" size="xs">
                                                        {{ tag }}
                                                    </UBadge>
                                                </div>
                                            </div>
                                        </UCard>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Regular List for Smaller Datasets -->
                        <div v-else class="space-y-4">
                            <UCard v-for="record in processedRecords" :key="record.id"
                                class="hover:shadow-md transition-shadow cursor-pointer"
                                @click="navigateTo(`/records/${record.type}/${record.id}`)">
                                <div class="flex items-start justify-between">
                                    <div class="flex items-start space-x-4 flex-1">
                                        <!-- Type Icon -->
                                        <div class="flex-shrink-0">
                                            <UIcon :name="record.typeIcon" class="w-8 h-8 text-gray-500" />
                                        </div>

                                        <!-- Record Info -->
                                        <div class="flex-1 min-w-0">
                                            <h3 class="text-lg font-semibold text-gray-900 mb-1">
                                                {{ record.title }}
                                            </h3>
                                            <p class="text-sm text-gray-600 mb-2 line-clamp-2">
                                                {{ record.excerpt }}
                                            </p>
                                            <div class="flex items-center space-x-4 text-xs text-gray-500">
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

                        <!-- Loading indicator at bottom of list -->
                        <div v-if="recordsStore.isLoading" class="text-center py-6">
                            <div class="flex items-center justify-center text-sm text-gray-500">
                                <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin mr-2" />
                                Getting more records...
                            </div>
                        </div>
                    </div>

                    <!-- Show loading only when no existing records -->
                    <div v-else-if="recordsStore.isLoading && displayRecords.length === 0" class="text-center py-12">
                        <UIcon name="i-lucide-loader-2" class="w-8 h-8 mx-auto animate-spin text-gray-400" />
                        <p class="mt-2 text-gray-600">Loading records...</p>
                    </div>

                    <!-- Show no results when not loading and no records -->
                    <div v-else-if="displayRecords.length === 0 && !recordsStore.isLoading" class="text-center py-12">
                        <UIcon name="i-lucide-file-text" size="4xl" class="mx-auto mb-4 text-gray-400" />
                        <h3 class="text-lg font-medium text-gray-900 mb-2">
                            {{ searchQuery ? 'No search results found' : 'No records found' }}
                        </h3>
                        <p class="text-gray-600">
                            {{ searchQuery ? 'Try adjusting your search terms.' : 'Try adjusting your filters.' }}
                        </p>
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
                    <UPagination v-model:page="currentPage" :total="displayRecords.length" :per-page="effectivePageSize"
                        variant="link" @update:page="handlePageChange" v-if="shouldShowPagination" />
                </div>
            </div>


        </template>
    </UDashboardPanel>

    <!-- Performance Monitor -->
    <PerformanceMonitor ref="performanceMonitor" :enabled="isPerformanceMode" />
</template>
