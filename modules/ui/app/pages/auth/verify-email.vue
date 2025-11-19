<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8"
  >
    <div class="max-w-md w-full space-y-8">
      <div class="text-center">
        <UIcon name="i-lucide-mail" class="mx-auto h-12 w-12 text-blue-600" />
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
          {{ t('auth.verifyEmail') }}
        </h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {{ t('auth.verifyEmailDesc') }}
        </p>
      </div>

      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin mx-auto text-blue-600"
          />
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ t('auth.verifyingEmail') }}
          </p>
        </div>

        <!-- Success State -->
        <div v-else-if="verificationResult?.success" class="text-center py-8">
          <UIcon
            name="i-lucide-check-circle"
            class="w-12 h-12 mx-auto text-green-600"
          />
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            {{ t('auth.emailVerifiedSuccessfully') }}
          </h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ verificationResult.message }}
          </p>
          <div class="mt-6">
            <UButton to="/settings/profile" size="lg" class="w-full">
              {{ t('auth.goToProfile') }}
            </UButton>
          </div>
        </div>

        <!-- Error State -->
        <div
          v-else-if="verificationResult && !verificationResult.success"
          class="text-center py-8"
        >
          <UIcon
            name="i-lucide-x-circle"
            class="w-12 h-12 mx-auto text-red-600"
          />
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            {{ t('auth.verificationFailed') }}
          </h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ verificationResult.message }}
          </p>

          <!-- Common error scenarios -->
          <div class="mt-6 space-y-3">
            <UButton
              v-if="verificationResult.message?.includes('expired')"
              @click="requestNewToken"
              :loading="requestingNewToken"
              color="primary"
              variant="outline"
              size="sm"
              class="w-full"
            >
              {{ t('auth.requestNewVerification') }}
            </UButton>

            <UButton
              to="/settings/profile"
              color="neutral"
              variant="outline"
              size="sm"
              class="w-full"
            >
              {{ t('auth.backToProfile') }}
            </UButton>
          </div>
        </div>

        <!-- No Token State -->
        <div v-else-if="!token" class="text-center py-8">
          <UIcon
            name="i-lucide-alert-circle"
            class="w-12 h-12 mx-auto text-yellow-600"
          />
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            {{ t('auth.invalidVerificationLink') }}
          </h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ t('auth.invalidVerificationLinkDesc') }}
          </p>
          <div class="mt-6">
            <UButton
              to="/settings/profile"
              color="neutral"
              variant="outline"
              size="sm"
              class="w-full"
            >
              {{ t('auth.backToProfile') }}
            </UButton>
          </div>
        </div>
      </div>

      <!-- Help Text -->
      <div class="text-center">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Having trouble? Contact support or check your email for the latest
          verification link.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SecurityResponse } from '~/composables/useSecurity';

// Meta
definePageMeta({
  layout: false, // Use a clean layout for this page
});

// Composables
const route = useRoute();
const toast = useToast();
const { verifyEmailChange } = useSecurity();
const { refreshUser } = useAuth();
const { t } = useI18n();

// Reactive state
const loading = ref(false);
const requestingNewToken = ref(false);
const verificationResult = ref<SecurityResponse | null>(null);
const token = ref<string | null>(null);

// Extract token from query parameters
onMounted(() => {
  token.value = (route.query.token as string) || null;

  if (token.value) {
    verifyEmail();
  }
});

// Methods
const verifyEmail = async () => {
  if (!token.value) return;

  try {
    loading.value = true;
    verificationResult.value = await verifyEmailChange(token.value);

    if (verificationResult.value.success) {
      // Refresh user data to get updated email
      await refreshUser();

      // Show success toast
      toast.add({
        title: t('auth.emailVerified'),
        description: verificationResult.value.message,
        color: 'primary',
      });
    }
  } catch (error: any) {
    console.error('Email verification failed:', error);
    verificationResult.value = {
      success: false,
      message: error.message || t('auth.emailVerificationFailed'),
    };
  } finally {
    loading.value = false;
  }
};

const requestNewToken = async () => {
  try {
    requestingNewToken.value = true;

    // This would typically require the user to be logged in
    // and we'd call the request email change API again
    toast.add({
      title: t('auth.featureComingSoon'),
      description: t('auth.requestNewEmailFromProfile'),
      color: 'primary',
    });

    // Redirect to login or profile
    await navigateTo('/auth/login');
  } catch (error: any) {
    console.error('Failed to request new token:', error);
    toast.add({
      title: 'Request Failed',
      description: 'Failed to request new verification email',
      color: 'error',
    });
  } finally {
    requestingNewToken.value = false;
  }
};
</script>
