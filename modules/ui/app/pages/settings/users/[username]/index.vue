<script setup lang="ts">
import type { User } from '~/types/user';

// Page metadata
definePageMeta({
  title: 'View User',
  requiresAuth: true,
  layout: 'default',
});

// Route parameters
const route = useRoute();
const username = route.params.username as string;

// Reactive state
const user = ref<User | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Auth store for permissions
const authStore = useAuthStore();

// Computed properties
const pageTitle = computed(() => {
  return user.value
    ? `View ${user.value.name || user.value.username}`
    : 'View User';
});

const breadcrumbItems = computed(() => [
  { label: 'Settings', to: '/settings' },
  { label: 'Users', to: '/settings/users' },
  { label: user.value?.name || user.value?.username || 'User' },
]);

// Permissions
const isSelf = computed(() => authStore.currentUser?.username === username);
const canEditUsers = computed(() => authStore.hasPermission('users:manage'));
const canViewPage = computed(() => isSelf.value || canEditUsers.value);

// Fetch user data
const fetchUser = async () => {
  loading.value = true;
  error.value = null;

  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/users/${username}`
    )) as any;

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

// Fetch user data on mount with guard
onMounted(() => {
  if (!canViewPage.value) {
    navigateTo('/settings');
    return;
  }
  fetchUser();
});
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="pageTitle">
        <template #right>
          <HeaderActions
            :actions="[
              {
                label: 'Back to Users',
                icon: 'i-lucide-arrow-left',
                to: '/settings/users',
                color: 'neutral',
                variant: 'outline',
              },
              {
                label: 'Edit User',
                icon: 'i-lucide-edit',
                to: `/settings/users/${username}/edit`,
                color: 'primary',
                show: canEditUsers,
              },
            ]"
          />
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
              <UIcon
                name="i-lucide-loader-2"
                class="w-6 h-6 animate-spin text-primary-600"
              />
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
        <UAlert
          v-else-if="error"
          color="error"
          variant="soft"
          :title="error"
          icon="i-lucide-alert-circle"
        />

        <!-- User Details -->
        <UCard v-else>
          <template #header>
            <div class="flex items-center space-x-3">
              <UIcon name="i-lucide-user" class="w-6 h-6 text-primary-600" />
              <div>
                <h2 class="text-xl font-semibold">User Details</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  View user information and details
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <!-- User Avatar and Basic Info -->
            <div class="flex items-center space-x-4">
              <UserAvatar v-if="user" :user="user" size="lg" />
              <div>
                <h3 class="text-lg font-semibold">
                  {{ user?.name || user?.username }}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  @{{ user?.username }}
                </p>
                <UBadge
                  :color="
                    user?.role === 'admin'
                      ? 'error'
                      : user?.role === 'clerk'
                        ? 'primary'
                        : 'neutral'
                  "
                  variant="soft"
                >
                  {{ user?.role }}
                </UBadge>
              </div>
            </div>

            <!-- User Details Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-4">
                <div>
                  <label
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >Email</label
                  >
                  <p class="text-sm text-gray-900 dark:text-gray-100">
                    {{ user?.email || 'No email provided' }}
                  </p>
                </div>
                <div>
                  <label
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >Full Name</label
                  >
                  <p class="text-sm text-gray-900 dark:text-gray-100">
                    {{ user?.name || 'No name provided' }}
                  </p>
                </div>
              </div>
              <div class="space-y-4">
                <div>
                  <label
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >Created</label
                  >
                  <p class="text-sm text-gray-900 dark:text-gray-100">
                    {{
                      user?.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : 'Unknown'
                    }}
                  </p>
                </div>
                <div>
                  <label
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >Last Updated</label
                  >
                  <p class="text-sm text-gray-900 dark:text-gray-100">
                    {{
                      user?.updated_at
                        ? new Date(user.updated_at).toLocaleDateString()
                        : 'Unknown'
                    }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
