<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

const recordsStore = useRecordsStore()

// Route and router for URL state management
const route = useRoute()
const router = useRouter()

// Get the record type from the route
const type = route.params.type as string

// Reactive data
const searchQuery = ref('')
const filters = ref({
    search: '',
    types: [type], // Pre-select the record type
    statuses: [] as string[]
})

// URL state management functions
const updateURL = () => {
    const query: any = {}

    if (searchQuery.value) query.search = searchQuery.value
    if (filters.value.statuses.length > 0) query.statuses = filters.value.statuses.join(',')

    navigateTo({ query }, { replace: true })
}

const restoreFromURL = () => {
    // Restore search query
    if (route.query.search) {
        searchQuery.value = route.query.search as string
        filters.value.search = route.query.search as string
    }

    // Restore record statuses (types are always pre-selected)
    if (route.query.statuses) {
        const statuses = (route.query.statuses as string).split(',')
        filters.value.statuses = statuses
    }
}

// Debounced API search function
const debouncedApiSearch = useDebounceFn(async (query: string) => {
    const statusFilter = filters.value.statuses.length > 0 ? filters.value.statuses.join(',') : undefined

    // Only search if there's a query, otherwise load initial records
    if (query && query.trim()) {
        await recordsStore.searchRecords(query, {
            type: type,
            status: statusFilter,
        })
    } else {
        await recordsStore.loadInitialRecords({
            type: type,
            status: statusFilter,
        })
    }
}, 300)

// Handle search changes
const handleSearch = (query: string) => {
    searchQuery.value = query
    filters.value.search = query
    updateURL()
    debouncedApiSearch(query)
}

// Handle filter changes
const handleFilterChange = (newFilters: { search: string, types: string[], statuses: string[] }) => {
    // Always keep the record type selected
    newFilters.types = [type]
    filters.value = newFilters
    updateURL()

    // Trigger search with new filters
    const statusFilter = newFilters.statuses.length > 0 ? newFilters.statuses.join(',') : undefined

    // Only use searchRecords if there's a search query, otherwise use loadInitialRecords
    if (searchQuery.value && searchQuery.value.trim()) {
        recordsStore.searchRecords(searchQuery.value, {
            type: type,
            status: statusFilter,
        })
    } else {
        recordsStore.loadInitialRecords({
            type: type,
            status: statusFilter,
        })
    }
}

// Get record type display name
const { getRecordTypeLabel } = useRecordTypes()
const recordTypeLabel = computed(() => getRecordTypeLabel(type))

// On mounted - restore from URL and fetch data
onMounted(async () => {
    // Restore state from URL first
    restoreFromURL()

    // Start fetching records immediately
    await recordsStore.loadInitialRecords({
        type: type,
        status: filters.value.statuses.length > 0 ? filters.value.statuses.join(',') : undefined
    })
})

const breadcrumbItems = computed(() => [
    {
        label: 'Records',
        to: '/records'
    },
    {
        label: recordTypeLabel.value,
    }
])
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #title>
                    <h1 class="text-lg font-semibold">
                        {{ recordTypeLabel }}
                    </h1>
                </template>
                <template #description>
                    Browse and search through {{ recordTypeLabel.toLowerCase() }} records
                </template>
                <template #right>
                    <UButton :to="`/records/${type}/new`" color="primary" icon="i-lucide-plus">
                        Create {{ recordTypeLabel }}
                    </UButton>
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="space-y-6">
                <UBreadcrumb :items="breadcrumbItems" />

                <!-- Search and Filters Component -->
                <RecordSearch :initial-filters="filters" :record-type="type" :disable-type-filter="true"
                    @search="handleSearch" @filter-change="handleFilterChange" />

                <!-- Records List Component -->
                <RecordList :record-type="type" :filters="filters" :search-query="searchQuery" />
            </div>
        </template>
    </UDashboardPanel>
</template>