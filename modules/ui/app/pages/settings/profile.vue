<script setup lang="ts">
import type { User } from '~/stores/auth';

// Store
const authStore = useAuthStore();

// Composables
const { $civicApi } = useNuxtApp();
const { refreshUser } = useAuth();

// Reactive state
const userInfo = ref<User | null>(null);
const loading = ref(true);
const error = ref('');
const tokenCopied = ref(false);

// Fetch user information
const fetchUserInfo = async () => {
  try {
    // Use data from auth store if available
    if (authStore.user && authStore.isAuthenticated) {
      userInfo.value = authStore.user;
      loading.value = false;
      return;
    }

    // Otherwise try to fetch from API (requires authentication)
    if (authStore.token) {
      const response = (await $civicApi('/auth/me')) as any;
      if (response.success) {
        userInfo.value = response.data.user;
        // Also update the auth store with fresh data
        authStore.updateUser(response.data.user);
      }
    } else {
      error.value =
        'Authentication required. Please log in to view your profile.';
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to fetch user information';
    console.error('Error fetching user info:', err);
  } finally {
    loading.value = false;
  }
};

// Copy token to clipboard
const copyToken = async () => {
  if (!authStore.token) return;

  try {
    await navigator.clipboard.writeText(authStore.token);
    tokenCopied.value = true;
    setTimeout(() => {
      tokenCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy token:', err);
  }
};

// Copy authorization header to clipboard
const copyAuthHeader = async () => {
  if (!authStore.token) return;

  try {
    await navigator.clipboard.writeText(`Bearer ${authStore.token}`);
    tokenCopied.value = true;
    setTimeout(() => {
      tokenCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy auth header:', err);
  }
};

// Format date
const formatDate = (dateString: string) => {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Get role display name
const getRoleDisplayName = (role: string) => {
  const roleMap: Record<string, string> = {
    admin: 'Administrator',
    council: 'Council Member',
    clerk: 'Clerk',
    public: 'Public User',
  };
  return roleMap[role] || role;
};

// Get role color
const getRoleColor = (role: string) => {
  const colorMap: Record<string, string> = {
    admin: 'red',
    council: 'blue',
    clerk: 'green',
    public: 'gray',
  };
  return colorMap[role] || 'gray';
};

// Handle email verification token from URL
const handleEmailVerification = async () => {
  const route = useRoute();
  const token = route.query.token as string;
  const action = route.query.action as string;

  if (
    (action === 'verify-email' || action === 'confirm-email-change') &&
    token
  ) {
    try {
      loading.value = true;
      const { $civicApi } = useNuxtApp();

      // Choose the correct endpoint based on the action
      const endpoint =
        action === 'verify-email'
          ? '/api/v1/users/verify-current-email'
          : '/api/v1/users/verify-email-change';

      const response = await $civicApi(endpoint, {
        method: 'POST',
        body: { token },
      });

      if (response.success) {
        useToast().add({
          title: 'Email Verified Successfully',
          description:
            response.data?.message || 'Your email address has been verified.',
          color: 'green',
        });

        // Clear the URL parameters
        await navigateTo('/settings/profile', { replace: true });

        // Refresh auth store with updated user data
        await refreshUser();

        // Also refresh local user info to show updated verification status
        await fetchUserInfo();
      } else {
        throw new Error(
          response.error?.message || response.message || 'Verification failed'
        );
      }
    } catch (err: any) {
      useToast().add({
        title: 'Email Verification Failed',
        description: err.message || 'Failed to verify email address',
        color: 'red',
      });

      // Clear the URL parameters even on error
      await navigateTo('/settings/profile', { replace: true });
    } finally {
      loading.value = false;
    }
  }
};

// Load user info on mount
onMounted(async () => {
  // Check if user is authenticated
  if (!authStore.isAuthenticated) {
    error.value =
      'Authentication required. Please log in to view your profile.';
    loading.value = false;
    return;
  }

  // Handle email verification if token is present
  await handleEmailVerification();

  // Fetch user info
  await fetchUserInfo();
});

const breadcrumbItems = [
  {
    label: 'Settings',
    to: '/settings',
  },
  {
    label: 'Profile',
  },
];
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-lg font-semibold">Profile Settings</h1>
        </template>
        <template #description>
          Manage your account settings and view your information
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4"
          />
          <p class="text-gray-600">Loading profile...</p>
        </div>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        :title="error"
        icon="i-lucide-alert-circle"
        class="mb-4"
      >
        <template #footer>
          <UButton color="error" variant="soft" @click="fetchUserInfo">
            Try Again
          </UButton>
        </template>
      </UAlert>

      <!-- Profile Content -->
      <div v-else-if="userInfo" class="space-y-6">
        <!-- User Information -->
        <div class="rounded-lg border p-6">
          <h2 class="text-lg font-semibold mb-4">User Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >Username</label
                >
                <p class="mt-1 text-sm">{{ userInfo.username }}</p>
              </div>

              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >Display Name</label
                >
                <p class="mt-1 text-sm">
                  {{ userInfo.name || 'Not provided' }}
                </p>
              </div>

              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >Email</label
                >
                <p class="mt-1 text-sm">
                  {{ userInfo.email || 'Not provided' }}
                </p>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >Role</label
                >
                <div class="mt-1">
                  <UBadge
                    :color="getRoleColor(userInfo.role) as any"
                    variant="soft"
                  >
                    {{ getRoleDisplayName(userInfo.role) }}
                  </UBadge>
                </div>
              </div>

              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >User ID</label
                >
                <p class="mt-1 text-sm font-mono">{{ userInfo.id }}</p>
              </div>

              <div v-if="userInfo.avatar">
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >Avatar</label
                >
                <div class="mt-1">
                  <img
                    :src="userInfo.avatar"
                    alt="User avatar"
                    class="w-8 h-8 rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Authentication Token -->
        <div class="rounded-lg border p-6">
          <h2 class="text-lg font-semibold mb-4">Authentication Token</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Use this token for API testing in Postman or other tools. Keep it
            secure and don't share it publicly.
          </p>

          <div class="space-y-4">
            <div>
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2"
                >Bearer Token</label
              >
              <div class="flex items-center space-x-2">
                <UInput
                  :model-value="authStore.token || 'No token available'"
                  readonly
                  class="flex-1 font-mono text-xs"
                  size="sm"
                />
                <UButton
                  @click="copyToken"
                  :color="(tokenCopied ? 'green' : 'primary') as any"
                  variant="soft"
                  size="sm"
                  :disabled="!authStore.token"
                >
                  <template #leading>
                    <UIcon
                      :name="tokenCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                      class="w-4 h-4"
                    />
                  </template>
                  {{ tokenCopied ? 'Copied!' : 'Copy' }}
                </UButton>
              </div>
            </div>

            <div>
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2"
                >Authorization Header</label
              >
              <div class="flex items-center space-x-2">
                <UInput
                  :model-value="`Bearer ${authStore.token || 'your-token-here'}`"
                  readonly
                  class="flex-1 font-mono text-xs"
                  size="sm"
                />
                <UButton
                  @click="copyAuthHeader"
                  :color="(tokenCopied ? 'green' : 'primary') as any"
                  variant="soft"
                  size="sm"
                  :disabled="!authStore.token"
                >
                  <template #leading>
                    <UIcon
                      :name="tokenCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                      class="w-4 h-4"
                    />
                  </template>
                  {{ tokenCopied ? 'Copied!' : 'Copy' }}
                </UButton>
              </div>
            </div>
          </div>

          <div class="mt-4 p-4 bg-blue-50 rounded-lg">
            <h3 class="text-sm font-medium text-blue-900 mb-2">
              💡 API Testing Tips
            </h3>
            <ul class="text-sm text-blue-800 space-y-1">
              <li>
                • Add the token to your Postman collection environment variables
              </li>
              <li>
                • Use the Authorization header:
                <code class="bg-blue-100 px-1 rounded">Bearer YOUR_TOKEN</code>
              </li>
              <li>
                • Test with:
                <code class="bg-blue-100 px-1 rounded">GET /auth/me</code>
              </li>
              <li>• The token expires automatically - refresh if needed</li>
            </ul>
          </div>
        </div>

        <!-- Session Information -->
        <div class="rounded-lg border p-6">
          <h2 class="text-lg font-semibold mb-4">Session Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                >Session Status</label
              >
              <div class="mt-1">
                <UBadge :color="'green' as any" variant="soft">
                  <template #leading>
                    <UIcon name="i-lucide-check-circle" class="w-3 h-3" />
                  </template>
                  Active
                </UBadge>
              </div>
            </div>

            <div v-if="authStore.sessionExpiresAt">
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                >Expires At</label
              >
              <p class="mt-1 text-sm">
                {{ formatDate(authStore.sessionExpiresAt) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Permissions -->
        <div
          v-if="userInfo.permissions && userInfo.permissions.length > 0"
          class="rounded-lg border p-6"
        >
          <h2 class="text-lg font-semibold mb-4">Permissions</h2>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="permission in userInfo.permissions"
              :key="permission"
              :color="'blue' as any"
              variant="soft"
              size="sm"
            >
              {{ permission }}
            </UBadge>
          </div>
        </div>

        <!-- Actions -->
        <div class="rounded-lg border p-6">
          <h2 class="text-lg font-semibold mb-4">Account Actions</h2>
          <div class="flex flex-wrap gap-4">
            <UButton
              v-if="
                authStore.currentUser?.username === userInfo?.username ||
                authStore.hasPermission('users:manage')
              "
              color="primary"
              variant="soft"
              @click="navigateTo(`/settings/users/${userInfo?.username}/edit`)"
            >
              <template #leading>
                <UIcon name="i-lucide-edit" class="w-4 h-4" />
              </template>
              Edit Profile
            </UButton>

            <UButton
              :color="'red' as any"
              variant="soft"
              @click="navigateTo('/auth/logout')"
            >
              <template #leading>
                <UIcon name="i-lucide-log-out" class="w-4 h-4" />
              </template>
              Logout
            </UButton>
          </div>
        </div>

        <!-- Security Settings -->
        <div class="mt-8">
          <SecuritySettings
            :user-id="userInfo.id"
            :user-data="{
              email: userInfo.email,
              email_verified: userInfo.email_verified,
            }"
          />
        </div>
      </div>

      <!-- No User Info -->
      <div v-else class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-user-x"
            class="w-12 h-12 text-gray-400 mx-auto mb-4"
          />
          <h3 class="text-lg font-medium mb-2">No User Information</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            Unable to load user information. Please try again or contact
            support.
          </p>
          <UButton @click="fetchUserInfo" color="primary" variant="soft">
            Try Again
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
