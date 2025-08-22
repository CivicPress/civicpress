<script setup lang="ts">
import type { CivicRecord } from '~/stores/records'

// Route parameters
const route = useRoute()
const type = route.params.type as string
const id = route.params.id as string

// Store
const recordsStore = useRecordsStore()

// Reactive state
const record = ref<CivicRecord | null>(null)
const loading = ref(false)
const error = ref('')

// Toast notifications
const toast = useToast()

// Get record type display name
const { getRecordTypeLabel } = useRecordTypes()
const recordTypeLabel = computed(() => getRecordTypeLabel(type))

// Copy to clipboard function
const copyToClipboard = async () => {
    if (record.value?.content) {
        try {
            await navigator.clipboard.writeText(record.value.content)
            toast.add({
                title: 'Copied!',
                description: 'Raw content copied to clipboard',
                color: 'primary'
            })
        } catch (error) {
            console.error('Copy failed:', error)
            toast.add({
                title: 'Copy Failed',
                description: 'Please select the content and copy manually (Ctrl+C / Cmd+C)',
                color: 'error'
            })
        }
    }
}

// Navigation menu items for copy button
const navigationItems = computed(() => [
    [
        {
            label: 'Copy',
            icon: 'i-lucide-copy',
            click: copyToClipboard
        }
    ]
])

// Fetch record data
const fetchRecord = async () => {
    loading.value = true
    error.value = ''

    try {
        const response = await useNuxtApp().$civicApi(`/api/v1/records/${id}/raw`) as any

        if (response && response.success && response.data) {
            const apiRecord = response.data

            // Transform API response to match CivicRecord interface
            record.value = {
                id: apiRecord.id,
                title: apiRecord.title,
                type: apiRecord.type,
                content: apiRecord.content || '', // This now contains the complete file including frontmatter
                status: apiRecord.status,
                path: apiRecord.path,
                author: apiRecord.author,
                created_at: apiRecord.created || apiRecord.created_at,
                updated_at: apiRecord.updated || apiRecord.updated_at,
                metadata: apiRecord.metadata || {},
            }
        } else {
            throw new Error('Failed to fetch record')
        }
    } catch (err: any) {
        const errorMessage = err.message || 'Failed to load record'
        error.value = errorMessage
        toast.add({
            title: 'Error',
            description: errorMessage,
            color: 'error'
        })
    } finally {
        loading.value = false
    }
}

// Check if user can view records (allow guests to view raw records)
const authStore = useAuthStore()
const canViewRecords = computed(() => {
    const userRole = authStore.currentUser?.role
    // Allow all users including guests to view raw records
    return true
})

// Fetch record on mount
onMounted(() => {
    fetchRecord()
})

const breadcrumbItems = computed(() => [
    {
        label: 'Records',
        to: '/records'
    },
    {
        label: recordTypeLabel.value,
        to: `/records/${type}`
    },
    {
        label: record.value?.title || 'Record',
        to: `/records/${type}/${id}`
    },
    {
        label: 'Raw Content'
    }
])
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #title>
                    <h1 class="text-lg font-semibold">
                        Raw Content: {{ record?.title || 'Record' }}
                    </h1>
                </template>
                <template #description>
                    View the raw markdown content of this record
                </template>
                <template #right>
                    <HeaderActions :actions="[
                        { label: 'Back to Record', icon: 'i-lucide-arrow-left', to: `/records/${type}/${id}`, color: 'neutral', variant: 'outline', disabled: loading || !record }
                    ]" />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="space-y-6">
                <UBreadcrumb :items="breadcrumbItems" />

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-12">
                    <div class="flex justify-center items-center h-64">
                        <div class="text-center">
                            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
                            <p class="text-gray-600">Loading record...</p>
                        </div>
                    </div>
                </div>

                <!-- Access Control -->
                <UAlert v-else-if="!canViewRecords" color="error" variant="soft" title="Access Denied"
                    description="You don't have permission to view records." icon="i-lucide-alert-circle" />

                <!-- Error State -->
                <div v-else-if="error" class="text-center py-12">
                    <UAlert color="error" variant="soft" :title="error" icon="i-lucide-alert-circle" />
                </div>

                <!-- No Record State -->
                <div v-else-if="!record" class="text-center py-12">
                    <UAlert color="neutral" variant="soft" title="No Record Found"
                        description="The record could not be loaded." icon="i-lucide-alert-circle" />
                </div>

                <!-- Raw Content Display -->
                <div v-else class="space-y-6">
                    <!-- Record Info -->
                    <div class="rounded-lg border p-6">
                        <div class="flex items-start justify-between mb-4">
                            <div class="flex-1">
                                <h2 class="text-xl font-semibold mb-2">
                                    {{ record.title }}
                                </h2>
                                <div class="flex items-center gap-3 mb-2">
                                    <UBadge color="neutral" variant="soft">
                                        {{ record.type }}
                                    </UBadge>
                                    <UBadge color="primary" variant="soft">
                                        {{ record.status }}
                                    </UBadge>
                                </div>
                                <p class="text-gray-600 dark:text-gray-400">
                                    Record ID: <code
                                        class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">{{ record.id }}</code>
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Raw Markdown Content -->
                    <div class="rounded-lg border">
                        <div class="border-b px-6 py-4">
                            <h2 class="text-lg font-semibold">Raw Markdown Content</h2>
                            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                This is the complete markdown file including frontmatter and content
                            </p>
                        </div>
                        <div class="p-6">
                            <div v-if="record.content" class="relative">
                                <!-- Navigation Menu with Copy Button -->
                                <UNavigationMenu highlight highlight-color="primary" orientation="horizontal"
                                    :items="navigationItems" class="absolute top-2 right-2 z-10 w-auto" />

                                <!-- Code block with syntax highlighting -->
                                <div class="">
                                    <pre
                                        class="text-sm overflow-x-auto p-4 rounded-lg bg-gray-900 text-gray-100 font-mono whitespace-pre-wrap break-words"><code>{{ record.content }}</code></pre>
                                </div>
                            </div>
                            <div v-else class="text-gray-500 dark:text-gray-400 italic">
                                No content available for this record.
                            </div>
                        </div>
                    </div>

                    <!-- File Information -->
                    <div class="rounded-lg border">
                        <div class="border-b px-6 py-4">
                            <h2 class="text-lg font-semibold">File Information</h2>
                        </div>
                        <div class="p-6">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="space-y-2">
                                    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <UIcon name="i-lucide-file-text" class="w-4 h-4" />
                                        <span>File Path: <code
                                                class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs">{{ record.path }}</code></span>
                                    </div>
                                    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <UIcon name="i-lucide-calendar" class="w-4 h-4" />
                                        <span>Created: {{ new Date(record.created_at).toLocaleString() }}</span>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <div v-if="record.author"
                                        class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <UIcon name="i-lucide-user" class="w-4 h-4" />
                                        <span>Author: {{ record.author }}</span>
                                    </div>
                                    <div v-if="record.updated_at"
                                        class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <UIcon name="i-lucide-edit" class="w-4 h-4" />
                                        <span>Updated: {{ new Date(record.updated_at).toLocaleString() }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </UDashboardPanel>
</template>