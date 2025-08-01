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
    getRecordTypeOptions,
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

// URL state management functions
const updateURL = () => {
    const query: any = {}

    if (searchQuery.value) query.search = searchQuery.value
    if (selectedRecordTypes.value.length > 0) query.types = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id).join(',')
    if (selectedRecordStatuses.value.length > 0) query.statuses = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id).join(',')

    navigateTo({ query }, { replace: true })
}

const restoreFromURL = () => {
    const route = useRoute()

    // Restore search query
    if (route.query.search) searchQuery.value = route.query.search as string

    // Restore record types
    if (route.query.types) {
        const types = (route.query.types as string).split(',')
        selectedRecordTypes.value = types.map(type => ({ value: type, label: getTypeLabel(type) }))
    }

    // Restore record statuses
    if (route.query.statuses) {
        const statuses = (route.query.statuses as string).split(',')
        selectedRecordStatuses.value = statuses.map(status => ({ value: status, label: getStatusLabel(status) }))
    }
}

// Debounced API search function
const debouncedApiSearch = useDebounceFn(async (query: string) => {
    // Extract string values from the selected objects
    const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
    const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

    const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
    const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

    // Use the new search method
    await recordsStore.searchRecords(query, {
        type: typeFilter,
        status: statusFilter,
    })
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
const fetchRecordsForCurrentPage = async (searchQuery?: string) => {
    // Extract string values from the selected objects
    const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
    const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

    const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
    const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

    // If there's a search query, use search
    if (searchQuery && searchQuery.trim()) {
        await recordsStore.searchRecords(searchQuery, {
            type: typeFilter,
            status: statusFilter,
        })
    } else {
        // Load initial records
        await recordsStore.loadInitialRecords({
            type: typeFilter,
            status: statusFilter,
        })
    }
}

// Function to load more records
const loadMoreRecords = async () => {
    // Extract current filters
    const typeValues = selectedRecordTypes.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)
    const statusValues = selectedRecordStatuses.value.map((item: any) => typeof item === 'string' ? item : item.value || item.id)

    const typeFilter = typeValues.length > 0 ? typeValues.join(',') : undefined
    const statusFilter = statusValues.length > 0 ? statusValues.join(',') : undefined

    // Load more records
    await recordsStore.loadMoreRecords({
        type: typeFilter,
        status: statusFilter,
    })
}

// Watch for filter changes - fetch fresh data and update URL
watch([selectedRecordTypes, selectedRecordStatuses], async () => {
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

    // Clear records immediately when filters change to show empty state
    recordsStore.clearRecords()

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

    // Clear records immediately when query changes to show empty state
    if (newQuery && newQuery.trim()) {
        recordsStore.clearRecords()
    } else if (!newQuery || !newQuery.trim()) {
        // Also clear records when search is cleared
        recordsStore.clearRecords()
    }

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
        // When search is cleared, refetch the original records with current filters
        fetchRecordsForCurrentPage(undefined)
    }
})

// Computed properties for better reactivity
const displayRecords = computed(() => {
    // Just show what's in the store (all loaded records)
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
        statusLabel: getTypeLabel(record.status),
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

// Check if we should show "Load More" button
const shouldShowLoadMore = computed(() => {
    return recordsStore.hasMore && displayRecords.value.length > 0 && !recordsStore.isLoading
})

const recordTypeOptionsComputed = computed(() => {
    return getRecordTypeOptions().map((option: any) => {
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

// Handle clicking outside suggestions dropdown
const handleClickOutside = (event: Event) => {
    const target = event.target as Element
    // Only clear suggestions if:
    // 1. Click is outside the search suggestions container
    // 2. Search query is not empty (to avoid clearing when no suggestions are shown)
    if (!target.closest('.search-suggestions-container') && searchQuery.value && searchQuery.value.trim()) {
        clearSuggestions()
    }
}

// Virtual list for large datasets
const virtualListContainer = ref<HTMLElement>()
const { list: virtualList } = useVirtualList(processedRecords, {
    itemHeight: 120,
})

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})

const breadcrumbItems = [
    {
        label: 'Records',
    }
]

</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #title>
                    <h1 class="text-lg font-semibold">
                        Browse Records
                    </h1>
                </template>
                <template #description>
                    Browse and search through all records
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="space-y-6">
                <UBreadcrumb :items="breadcrumbItems" />
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
                        Showing {{ displayRecords.length }} filtered records
                    </span>
                    <span v-else>
                        Showing {{ displayRecords.length }} records
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

                <!-- Loading Indicator (below records) -->
                <div v-if="recordsStore.isLoading && displayRecords.length > 0" class="text-center py-6">
                    <div class="flex items-center justify-center space-x-2">
                        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-gray-500" />
                        <span class="text-sm text-gray-600">Loading more records...</span>
                    </div>
                </div>

                <!-- Load More Button -->
                <div v-if="shouldShowLoadMore" class="text-center py-6">
                    <UButton @click="loadMoreRecords" color="primary" variant="outline" size="lg">
                        <UIcon name="i-lucide-plus" class="w-4 h-4 mr-2" />
                        Load More Records
                    </UButton>
                </div>
            </div>


        </template>
    </UDashboardPanel>
</template>
