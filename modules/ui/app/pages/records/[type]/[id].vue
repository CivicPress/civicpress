<script setup lang="ts">
import type { CivicRecord } from '~/stores/records'

// Route parameters
const route = useRoute()
const router = useRouter()
const type = route.params.type as string
const id = route.params.id as string

// Store
const recordsStore = useRecordsStore()

// Reactive state
const record = ref<CivicRecord | null>(null)
const loading = ref(false)
const error = ref('')

// Composables
const { $api } = useNuxtApp()
const { renderMarkdown } = useMarkdown()
const { formatDate, getStatusColor, getTypeIcon } = useRecordUtils()

// Fetch record data
const fetchRecord = async () => {
    loading.value = true
    error.value = ''

    try {
        // Direct API call for now to test
        const { $civicApi } = useNuxtApp()
        const response = await $civicApi(`/api/records/${id}`)

        if (response && response.success && response.data) {
            const apiRecord = response.data

            // Transform API response to match CivicRecord interface
            record.value = {
                id: apiRecord.id,
                title: apiRecord.title,
                type: apiRecord.type,
                content: apiRecord.content || '',
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
        error.value = err.message || 'Failed to load record'
        console.error('Error fetching record:', err)
    } finally {
        loading.value = false
    }
}

// Navigate back to records list
const goBack = () => {
    // Check if we can go back in browser history
    if (window.history.length > 1) {
        // Use router.back() to preserve the previous page state (filters, pagination, etc.)
        router.back()
    } else {
        // Fall back to navigating to the records list page
        router.push('/records')
    }
}

// Fetch record on mount
onMounted(() => {
    fetchRecord()
})
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #left>
                    <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" @click="goBack">
                        Back to Records
                    </UButton>
                </template>
                <template #center>
                    <div class="flex items-center gap-2">
                        <UIcon v-if="record" :name="getTypeIcon(record.type)" class="text-gray-500" />
                        <span v-if="record" class="font-semibold">{{ record.title }}</span>
                        <span v-else class="font-semibold">Loading Record...</span>
                    </div>
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <!-- Loading State -->
            <div v-if="loading" class="flex justify-center items-center h-64">
                <div class="text-center">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
                    <p class="text-gray-600">Loading record...</p>
                </div>
            </div>

            <!-- Error State -->
            <UAlert v-else-if="error" color="error" variant="soft" :title="error" icon="i-lucide-alert-circle"
                class="mb-4">
                <template #footer>
                    <UButton color="error" variant="soft" @click="fetchRecord">
                        Try Again
                    </UButton>
                </template>
            </UAlert>

            <!-- Record Content -->
            <div v-else-if="record" class="space-y-6">
                <!-- Record Header -->
                <div class="bg-white rounded-lg border p-6">
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-2">
                                <UIcon :name="getTypeIcon(record.type)" class="text-gray-500 text-xl" />
                                <UBadge :color="getStatusColor(record.status) as any" variant="soft">
                                    {{ record.status }}
                                </UBadge>
                                <UBadge color="neutral" variant="soft">
                                    {{ record.type }}
                                </UBadge>
                            </div>
                            <h1 class="text-2xl font-bold text-gray-900 mb-2">
                                {{ record.title }}
                            </h1>
                            <p class="text-gray-600">
                                Record ID: <code class="bg-gray-100 px-2 py-1 rounded text-sm">{{ record.id }}</code>
                            </p>
                        </div>
                    </div>

                    <!-- Metadata -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div class="space-y-2">
                            <div class="flex items-center gap-2 text-sm text-gray-600">
                                <UIcon name="i-lucide-calendar" class="w-4 h-4" />
                                <span>Created: {{ formatDate(record.created_at) }}</span>
                            </div>
                            <div v-if="record.author" class="flex items-center gap-2 text-sm text-gray-600">
                                <UIcon name="i-lucide-user" class="w-4 h-4" />
                                <span>Author: {{ record.author }}</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div v-if="record.metadata?.updated" class="flex items-center gap-2 text-sm text-gray-600">
                                <UIcon name="i-lucide-edit" class="w-4 h-4" />
                                <span>Updated: {{ formatDate(record.metadata.updated) }}</span>
                            </div>
                            <div v-if="record.metadata?.updated" class="flex items-center gap-2 text-sm text-gray-600">
                                <UIcon name="i-lucide-edit" class="w-4 h-4" />
                                <span>Updated: {{ formatDate(record.metadata.updated) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Tags -->
                    <div v-if="record.metadata?.tags && record.metadata.tags.length > 0" class="pt-4 border-t mt-4">
                        <div class="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <UIcon name="i-lucide-tags" class="w-4 h-4" />
                            <span>Tags:</span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <UBadge v-for="tag in record.metadata.tags" :key="tag" color="primary" variant="soft"
                                size="sm">
                                {{ tag }}
                            </UBadge>
                        </div>
                    </div>
                </div>

                <!-- Record Content -->
                <div class="bg-white rounded-lg border">
                    <div class="border-b px-6 py-4">
                        <h2 class="text-lg font-semibold text-gray-900">Content</h2>
                    </div>
                    <div class="p-6">
                        <div v-if="record.content" class="markdown-content">
                            <!-- Render markdown content -->
                            <div class="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-800 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline"
                                v-html="renderMarkdown(record.content)" />
                        </div>
                        <div v-else class="text-gray-500 italic">
                            No content available for this record.
                        </div>
                    </div>
                </div>

                <!-- Additional Metadata -->
                <div v-if="record.metadata && Object.keys(record.metadata).length > 0"
                    class="bg-white rounded-lg border">
                    <div class="border-b px-6 py-4">
                        <h2 class="text-lg font-semibold text-gray-900">Additional Information</h2>
                    </div>
                    <div class="p-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div v-for="(value, key) in record.metadata" :key="key" class="space-y-1">
                                <dt class="text-sm font-medium text-gray-500 capitalize">{{ key }}</dt>
                                <dd class="text-sm text-gray-900">
                                    <span v-if="typeof value === 'string'">{{ value }}</span>
                                    <span v-else class="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                        {{ JSON.stringify(value) }}
                                    </span>
                                </dd>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- No Record Found -->
            <div v-else class="flex justify-center items-center h-64">
                <div class="text-center">
                    <UIcon name="i-lucide-file-x" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 class="text-lg font-medium text-gray-900 mb-2">Record Not Found</h3>
                    <p class="text-gray-600 mb-4">
                        The record you're looking for doesn't exist or has been removed.
                    </p>
                    <UButton color="primary" variant="soft" @click="goBack">
                        Back to Records
                    </UButton>
                </div>
            </div>
        </template>
    </UDashboardPanel>
</template>