<script setup lang="ts">
import type { User } from '~/types/user';

// Page metadata
definePageMeta({
  title: 'Create New User',
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-users-manage'],
});

// Breadcrumbs
const breadcrumbItems = [
  { label: 'Settings', to: '/settings' },
  { label: 'Users', to: '/settings/users' },
  { label: 'Create User' },
];

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
        title: 'Success',
        description: 'User created successfully',
        color: 'primary',
      });

      // Navigate back to users list
      await navigateTo('/settings/users');
    } else {
      error.value = response.message || 'Failed to create user';
    }
  } catch (err: any) {
    console.error('Error creating user:', err);
    error.value = err.message || 'Failed to create user';
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Create New User">
        <template #right>
          <UButton
            to="/settings/users"
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-left"
          >
            Back to Users
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
                <h2 class="text-xl font-semibold">Create New User</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Add a new user to the system
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
    </template>
  </UDashboardPanel>
</template>
