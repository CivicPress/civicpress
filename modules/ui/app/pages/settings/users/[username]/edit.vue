<script setup lang="ts">
import type { User } from '~/types/user';
import SystemFooter from '~/components/SystemFooter.vue';

// Page metadata
definePageMeta({
  title: 'Edit User',
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-users-manage'],
});

const { t } = useI18n();
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
  return user.value
    ? t('settings.users.editUserTitle', {
        name: user.value.name || user.value.username,
      })
    : t('settings.users.updateUser');
});

const breadcrumbItems = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('common.settings'), to: '/settings' },
  { label: t('settings.users.title'), to: '/settings/users' },
  {
    label: user.value?.name || user.value?.username || t('settings.users.user'),
  },
]);

// Only show edit page to self or users:manage
const isSelf = computed(() => authStore.currentUser?.username === username);
const canManageUsers = computed(() => authStore.hasPermission('users:manage'));

// Deletion allowed only if users:manage and not deleting self
const canDelete = computed(
  () => canManageUsers.value && authStore.currentUser?.id !== user.value?.id
);

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
      error.value = response.message || t('settings.users.failedToFetchUser');
    }
  } catch (err: any) {
    console.error('Error fetching user:', err);
    error.value = err.message || t('settings.users.failedToFetchUser');
  } finally {
    loading.value = false;
  }
};

// Handle form submission
const handleSubmit = async (userData: any) => {
  saving.value = true;
  formError.value = null;

  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/users/${username}`,
      {
        method: 'PUT',
        body: userData,
      }
    )) as any;

    if (response.success) {
      // Update local user data
      user.value = response.data.user;

      // Show success message
      useToast().add({
        title: t('common.success'),
        description: t('settings.users.userUpdatedSuccessfully'),
        color: 'primary',
      });
    } else {
      formError.value =
        response.message || t('settings.users.failedToUpdateUser');
    }
  } catch (err: any) {
    console.error('Error updating user:', err);
    formError.value = err.message || t('settings.users.failedToUpdateUser');
  } finally {
    saving.value = false;
  }
};

// Handle user deletion
const handleDelete = async () => {
  saving.value = true;

  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/users/${username}`,
      {
        method: 'DELETE',
      }
    )) as any;

    if (response.success) {
      // Show success message
      useToast().add({
        title: t('common.success'),
        description: t('settings.users.userDeletedSuccessfully'),
        color: 'primary',
      });

      // Navigate back to users list
      await navigateTo('/settings/users');
    } else {
      formError.value =
        response.message || t('settings.users.failedToDeleteUser');
    }
  } catch (err: any) {
    console.error('Error deleting user:', err);
    formError.value = err.message || t('settings.users.failedToDeleteUser');
  } finally {
    saving.value = false;
  }
};

// Fetch user data on mount
onMounted(() => {
  if (!isSelf.value && !canManageUsers.value) {
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
                label: t('settings.users.backToUsers'),
                icon: 'i-lucide-arrow-left',
                to: '/settings/users',
                color: 'neutral',
                variant: 'outline',
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
                <h2 class="text-xl font-semibold">
                  {{ t('settings.users.loadingUser') }}
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('settings.users.fetchingUserInformation') }}
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

          <UserForm
            :user="user || undefined"
            :is-editing="true"
            :error="formError || undefined"
            :saving="saving"
            :can-delete="canDelete"
            @submit="handleSubmit"
            @delete="handleDelete"
          />
        </UCard>
      </div>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>
