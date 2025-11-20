<script setup lang="ts">
import type { User } from '~/types/user';
import SystemFooter from '~/components/SystemFooter.vue';

const { t } = useI18n();
// Page metadata
definePageMeta({
  title: 'Create New User',
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-auth', 'require-users-manage'],
});

// Breadcrumbs
const breadcrumbItems = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('common.settings'), to: '/settings' },
  { label: t('settings.users.title'), to: '/settings/users' },
  { label: t('settings.users.createUser') },
]);

// Reactive state
const error = ref<string | null>(null);
const saving = ref(false);

// Handle form submission
const handleSubmit = async (userData: any) => {
  saving.value = true;
  error.value = null;

  try {
    const response = (await useNuxtApp().$civicApi('/api/v1/users', {
      method: 'POST',
      body: userData,
    })) as any;

    if (response.success) {
      // Show success message
      useToast().add({
        title: t('common.success'),
        description: t('settings.users.userCreatedSuccessfully'),
        color: 'primary',
      });

      // Navigate back to users list
      await navigateTo('/settings/users');
    } else {
      error.value = response.message || t('settings.users.failedToCreateUser');
    }
  } catch (err: any) {
    console.error('Error creating user:', err);
    error.value = err.message || t('settings.users.failedToCreateUser');
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('settings.users.createUser')">
        <template #right>
          <UButton
            to="/settings/users"
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-left"
          >
            {{ t('settings.users.backToUsers') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <UCard>
          <template #header>
            <div class="flex items-center space-x-3">
              <UIcon
                name="i-lucide-user-plus"
                class="w-6 h-6 text-primary-600"
              />
              <div>
                <h2 class="text-xl font-semibold">
                  {{ t('settings.users.createUser') }}
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('settings.users.addNewUserToSystem') }}
                </p>
              </div>
            </div>
          </template>

          <UserForm
            :error="error || undefined"
            :saving="saving"
            @submit="handleSubmit"
          />
        </UCard>
      </div>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>
