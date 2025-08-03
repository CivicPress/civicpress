<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

const recordsStore = useRecordsStore()

// Route and router for URL state management
const route = useRoute()
const router = useRouter()

// Reactive data
const searchQuery = ref('')
const filters = ref({
    search: '',
    types: [] as string[],
    statuses: [] as string[]
})

// URL state management functions
const updateURL = () => {
    const query: any = {}

    if (searchQuery.value) query.search = searchQuery.value
    if (filters.value.types.length > 0) query.types = filters.value.types.join(',')
    if (filters.value.statuses.length > 0) query.statuses = filters.value.statuses.join(',')

    navigateTo({ query }, { replace: true })
}

const restoreFromURL = () => {
    // Restore search query
    if (route.query.search) {
        searchQuery.value = route.query.search as string
        filters.value.search = route.query.search as string
    }

    // Restore record types
    if (route.query.types) {
        const types = (route.query.types as string).split(',')
        filters.value.types = types
    }

    // Restore record statuses
    if (route.query.statuses) {
        const statuses = (route.query.statuses as string).split(',')
        filters.value.statuses = statuses
    }
}

// Debounced API search function
const debouncedApiSearch = useDebounceFn(async (query: string) => {
    const typeFilter = filters.value.types.length > 0 ? filters.value.types.join(',') : undefined
    const statusFilter = filters.value.statuses.length > 0 ? filters.value.statuses.join(',') : undefined

    // Only search if there's a query, otherwise load initial records
    if (query && query.trim()) {
        await recordsStore.searchRecords(query, {
            type: typeFilter,
            status: statusFilter,
        })
    } else {
        await recordsStore.loadInitialRecords({
            type: typeFilter,
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
    filters.value = newFilters
    updateURL()

    // Trigger search with new filters
    const typeFilter = newFilters.types.length > 0 ? newFilters.types.join(',') : undefined
    const statusFilter = newFilters.statuses.length > 0 ? newFilters.statuses.join(',') : undefined

    // Only use searchRecords if there's a search query, otherwise use loadInitialRecords
    if (searchQuery.value && searchQuery.value.trim()) {
        recordsStore.searchRecords(searchQuery.value, {
            type: typeFilter,
            status: statusFilter,
        })
    } else {
        recordsStore.loadInitialRecords({
            type: typeFilter,
            status: statusFilter,
        })
    }
}

// On mounted - restore from URL and fetch data
onMounted(async () => {
    // Restore state from URL first
    restoreFromURL()

    // Start fetching records immediately
    await recordsStore.loadInitialRecords({
        type: filters.value.types.length > 0 ? filters.value.types.join(',') : undefined,
        status: filters.value.statuses.length > 0 ? filters.value.statuses.join(',') : undefined
    })
})

const breadcrumbItems = [
    {
        label: 'Records',
    }
]

// Breadcrumbs ref for scroll-to-top functionality
const breadcrumbsRef = ref<HTMLElement>()
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
                <template #right>
                    <HeaderActions :actions="[
                        { label: 'Create Record', icon: 'i-lucide-plus', to: '/records/new', color: 'primary' }
                    ]" />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="space-y-6">
                <UBreadcrumb ref="breadcrumbsRef" :items="breadcrumbItems" />

                <!-- Search and Filters Component -->
                <RecordSearch :initial-filters="filters" @search="handleSearch" @filter-change="handleFilterChange" />

                <!-- Records List Component -->
                <RecordList :filters="filters" :search-query="searchQuery" :breadcrumbs-ref="breadcrumbsRef" />
            </div>
        </template>
    </UDashboardPanel>
</template>
