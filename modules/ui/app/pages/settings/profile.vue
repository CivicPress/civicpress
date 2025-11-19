<script setup lang="ts">
import type { User } from '~/stores/auth';
import SystemFooter from '~/components/SystemFooter.vue';

// Store
const authStore = useAuthStore();

// Composables
const { $civicApi } = useNuxtApp();
const { refreshUser } = useAuth();
const { t } = useI18n();

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
      error.value = t('settings.authenticationRequired');
    }
  } catch (err: any) {
    error.value = err.message || t('settings.failedToFetchUserInfo');
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
  if (!dateString) return t('settings.unknown');
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
    admin: t('settings.roles.admin'),
    council: t('settings.roles.council'),
    clerk: t('settings.roles.clerk'),
    public: t('settings.roles.public'),
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

      if ((response as any).success) {
        useToast().add({
          title: t('settings.emailVerified'),
          description:
            (response as any).data?.message || t('settings.emailVerified'),
          color: 'primary',
        });

        // Clear the URL parameters
        await navigateTo('/settings/profile', { replace: true });

        // Refresh auth store with updated user data
        await refreshUser();

        // Also refresh local user info to show updated verification status
        await fetchUserInfo();
      } else {
        throw new Error(
          (response as any).error?.message ||
            (response as any).message ||
            t('settings.verificationFailed')
        );
      }
    } catch (err: any) {
      useToast().add({
        title: t('settings.emailVerificationFailed'),
        description: err.message || t('settings.failedToVerifyEmail'),
        color: 'error',
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
    error.value = t('settings.authenticationRequired');
    loading.value = false;
    return;
  }

  // Handle email verification if token is present
  await handleEmailVerification();

  // Fetch user info
  await fetchUserInfo();
});

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('settings.title'),
    to: '/settings',
  },
  {
    label: t('settings.profile'),
  },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">{{ t('settings.profile') }}</h1>
        </template>
        <template #description>
          {{ t('settings.manageAccountSettings') }}
        </template>
        <template #right>
          <div class="flex gap-2">
            <UButton
              v-if="
                authStore.currentUser?.username === userInfo?.username ||
                authStore.hasPermission('users:manage')
              "
              color="primary"
              variant="outline"
              @click="navigateTo(`/settings/users/${userInfo?.username}/edit`)"
            >
              <template #leading>
                <UIcon name="i-lucide-edit" class="w-4 h-4" />
              </template>
              {{ t('settings.editProfile') }}
            </UButton>

            <UButton
              :color="'red' as any"
              variant="outline"
              @click="navigateTo('/auth/logout')"
            >
              <template #leading>
                <UIcon name="i-lucide-log-out" class="w-4 h-4" />
              </template>
              {{ t('common.logOut') }}
            </UButton>
          </div>
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
          <p class="text-gray-600">{{ t('settings.loadingProfile') }}</p>
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
            {{ t('common.tryAgain') }}
          </UButton>
        </template>
      </UAlert>

      <!-- Profile Content -->
      <div v-else-if="userInfo" class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- User Information -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 class="text-lg font-semibold mb-4">
            {{ t('settings.userInfo') }}
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >{{ t('auth.username') }}</label
                >
                <p class="mt-1 text-sm">{{ userInfo.username }}</p>
              </div>

              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >{{ t('settings.displayName') }}</label
                >
                <p class="mt-1 text-sm">
                  {{ userInfo.name || t('settings.notProvided') }}
                </p>
              </div>

              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >{{ t('auth.email') }}</label
                >
                <p class="mt-1 text-sm">
                  {{ userInfo.email || t('settings.notProvided') }}
                </p>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >{{ t('common.role') }}</label
                >
                <div class="mt-1">
                  <UBadge :color="getRoleColor(userInfo.role) as any">
                    {{ getRoleDisplayName(userInfo.role) }}
                  </UBadge>
                </div>
              </div>

              <div>
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >{{ t('settings.userId') }}</label
                >
                <p class="mt-1 text-sm font-mono">{{ userInfo.id }}</p>
              </div>

              <div v-if="userInfo.avatar_url">
                <label
                  class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                  >{{ t('settings.avatar') }}</label
                >
                <div class="mt-1">
                  <img
                    :src="userInfo.avatar_url"
                    :alt="t('settings.avatar')"
                    class="w-8 h-8 rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Authentication Token -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 class="text-lg font-semibold mb-4">
            {{ t('settings.apiAccessToken') }}
          </h2>
          <p class="text-xs text-gray-600 dark:text-gray-400 mb-4">
            {{ t('settings.useTokenForApiTesting') }}
            <span class="text-amber-600 dark:text-amber-500">
              {{ t('settings.neverShareToken') }}
            </span>
          </p>

          <div class="space-y-4">
            <div>
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2"
                >{{ t('settings.bearerToken') }}</label
              >
              <div class="flex items-center space-x-2">
                <UInput
                  :model-value="
                    authStore.token || t('settings.noTokenAvailable')
                  "
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
                  {{ tokenCopied ? t('settings.copied') : t('common.copy') }}
                </UButton>
              </div>
            </div>

            <div>
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2"
                >{{ t('settings.authorizationHeader') }}</label
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
                  {{ tokenCopied ? t('settings.copied') : t('common.copy') }}
                </UButton>
              </div>
            </div>
          </div>

          <div class="mt-4 p-4 bg-blue-50 rounded-lg">
            <h3 class="text-sm font-medium text-blue-900 mb-2">
              {{ t('settings.apiTestingTips') }}
            </h3>
            <ul class="text-sm text-blue-800 space-y-1">
              <li>
                {{ t('settings.apiTestingTip1') }}
              </li>
              <li>
                {{ t('settings.apiTestingTip2') }}:
                <code class="bg-blue-100 px-1 rounded">Bearer YOUR_TOKEN</code>
              </li>
              <li>
                {{ t('settings.apiTestingTip3') }}:
                <code class="bg-blue-100 px-1 rounded">GET /auth/me</code>
              </li>
              <li>{{ t('settings.apiTestingTip4') }}</li>
            </ul>
          </div>
        </div>

        <!-- Permissions -->
        <div
          v-if="userInfo.permissions && userInfo.permissions.length > 0"
          class="rounded-lg border border-gray-200 dark:border-gray-800 p-6"
        >
          <h2 class="text-lg font-semibold mb-4">
            {{ t('settings.yourPermissions') }}
          </h2>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="permission in userInfo.permissions"
              :key="permission"
              :color="'blue' as any"
              variant="subtle"
              size="sm"
              class="border border-gray-200 dark:border-gray-800"
            >
              {{ permission }}
            </UBadge>
          </div>
        </div>

        <!-- Session Information -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 class="text-lg font-semibold mb-4">
            {{ t('settings.sessionInformation') }}
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                >{{ t('settings.sessionStatus') }}</label
              >
              <div class="mt-1">
                <UBadge :color="'green' as any" variant="soft">
                  <template #leading>
                    <UIcon name="i-lucide-check-circle" class="w-3 h-3" />
                  </template>
                  {{ t('settings.active') }}
                </UBadge>
              </div>
            </div>

            <div v-if="authStore.sessionExpiresAt">
              <label
                class="block text-sm font-medium text-gray-500 dark:text-gray-400"
                >{{ t('settings.expiresAt') }}</label
              >
              <p class="mt-1 text-sm">
                {{ formatDate(authStore.sessionExpiresAt) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Security Settings -->
        <div class="md:col-span-2">
          <SecuritySettings
            :user-id="userInfo.id"
            :user-data="{
              email: userInfo.email,
              email_verified: (userInfo as any).emailVerified || false,
            }"
          />
        </div>
      </div>

      <!-- Footer -->
      <SystemFooter v-if="userInfo" />

      <!-- No User Info -->
      <div v-else class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-user-x"
            class="w-12 h-12 text-gray-400 mx-auto mb-4"
          />
          <h3 class="text-lg font-medium mb-2">
            {{ t('settings.noUserInformation') }}
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            {{ t('settings.unableToLoadUserInfo') }}
          </p>
          <UButton @click="fetchUserInfo" color="primary" variant="soft">
            {{ t('common.tryAgain') }}
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
