<script setup lang="ts">
import type { User } from '~/types/user'

// Composables
const { $civicApi } = useNuxtApp()
const toast = useToast()
const route = useRoute()

// Auth store for permissions
const authStore = useAuthStore()

// Reactive state
const user = ref<User | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')

// Fetch user data
const fetchUser = async () => {
    try {
        loading.value = true
        error.value = ''

        const userId = route.params.id as string
        const response = await $civicApi(`/api/users/${userId}`) as any

        if (response.success) {
            user.value = response.data.user
        } else {
            const errorMsg = response.error || 'Failed to fetch user'
            error.value = errorMsg
            toast.add({
                title: 'Error',
                description: errorMsg,
                color: 'error',
                icon: 'i-lucide-alert-circle'
            })
        }
    } catch (err: any) {
        const errorMsg = err.message || 'Failed to fetch user'
        error.value = errorMsg
        toast.add({
            title: 'Error',
            description: errorMsg,
            color: 'error',
            icon: 'i-lucide-alert-circle'
        })
        console.error('Error fetching user:', err)
    } finally {
        loading.value = false
    }
}

// Save user
const saveUser = async (formData: any) => {
    try {
        saving.value = true
        error.value = ''

        const userId = route.params.id as string

        const response = await $civicApi(`/api/users/${userId}`, {
            method: 'PUT',
            body: formData
        }) as any

        if (response.success) {
            user.value = response.data.user

            toast.add({
                title: 'Success',
                description: 'User updated successfully',
                color: 'primary',
                icon: 'i-lucide-check-circle'
            })
        } else {
            const errorMsg = response.error || 'Failed to update user'
            error.value = errorMsg
            toast.add({
                title: 'Error',
                description: errorMsg,
                color: 'error',
                icon: 'i-lucide-alert-circle'
            })
        }
    } catch (err: any) {
        const errorMsg = err.message || 'Failed to update user'
        error.value = errorMsg
        toast.add({
            title: 'Error',
            description: errorMsg,
            color: 'error',
            icon: 'i-lucide-alert-circle'
        })
        console.error('Error updating user:', err)
    } finally {
        saving.value = false
    }
}

// Delete user
const deleteUser = async () => {

    try {
        saving.value = true
        const userId = route.params.id as string

        const response = await $civicApi(`/api/users/${userId}`, {
            method: 'DELETE'
        }) as any

        if (response.success) {
            toast.add({
                title: 'Success',
                description: 'User deleted successfully',
                color: 'primary',
                icon: 'i-lucide-check-circle'
            })
            // Navigate back to users list
            navigateTo('/settings/users')
        } else {
            const errorMsg = response.error || 'Failed to delete user'
            toast.add({
                title: 'Error',
                description: errorMsg,
                color: 'error',
                icon: 'i-lucide-alert-circle'
            })
        }
    } catch (err: any) {
        const errorMsg = err.message || 'Failed to delete user'
        toast.add({
            title: 'Error',
            description: errorMsg,
            color: 'error',
            icon: 'i-lucide-alert-circle'
        })
        console.error('Error deleting user:', err)
    } finally {
        saving.value = false
    }
}

// Computed properties
const canManageUsers = computed(() => {
    return authStore.currentUser?.role === 'admin'
})

const canDeleteUser = computed(() => {
    if (!user.value || !authStore.currentUser) return false
    // Admin can delete any user except themselves
    return authStore.currentUser.role === 'admin' && user.value.id !== authStore.currentUser.id
})

const breadcrumbItems = computed(() => [
    {
        label: 'Settings',
        to: '/settings'
    },
    {
        label: 'Users',
        to: '/settings/users'
    },
    {
        label: user.value?.name || user.value?.username || 'User'
    }
])

// On mounted
onMounted(async () => {
    await fetchUser()
})
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #title>
                    <h1 class="text-lg font-semibold">
                        {{ user ? (user.name || user.username) : 'User' }}
                    </h1>
                </template>
                <template #description>
                    Manage user settings and role
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <UBreadcrumb :items="breadcrumbItems" />

            <!-- Loading state -->
            <div v-if="loading" class="flex justify-center py-12">
                <!-- <ULoadingBlock /> -->
            </div>

            <!-- Error state -->
            <div v-else-if="error && !user" class="text-center py-12">
                <UIcon name="i-lucide-alert-circle" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Error Loading User
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    {{ error }}
                </p>
                <UButton to="/settings/users" color="primary">
                    Back to Users
                </UButton>
            </div>

            <!-- User form -->
            <div v-else-if="user && canManageUsers" class="w-full">
                <UserForm :user="user" :is-editing="true" :error="error" :saving="saving" :can-delete="canDeleteUser"
                    @submit="saveUser" @delete="deleteUser" />
            </div>

            <!-- Access denied -->
            <div v-else class="text-center py-12">
                <UIcon name="i-lucide-lock" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Access Denied
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    You don't have permission to manage users.
                </p>
                <UButton to="/settings/users" color="primary">
                    Back to Users
                </UButton>
            </div>
        </template>
    </UDashboardPanel>
</template>