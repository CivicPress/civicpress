<script setup lang="ts">

import { useRecordTypes } from '~/composables/useRecordTypes'
import { useRecordStatuses } from '~/composables/useRecordStatuses'

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

// Reactive data
const searchQuery = ref('')
const selectedRecordTypes = ref([])
const selectedRecordStatuses = ref([])

// Record statuses are now loaded dynamically from the composable

// On mounted - fetch all records
onMounted(async () => {
    await recordsStore.fetchRecords()
})

// Watch for filter changes - use list endpoint
watch([selectedRecordTypes, selectedRecordStatuses], async () => {
    await recordsStore.fetchRecords({
        type: selectedRecordTypes.value.join(','),
        status: selectedRecordStatuses.value.join(','),
    })
})

// For search - use search endpoint
watch(searchQuery, async () => {
    if (searchQuery.value) {
        await recordsStore.searchRecords(searchQuery.value)
    } else {
        await recordsStore.fetchRecords()
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
        case 'pending_review': return 'primary'
        case 'under_review': return 'primary'
        case 'approved': return 'primary'
        case 'published': return 'primary'
        case 'rejected': return 'error'
        case 'archived': return 'neutral'
        case 'expired': return 'neutral'
        default: return 'neutral'
    }
}

const recordTypeOptionsComputed = computed(() => {
    return recordTypeOptions().map((option: any) => {
        return {
            label: option.label,
            icon: option.icon,
            id: option.key
        }
    })
})


const recordStatusOptionsComputed = computed(() => {
    return recordStatusOptions().map((option: any) => {
        return {
            label: option.label,
            icon: option.icon,
            id: option.key
        }
    })
})


// Get type icon - now uses the composable
const getTypeIcon = (type: string) => {
    return getRecordTypeIcon(type)
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
                    <USelectMenu v-model="selectedRecordTypes" :items="recordTypeOptionsComputed" multiple
                        :loading="recordTypesLoading" placeholder="Select Record Types" class="w-full sm:w-48" />
                    <USelectMenu v-model="selectedRecordStatuses" :items="recordStatusOptionsComputed" multiple
                        :loading="recordStatusesLoading" placeholder="Select Record Statuses" class="w-full sm:w-48" />

                    <UButton icon="i-lucide-plus" label="New Record" color="primary"
                        @click="navigateTo('/records/new')" />
                </div>


                <!-- Error Display -->
                <UAlert v-if="recordsStore.recordsError" color="error" variant="soft" :title="recordsStore.recordsError"
                    icon="i-lucide-alert-circle" />
                <UAlert v-if="recordStatusesError" color="error" variant="soft" :title="recordStatusesError"
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


            <hr class="my-8 border-gray-200" />
            <hr class="my-8 border-gray-200" />
            <!-- Record Types Overview -->
            <div v-if="!recordTypesLoading && recordTypes.length > 0" class="space-y-4">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-gray-900">Record Types</h3>
                    <UButton variant="ghost" size="sm" @click="navigateTo('/records/new')" icon="i-lucide-plus">
                        Create Record
                    </UButton>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <UCard v-for="recordType in recordTypes" :key="recordType.key"
                        class="hover:shadow-md transition-shadow cursor-pointer"
                        @click="navigateTo(`/records/new?type=${recordType.key}`)">
                        <div class="flex items-start space-x-3">
                            <div class="flex-shrink-0">
                                <div class="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                                    <UIcon :name="getRecordTypeIcon(recordType.key)" class="w-5 h-5 text-primary-600" />
                                </div>
                            </div>

                            <div class="flex-1 min-w-0">
                                <h4 class="text-sm font-medium text-gray-900 mb-1">
                                    {{ recordType.label }}
                                </h4>
                                <p class="text-xs text-gray-600 line-clamp-2">
                                    {{ recordType.description }}
                                </p>
                            </div>
                        </div>

                        <template #footer>
                            <div class="flex items-center justify-between text-xs text-gray-500">
                                <span class="flex items-center space-x-1">
                                    <UIcon name="i-lucide-tag" class="w-3 h-3" />
                                    <span>{{ recordType.source }}</span>
                                </span>
                                <span class="flex items-center space-x-1">
                                    <UIcon name="i-lucide-hash" class="w-3 h-3" />
                                    <span>Priority {{ recordType.priority }}</span>
                                </span>
                            </div>
                        </template>
                    </UCard>
                </div>
            </div>

            <hr class="my-8 border-gray-200" />


            <!-- Record Statuses Overview -->
            <div v-if="!recordStatusesLoading && recordStatuses.length > 0" class="space-y-4">
                <h3 class="text-lg font-semibold text-gray-900">Record Statuses</h3>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div v-for="status in recordStatuses" :key="status.key"
                        class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <div class="flex-shrink-0">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center" :class="{
                                'bg-neutral-100': getStatusColor(status.key) === 'neutral',
                                'bg-primary-100': getStatusColor(status.key) === 'primary',
                                'bg-error-100': getStatusColor(status.key) === 'error'
                            }">
                                <UIcon name="i-lucide-circle" class="w-4 h-4" :class="{
                                    'text-neutral-600': getStatusColor(status.key) === 'neutral',
                                    'text-primary-600': getStatusColor(status.key) === 'primary',
                                    'text-error-600': getStatusColor(status.key) === 'error'
                                }" />
                            </div>
                        </div>

                        <div class="flex-1 min-w-0">
                            <h4 class="text-sm font-medium text-gray-900">
                                {{ status.label }}
                            </h4>
                            <p class="text-xs text-gray-600 line-clamp-1">
                                {{ status.description }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

        </template>
    </UDashboardPanel>
</template>
