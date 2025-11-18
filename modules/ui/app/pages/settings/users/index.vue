<script setup lang="ts">
import type { User } from '~/types/user';
import SystemFooter from '~/components/SystemFooter.vue';

// Composables
const { $civicApi } = useNuxtApp();
const authStore = useAuthStore();
const { t } = useI18n();
const ready = computed(() => authStore.isInitialized);

// User roles composable
const { getRoleDisplayName, getRoleColor, fetchRoles } = useUserRoles();

// Reactive state
const users = ref<User[]>([]);
const loading = ref(true);
const error = ref('');

// Fetch users
const fetchUsers = async () => {
  try {
    loading.value = true;
    error.value = '';

    const response = (await $civicApi('/api/v1/users')) as any;

    if (response.success) {
      users.value = response.data.users || [];
    } else {
      error.value = response.error || t('settings.users.failedToFetchUsers');
    }
  } catch (err: any) {
    error.value = err.message || t('settings.users.failedToFetchUsers');
    console.error('Error fetching users:', err);
  } finally {
    loading.value = false;
  }
};

// Computed properties
const canManageUsers = computed(() => {
  return authStore.hasPermission('users:manage');
});

// Format date utility
const formatDate = (dateString: string) => {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString();
};

// Navigation
const navigateToUser = (user: User) => {
  navigateTo(`/settings/users/${user.username}`);
};

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('common.settings'),
    to: '/settings',
  },
  {
    label: t('settings.users.title'),
  },
]);

definePageMeta({
  middleware: ['require-users-manage'],
});

// On mounted
onMounted(() => {
  fetchRoles();
  fetchUsers();
});
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('settings.users.title') }}
          </h1>
        </template>
        <template #description>
          {{ t('settings.users.manageSystemUsers') }}
        </template>
        <template #right>
          <HeaderActions
            :actions="[
              {
                label: t('settings.users.addUser'),
                icon: 'i-lucide-plus',
                to: '/settings/users/new',
                color: 'primary',
                show: canManageUsers,
              },
            ]"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <!-- Loading state (gate on auth init) -->
      <div v-if="!ready || loading" class="space-y-4">
        <UserCardSkeleton v-for="i in 3" :key="i" />
      </div>

      <!-- Error state -->
      <UAlert
        v-else-if="error"
        :title="error"
        color="error"
        variant="soft"
        class="mb-6"
      />

      <!-- Users list wrapped inside a section card (like configuration page) -->
      <UCard v-else-if="users.length > 0" class="overflow-visible">
        <template #header>
          <h3 class="text-lg font-semibold">{{ t('settings.users.title') }}</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('settings.users.manageSystemUsers') }}
          </p>
        </template>
        <div class="grid gap-4">
          <UCard
            v-for="user in users"
            :key="user.id"
            class="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <div class="flex-shrink-0">
                    <UserAvatar :user="user" size="lg" />
                  </div>
                  <div class="flex-1">
                    <h3
                      class="text-lg font-semibold text-gray-900 dark:text-white"
                    >
                      {{ user.name || user.username }}
                    </h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      {{ user.email || user.username }}
                    </p>
                    <div class="flex items-center gap-2 mt-2">
                      <UBadge
                        :color="getRoleColor(user.role) as any"
                        variant="soft"
                        size="sm"
                      >
                        {{ getRoleDisplayName(user.role) }}
                      </UBadge>
                      <span class="text-xs text-gray-500">
                        {{ t('settings.users.created') }}
                        {{ formatDate(user.created_at || '') }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    :to="`/settings/users/${user.username}`"
                    variant="outline"
                    size="sm"
                  >
                    {{ t('settings.users.editUser') }}
                  </UButton>
                </div>
              </div>
            </template>
          </UCard>
        </div>
      </UCard>

      <!-- Empty state -->
      <div v-else class="text-center py-12">
        <UIcon
          name="i-lucide-users"
          class="w-16 h-16 text-gray-400 mx-auto mb-4"
        />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {{ t('settings.users.noUsersFound') }}
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ t('settings.users.noUsersCreatedYet') }}
        </p>
        <UButton
          v-if="canManageUsers"
          to="/settings/users/new"
          icon="i-lucide-plus"
          color="primary"
        >
          {{ t('settings.users.addFirstUser') }}
        </UButton>
      </div>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>
