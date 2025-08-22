<script setup lang="ts">
import type { User } from '~/types/user'

// Composables
const { $civicApi } = useNuxtApp()
const authStore = useAuthStore()

// User roles composable
const {
    getRoleDisplayName,
    getRoleColor,
    fetchRoles
} = useUserRoles()

// Reactive state
const users = ref<User[]>([])
const loading = ref(true)
const error = ref('')

// Fetch users
const fetchUsers = async () => {
    try {
        loading.value = true
        error.value = ''

        const response = await $civicApi('/api/v1/users') as any

        if (response.success) {
            users.value = response.data.users || []
        } else {
            error.value = response.error || 'Failed to fetch users'
        }
    } catch (err: any) {
        error.value = err.message || 'Failed to fetch users'
        console.error('Error fetching users:', err)
    } finally {
        loading.value = false
    }
}

// Computed properties
const canManageUsers = computed(() => {
    const userRole = authStore.currentUser?.role;
    // Allow admin and clerk roles to manage users (based on updated roles.yml)
    return userRole === 'admin' || userRole === 'clerk';
})

// Format date utility
const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleDateString()
}

// Navigation
const navigateToUser = (user: User) => {
    navigateTo(`/settings/users/${user.username}`)
}

const breadcrumbItems = [
    {
        label: 'Settings',
        to: '/settings'
    },
    {
        label: 'Users',
    }
]

// On mounted
onMounted(() => {
    fetchRoles()
    fetchUsers()
})
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar>
                <template #title>
                    <h1 class="text-lg font-semibold">
                        Users
                    </h1>
                </template>
                <template #description>
                    Manage system users and their roles
                </template>
                <template #right>
                    <HeaderActions :actions="[
                        { label: 'Add User', icon: 'i-lucide-plus', to: '/settings/users/new', color: 'primary', show: canManageUsers }
                    ]" />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <UBreadcrumb :items="breadcrumbItems" />

            <!-- Loading state -->
            <div v-if="loading" class="space-y-4">
                <UserCardSkeleton v-for="i in 3" :key="i" />
            </div>

            <!-- Error state -->
            <UAlert v-else-if="error" :title="error" color="error" variant="soft" class="mb-6" />

            <!-- Users list -->
            <div v-else-if="users.length > 0" class="space-y-4">
                <UCard v-for="user in users" :key="user.id"
                    class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    @click="navigateToUser(user)">
                    <div class="p-6">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-4">
                                <div class="flex-shrink-0">
                                    <UserAvatar :user="user" size="lg" />
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                                        {{ user.name || user.username }}
                                    </h3>
                                    <p class="text-sm text-gray-600 dark:text-gray-400">
                                        {{ user.email || user.username }}
                                    </p>
                                    <div class="flex items-center gap-2 mt-2">
                                        <UBadge :color="getRoleColor(user.role) as any" variant="soft" size="sm">
                                            {{ getRoleDisplayName(user.role) }}
                                        </UBadge>
                                        <span class="text-xs text-gray-500">
                                            Created {{ formatDate(user.created_at || '') }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <UIcon name="i-lucide-chevron-right" class="w-5 h-5 text-gray-400" />
                        </div>
                    </div>
                </UCard>
            </div>

            <!-- Empty state -->
            <div v-else class="text-center py-12">
                <UIcon name="i-lucide-users" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    No users found
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    No users have been created yet.
                </p>
                <UButton v-if="canManageUsers" to="/settings/users/new" icon="i-lucide-plus" color="primary">
                    Add First User
                </UButton>
            </div>
        </template>
    </UDashboardPanel>
</template>