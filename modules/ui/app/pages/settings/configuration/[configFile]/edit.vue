<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #title>
                    <h1 class="text-lg font-semibold">
                        {{ configTitle }}
                    </h1>
                </template>
                <template #description>
                    {{ configDescription }}
                </template>
                <template #right>
                    <UButton @click="saveConfiguration" :loading="saving" :disabled="!hasChanges">
                        Save Changes
                    </UButton>
                    <UButton @click="resetToOriginal" variant="outline" :disabled="!hasChanges">
                        Reset
                    </UButton>
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <UBreadcrumb :items="breadcrumbItems" />

            <div class="grid gap-6 mt-8">
                <!-- Dynamic Configuration Form -->
                <UDashboardPanel>
                    <template #header>
                        <UDashboardNavbar>
                            <template #title>
                                <div class="flex items-center gap-3">
                                    <UIcon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-primary-500" />
                                    <div>
                                        <h3 class="text-lg font-semibold">Configuration Fields</h3>
                                        <p class="text-sm text-gray-600 dark:text-gray-400">
                                            Edit configuration values below
                                        </p>
                                    </div>
                                </div>
                            </template>
                        </UDashboardNavbar>
                    </template>

                    <template #body>
                        <div v-if="loading" class="flex items-center justify-center py-12">
                            <div class="text-center">
                                <UIcon name="i-heroicons-arrow-path"
                                    class="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
                                <p class="text-gray-600 dark:text-gray-400">Loading configuration...</p>
                            </div>
                        </div>

                        <div v-else-if="error" class="text-center py-12">
                            <UIcon name="i-heroicons-exclamation-triangle"
                                class="w-12 h-12 text-red-500 mx-auto mb-4" />
                            <h3 class="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">Configuration Error
                            </h3>
                            <p class="text-gray-600 dark:text-gray-400 mb-4">{{ error }}</p>
                            <UButton @click="loadConfiguration" variant="outline">Retry</UButton>
                        </div>

                        <div v-else-if="configMetadata" class="space-y-8">
                            <!-- Render form fields based on metadata -->
                            <div v-for="(field, key) in configMetadata" :key="String(key)"
                                v-show="String(key) !== '_metadata'">
                                <!-- Handle nested objects (like roles) -->
                                <div v-if="isNestedObject(field)" class="space-y-6">
                                    <UDashboardPanel>
                                        <template #header>
                                            <UDashboardNavbar>
                                                <template #title>
                                                    <div class="flex items-center gap-3">
                                                        <UIcon name="i-heroicons-squares-2x2"
                                                            class="w-6 h-6 text-primary-500" />
                                                        <div>
                                                            <h4 class="text-lg font-semibold">{{
                                                                formatFieldLabel(String(key)) }}</h4>
                                                            <p class="text-sm text-gray-600 dark:text-gray-400">
                                                                {{ field.description || `Manage
                                                                ${formatFieldLabel(String(key)).toLowerCase()}` }}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </template>
                                            </UDashboardNavbar>
                                        </template>

                                        <template #body>
                                            <div class="space-y-6">
                                                <div v-for="(nestedField, nestedKey) in field" :key="String(nestedKey)"
                                                    class="border-l-4 border-primary-200 pl-4">
                                                    <h5 class="font-medium text-gray-900 dark:text-white mb-3">
                                                        {{ formatFieldLabel(String(nestedKey)) }}
                                                    </h5>
                                                    <div class="space-y-4">
                                                        <div v-for="(subField, subKey) in nestedField"
                                                            :key="String(subKey)"
                                                            v-show="String(subKey) !== '_metadata'">
                                                            <ConfigurationField
                                                                :field-key="`${String(key)}.${String(nestedKey)}.${String(subKey)}`"
                                                                :field="subField"
                                                                :value="getNestedFieldValue(String(key), String(nestedKey), String(subKey))"
                                                                @update="updateNestedFieldValue" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </template>
                                    </UDashboardPanel>
                                </div>

                                <!-- Handle flat fields -->
                                <div v-else>
                                    <ConfigurationField :field-key="String(key)" :field="field"
                                        :value="getFieldValue(String(key))" @update="updateFieldValue" />
                                </div>
                            </div>
                        </div>

                        <div v-else class="text-center py-12">
                            <p class="text-gray-600 dark:text-gray-400">No configuration metadata available</p>
                        </div>
                    </template>
                </UDashboardPanel>
            </div>
        </template>
    </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({
    requiresAuth: true,
    layout: 'default'
})

const authStore = useAuthStore()
const route = useRoute()

// Get configuration file from route
const configFile = computed(() => route.params.configFile as string)

// Check if user can manage configuration
const canManageConfiguration = computed(() => {
    return authStore.currentUser?.role === 'admin'
})

// Configuration state
const loading = ref(true)
const error = ref<string | null>(null)
const configMetadata = ref<any>(null)
const originalConfig = ref<any>(null)
const config = ref<any>({})

// Computed properties
const configTitle = computed(() => configMetadata.value?._metadata?.name || 'Configuration')
const configDescription = computed(() => configMetadata.value?._metadata?.description || 'Manage system configuration')

// Breadcrumb navigation
const breadcrumbItems = computed(() => [
    {
        label: 'Settings',
        to: '/settings'
    },
    {
        label: 'Configuration',
        to: '/settings/configuration'
    },
    {
        label: configTitle.value,
    }
])

// Form state
const saving = ref(false)
const hasChanges = ref(false)

// Load configuration
const loadConfiguration = async () => {
    loading.value = true
    error.value = null

    try {
        // Load configuration metadata first
        const metadataResponse = await useNuxtApp().$civicApi(`/api/v1/config/metadata/${configFile.value}`) as any
        if (metadataResponse.success && metadataResponse.data) {
            configMetadata.value = metadataResponse.data
        } else {
            throw new Error('Failed to load configuration metadata')
        }

        // Load configuration data
        const response = await useNuxtApp().$civicApi(`/api/v1/config/${configFile.value}`) as any
        if (response.success && response.data) {
            originalConfig.value = JSON.parse(JSON.stringify(response.data))
            config.value = JSON.parse(JSON.stringify(response.data))
        } else {
            throw new Error(response.message || `Failed to load ${configFile.value} configuration`)
        }
    } catch (err: any) {
        console.error(`Failed to load ${configFile.value} configuration:`, err)
        error.value = err.message || 'Failed to load configuration'
    } finally {
        loading.value = false
    }
}

// Helper functions
const isNestedObject = (field: any) => {
    return typeof field === 'object' &&
        field !== null &&
        !Array.isArray(field) &&
        field.value === undefined &&
        Object.keys(field).some(key => key !== '_metadata' && typeof field[key] === 'object')
}

const formatFieldLabel = (key: string) => {
    return key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

// Get field value from config
const getFieldValue = (key: string) => {
    const field = configMetadata.value[key]
    if (!field) return null

    // Handle nested objects
    if (typeof field === 'object' && field.value !== undefined) {
        return field.value
    }

    // Handle direct values
    return config.value[key]
}

// Get nested field value
const getNestedFieldValue = (sectionKey: string, nestedKey: string, subKey: string) => {
    const field = configMetadata.value[sectionKey]?.[nestedKey]?.[subKey]
    if (!field) return null

    if (typeof field === 'object' && field.value !== undefined) {
        return field.value
    }

    return config.value[sectionKey]?.[nestedKey]?.[subKey]
}

// Update field value
const updateFieldValue = (key: string, value: any) => {
    const field = configMetadata.value[key]
    if (!field) return

    // Handle nested objects
    if (typeof field === 'object' && field.value !== undefined) {
        if (!config.value[key]) {
            config.value[key] = {}
        }
        config.value[key].value = value
    } else {
        // Handle direct values
        config.value[key] = value
    }

    hasChanges.value = true
}

// Update nested field value
const updateNestedFieldValue = (fullKey: string, value: any) => {
    const parts = fullKey.split('.')
    if (parts.length !== 3) return

    const [sectionKey, nestedKey, subKey] = parts
    if (!sectionKey || !nestedKey || !subKey) return

    const field = configMetadata.value[sectionKey]?.[nestedKey]?.[subKey]
    if (!field) return

    // Ensure nested structure exists
    if (!config.value[sectionKey]) {
        config.value[sectionKey] = {}
    }
    if (!config.value[sectionKey][nestedKey]) {
        config.value[sectionKey][nestedKey] = {}
    }

    // Handle nested objects with value property
    if (typeof field === 'object' && field.value !== undefined) {
        config.value[sectionKey][nestedKey][subKey] = { ...field, value }
    } else {
        config.value[sectionKey][nestedKey][subKey] = value
    }

    hasChanges.value = true
}

// Save configuration
const saveConfiguration = async () => {
    if (!canManageConfiguration.value) return

    saving.value = true
    try {
        const response = await useNuxtApp().$civicApi(`/api/v1/config/${configFile.value}`, {
            method: 'PUT',
            body: config.value
        }) as any

        if (response.success) {
            // Mark as saved
            hasChanges.value = false
            originalConfig.value = JSON.parse(JSON.stringify(config.value))

            useToast().add({
                title: 'Success',
                description: `${configTitle.value} configuration saved successfully`,
                color: 'primary'
            })
        } else {
            throw new Error(response.message || 'Failed to save configuration')
        }
    } catch (err: any) {
        console.error('Failed to save configuration:', err)
        useToast().add({
            title: 'Error',
            description: `Failed to save ${configTitle.value} configuration: ${err.message}`,
            color: 'error'
        })
    } finally {
        saving.value = false
    }
}

// Reset to original configuration
const resetToOriginal = () => {
    if (originalConfig.value) {
        config.value = JSON.parse(JSON.stringify(originalConfig.value))
        hasChanges.value = false
    }
}

// Load configuration on mount
onMounted(async () => {
    if (!canManageConfiguration.value) {
        navigateTo('/settings')
        return
    }

    await loadConfiguration()
})

// Redirect if user cannot manage configuration
watch(canManageConfiguration, (canManage) => {
    if (!canManage) {
        navigateTo('/settings')
    }
})
</script>
