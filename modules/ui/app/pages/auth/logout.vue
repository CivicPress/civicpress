<script setup lang="ts">
const authStore = useAuthStore();
const loading = ref(false);
const error = ref('');

// Handle logout
const handleLogout = async () => {
  loading.value = true;
  error.value = '';

  try {
    await authStore.logout();
    // Redirect to login page after successful logout
    await navigateTo('/auth/login');
  } catch (err: any) {
    error.value = err.message || 'Logout failed';
  } finally {
    loading.value = false;
  }
};

// Handle cancel - go back to dashboard
const handleCancel = () => {
  navigateTo('/');
};

// Check if user is logged in on mount
onMounted(() => {
  if (!authStore.isLoggedIn || !authStore.currentUser) {
    // Redirect to login if not authenticated
    navigateTo('/auth/login');
  }
});
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Logout" />
    </template>

    <template #body>
      <div class="flex justify-center items-center h-full">
        <UCard class="w-full max-w-md">
          <template #header>
            <div class="text-center">
              <h2 class="text-2xl font-bold text-gray-900">Sign Out</h2>
              <p class="mt-2 text-sm text-gray-600">
                Are you sure you want to sign out of your CivicPress account?
              </p>
            </div>
          </template>

          <!-- Error Display -->
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            :title="error"
            icon="i-lucide-alert-circle"
          />

          <!-- User Info (if logged in) -->
          <div
            v-if="authStore.currentUser"
            class="mb-6 p-4 bg-gray-50 rounded-lg"
          >
            <div class="flex items-center space-x-3">
              <UAvatar
                v-if="authStore.currentUser.avatar_url"
                :src="authStore.currentUser.avatar_url"
                :alt="authStore.currentUser.name"
                size="md"
              />
              <div
                v-else
                class="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center"
              >
                <UIcon name="i-lucide-user" class="text-gray-600" />
              </div>
              <div>
                <p class="font-medium text-gray-900">
                  {{ authStore.currentUser.name }}
                </p>
                <p class="text-sm text-gray-600">
                  {{ authStore.currentUser.email }}
                </p>
              </div>
            </div>
          </div>

          <!-- Confirmation Message -->
          <div class="mb-6">
            <UAlert
              color="primary"
              variant="soft"
              title="You will be signed out"
              description="After signing out, you'll need to sign in again to access your account."
              icon="i-lucide-alert-triangle"
            />
          </div>

          <!-- Footer Links -->
          <template #footer>
            <div class="w-full text-right">
              <UButton
                variant="ghost"
                @click="handleCancel"
                :disabled="loading"
                class="mr-2"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                @click="handleLogout"
                :loading="loading"
                :disabled="loading"
                class=""
              >
                {{ loading ? 'Signing out...' : 'Sign Out' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
