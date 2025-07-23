<script setup lang="ts">

const recordsStore = useRecordsStore()

// Reactive data
const searchQuery = ref('')
const selectedType = ref('')
const selectedStatus = ref('')

// Record types and statuses for filters
const recordTypes = [
    { value: '', label: 'All Types' },
    { value: 'bylaw', label: 'Bylaws' },
    { value: 'ordinance', label: 'Ordinances' },
    { value: 'policy', label: 'Policies' },
    { value: 'proclamation', label: 'Proclamations' },
    { value: 'resolution', label: 'Resolutions' },
]

const recordStatuses = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
]

// Load records on page mount
onMounted(async () => {
    try {
        await recordsStore.fetchRecords()
    } catch (error) {
        console.error('Failed to load records:', error)
    }
})

// Watch for filter changes
watch([searchQuery, selectedType, selectedStatus], async () => {
    try {
        await recordsStore.fetchRecords({
            search: searchQuery.value,
            type: selectedType.value,
            status: selectedStatus.value,
        })
    } catch (error) {
        console.error('Failed to filter records:', error)
    }
})

// Format date for display
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
}

// Get status color
const getStatusColor = (status: string) => {
    switch (status) {
        case 'draft': return 'neutral'
        case 'pending': return 'primary'
        case 'approved': return 'primary'
        case 'rejected': return 'error'
        default: return 'neutral'
    }
}

// Get type icon
const getTypeIcon = (type: string) => {
    switch (type) {
        case 'bylaw': return 'i-lucide-file-text'
        case 'ordinance': return 'i-lucide-gavel'
        case 'policy': return 'i-lucide-book-open'
        case 'proclamation': return 'i-lucide-megaphone'
        case 'resolution': return 'i-lucide-vote'
        default: return 'i-lucide-file'
    }
}
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
                    <UInput v-model="searchQuery" placeholder="Search records..." icon="i-lucide-search"
                        class="flex-1" />

                    <USelect v-model="selectedType" :options="recordTypes" placeholder="Filter by type"
                        class="w-full sm:w-48" />

                    <USelect v-model="selectedStatus" :options="recordStatuses" placeholder="Filter by status"
                        class="w-full sm:w-48" />

                    <UButton icon="i-lucide-plus" label="New Record" color="primary"
                        @click="navigateTo('/records/new')" />
                </div>

                <!-- Error Display -->
                <UAlert v-if="recordsStore.recordsError" color="error" variant="soft" :title="recordsStore.recordsError"
                    icon="i-lucide-alert-circle" />

                <!-- Records List -->
                <div v-if="!recordsStore.isLoading" class="space-y-4">
                    <div v-if="recordsStore.filteredRecords.length === 0" class="text-center py-12">
                        <UIcon name="i-lucide-file-text" size="4xl" class="mx-auto mb-4 text-gray-400" />
                        <h3 class="text-lg font-medium text-gray-900 mb-2">No records found</h3>
                        <p class="text-gray-600">Try adjusting your search or filters.</p>
                    </div>

                    <div v-else class="grid gap-4">
                        <UCard v-for="record in recordsStore.filteredRecords" :key="record.id"
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
                                    <UBadge :color="getStatusColor(record.status)" variant="soft" size="sm">
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

                <!-- Loading State -->
                <div v-if="recordsStore.isLoading" class="text-center py-12">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 mx-auto animate-spin text-gray-400" />
                    <p class="mt-2 text-gray-600">Loading records...</p>
                </div>
            </div>
        </template>
    </UDashboardPanel>
</template>
