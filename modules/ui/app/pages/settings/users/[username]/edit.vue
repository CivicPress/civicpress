<script setup lang="ts">
import type { User } from '~/types/user';

// Page metadata
definePageMeta({
    title: 'Edit User',
    requiresAuth: true,
    layout: 'default',
});

// Route parameters
const route = useRoute();
const username = route.params.username as string;

// Reactive state
const user = ref<User | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);

// Auth store for permissions
const authStore = useAuthStore();

// Computed properties
const pageTitle = computed(() => {
    return user.value ? `Edit ${user.value.name || user.value.username}` : 'Edit User';
});

const breadcrumbItems = computed(() => [
    { label: 'Settings', to: '/settings' },
    { label: 'Users', to: '/settings/users' },
    { label: user.value?.name || user.value?.username || 'User' },
]);

const canDelete = computed(() => {
    // Only allow deletion if user is admin or clerk and not deleting themselves
    const userRole = authStore.currentUser?.role;
    return (userRole === 'admin' || userRole === 'clerk') &&
        authStore.currentUser?.id !== user.value?.id;
});

// Fetch user data
const fetchUser = async () => {
    loading.value = true;
    error.value = null;

    try {
        const response = await useNuxtApp().$civicApi(`/api/users/${username}`) as any;

        if (response.success) {
            user.value = response.data.user;
        } else {
            error.value = response.message || 'Failed to fetch user';
        }
    } catch (err: any) {
        console.error('Error fetching user:', err);
        error.value = err.message || 'Failed to fetch user';
    } finally {
        loading.value = false;
    }
};

// Handle form submission
const handleSubmit = async (userData: any) => {
    saving.value = true;
    formError.value = null;

    try {
        const response = await useNuxtApp().$civicApi(`/api/users/${username}`, {
            method: 'PUT',
            body: userData,
        }) as any;

        if (response.success) {
            // Update local user data
            user.value = response.data.user;

            // Show success message
            useToast().add({
                title: 'Success',
                description: 'User updated successfully',
                color: 'primary',
            });
        } else {
            formError.value = response.message || 'Failed to update user';
        }
    } catch (err: any) {
        console.error('Error updating user:', err);
        formError.value = err.message || 'Failed to update user';
    } finally {
        saving.value = false;
    }
};

// Handle user deletion
const handleDelete = async () => {
    saving.value = true;

    try {
        const response = await useNuxtApp().$civicApi(`/api/users/${username}`, {
            method: 'DELETE',
        }) as any;

        if (response.success) {
            // Show success message
            useToast().add({
                title: 'Success',
                description: 'User deleted successfully',
                color: 'primary',
            });

            // Navigate back to users list
            await navigateTo('/settings/users');
        } else {
            formError.value = response.message || 'Failed to delete user';
        }
    } catch (err: any) {
        console.error('Error deleting user:', err);
        formError.value = err.message || 'Failed to delete user';
    } finally {
        saving.value = false;
    }
};

// Fetch user data on mount
onMounted(() => {
    fetchUser();
});
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar :title="pageTitle">
                <template #right>
                    <UButton to="/settings/users" color="neutral" variant="outline" icon="i-lucide-arrow-left">
                        Back to Users
                    </UButton>
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div class="space-y-6">
                <UBreadcrumb :items="breadcrumbItems" />

                <!-- Loading State -->
                <div v-if="loading" class="space-y-4">
                    <UCard>
                        <div class="flex items-center space-x-3">
                            <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-primary-600" />
                            <div>
                                <h2 class="text-xl font-semibold">Loading User</h2>
                                <p class="text-sm text-gray-600 dark:text-gray-400">
                                    Fetching user information...
                                </p>
                            </div>
                        </div>
                    </UCard>
                </div>

                <!-- Error State -->
                <UAlert v-else-if="error" color="error" variant="soft" :title="error" icon="i-lucide-alert-circle" />

                <!-- User Form -->
                <UCard v-else>
                    <template #header>
                        <div class="flex items-center space-x-3">
                            <UIcon name="i-lucide-user" class="w-6 h-6 text-primary-600" />
                            <div>
                                <h2 class="text-xl font-semibold">Edit User</h2>
                                <p class="text-sm text-gray-600 dark:text-gray-400">
                                    Update user information and permissions
                                </p>
                            </div>
                        </div>
                    </template>

                    <UserForm :user="user || undefined" :is-editing="true" :error="formError || undefined"
                        :saving="saving" :can-delete="canDelete" @submit="handleSubmit" @delete="handleDelete" />
                </UCard>
            </div>
        </template>
    </UDashboardPanel>
</template>