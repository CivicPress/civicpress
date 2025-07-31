<script setup lang="ts">
import type { User } from '~/types/user'

// Composables
const { $civicApi } = useNuxtApp()
const toast = useToast()
const router = useRouter()

// Auth store for permissions
const authStore = useAuthStore()

// Reactive state
const loading = ref(false)
const saving = ref(false)
const error = ref('')

// Create user
const createUser = async (formData: any) => {
    try {
        saving.value = true
        error.value = ''

        const response = await $civicApi('/api/users', {
            method: 'POST',
            body: formData
        }) as any

        if (response.success) {
            toast.add({
                title: 'Success',
                description: 'User created successfully',
                color: 'primary',
                icon: 'i-lucide-check-circle'
            })
            // Navigate to the new user's edit page
            navigateTo(`/settings/users/${response.data.user.id}`)
        } else {
            const errorMsg = response.error || 'Failed to create user'
            error.value = errorMsg
            toast.add({
                title: 'Error',
                description: errorMsg,
                color: 'error',
                icon: 'i-lucide-alert-circle'
            })
        }
    } catch (err: any) {
        const errorMsg = err.message || 'Failed to create user'
        error.value = errorMsg
        toast.add({
            title: 'Error',
            description: errorMsg,
            color: 'error',
            icon: 'i-lucide-alert-circle'
        })
        console.error('Error creating user:', err)
    } finally {
        saving.value = false
    }
}

// Computed properties
const canManageUsers = computed(() => {
    return authStore.currentUser?.role === 'admin'
})

const breadcrumbItems = [
    {
        label: 'Settings',
        to: '/settings'
    },
    {
        label: 'Users',
        to: '/settings/users'
    },
    {
        label: 'Create User',
    }
]
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #title>
                    <h1 class="text-lg font-semibold">
                        Create User
                    </h1>
                </template>
                <template #description>
                    Add a new user to the system
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <UBreadcrumb :items="breadcrumbItems" />

            <!-- Access denied -->
            <div v-if="!canManageUsers" class="text-center py-12">
                <UIcon name="i-lucide-lock" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Access Denied
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    Only administrators can create new users.
                </p>
                <UButton to="/settings/users" color="primary">
                    Back to Users
                </UButton>
            </div>

            <!-- Create user form -->
            <div v-else class="w-full">
                <UserForm :is-editing="false" :error="error" :saving="saving" @submit="createUser" />
            </div>
        </template>
    </UDashboardPanel>
</template>