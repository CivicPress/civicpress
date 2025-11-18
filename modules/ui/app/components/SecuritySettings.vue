<template>
  <div v-if="loading" class="flex items-center justify-center p-8">
    <div
      class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"
    ></div>
    <span class="ml-3 text-gray-600 dark:text-gray-400">{{
      t('settings.security.loadingSecurityInfo')
    }}</span>
  </div>

  <div v-else-if="!securityInfo" class="text-center p-8">
    <p class="text-gray-500 dark:text-gray-400">
      {{ t('settings.security.failedToLoadSecurity') }}
    </p>
  </div>

  <div v-else class="space-y-6">
    <!-- Security Overview -->
    <div
      class="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-800"
    >
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
          {{ t('settings.security.title') }}
        </h3>
        <UBadge
          :color="securityInfo?.emailVerified ? 'primary' : 'primary'"
          variant="subtle"
        >
          {{
            securityInfo?.emailVerified
              ? t('settings.security.emailVerified')
              : t('settings.security.emailUnverified')
          }}
        </UBadge>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Authentication Provider -->
        <div class="flex items-center space-x-3">
          <div class="flex-shrink-0">
            <UIcon
              :name="getProviderIcon(securityInfo?.authProvider)"
              class="w-5 h-5 text-gray-400"
            />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">
              {{ t('settings.security.authenticationMethod') }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ getAuthProviderDisplayName(securityInfo?.authProvider) }}
            </p>
          </div>
        </div>

        <!-- Email Status -->
        <div class="flex items-center space-x-3">
          <div class="flex-shrink-0">
            <UIcon
              :name="
                securityInfo?.emailVerified
                  ? 'i-lucide-mail-check'
                  : 'i-lucide-mail-warning'
              "
              :class="
                securityInfo?.emailVerified
                  ? 'text-green-400'
                  : 'text-yellow-400'
              "
              class="w-5 h-5"
            />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">
              {{ t('settings.security.emailStatus') }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{
                securityInfo?.emailVerified
                  ? t('settings.security.verified')
                  : t('settings.security.verificationRequired')
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- External Auth Warning -->
      <div
        v-if="securityInfo?.isExternalAuth"
        class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md"
      >
        <div class="flex">
          <UIcon
            name="i-lucide-info"
            class="w-5 h-5 text-blue-400 flex-shrink-0"
          />
          <div class="ml-3">
            <p class="text-sm text-blue-800 dark:text-blue-200">
              {{
                t('settings.security.externalAuthWarning', {
                  provider: getAuthProviderDisplayName(
                    securityInfo?.authProvider
                  ),
                })
              }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Password and Email Management -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Password Management -->
      <div
        v-if="securityInfo?.canSetPassword"
        class="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-800"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">
            {{ t('settings.security.passwordManagement') }}
          </h3>
        </div>

        <form @submit.prevent="handlePasswordChange" class="space-y-4">
          <!-- Current Password -->
          <UFormField
            :label="t('settings.security.currentPassword')"
            :description="t('settings.security.currentPasswordDescription')"
            :error="passwordErrors.currentPassword"
          >
            <UInput
              v-model="passwordForm.currentPassword"
              type="password"
              :placeholder="t('settings.security.enterCurrentPassword')"
              :disabled="passwordLoading"
              class="w-full"
              required
            />
          </UFormField>

          <!-- New Password -->
          <UFormField
            :label="t('settings.security.newPassword')"
            :description="t('settings.security.newPasswordDescription')"
            :error="passwordErrors.newPassword"
          >
            <div class="flex space-x-2 w-full">
              <UInput
                v-model="passwordForm.newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                :placeholder="t('settings.security.enterNewPassword')"
                :disabled="passwordLoading"
                class="flex-1 w-full"
                required
              />
              <UButton
                type="button"
                :icon="showNewPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                color="neutral"
                variant="outline"
                size="sm"
                @click="showNewPassword = !showNewPassword"
                :title="
                  showNewPassword
                    ? t('settings.security.hidePassword')
                    : t('settings.security.showPassword')
                "
              />
            </div>
          </UFormField>

          <!-- Confirm New Password -->
          <UFormField
            :label="t('settings.security.confirmNewPassword')"
            :description="t('settings.security.confirmNewPasswordDescription')"
            :error="passwordErrors.confirmPassword"
          >
            <UInput
              v-model="passwordForm.confirmPassword"
              :type="showNewPassword ? 'text' : 'password'"
              :placeholder="
                t('settings.security.confirmNewPasswordPlaceholder')
              "
              :disabled="passwordLoading"
              class="w-full"
              required
            />
          </UFormField>

          <!-- Actions -->
          <div class="flex justify-end space-x-3">
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              @click="resetPasswordForm"
              :disabled="passwordLoading"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton
              type="submit"
              :loading="passwordLoading"
              :disabled="!isPasswordFormValid"
            >
              {{ t('settings.security.changePassword') }}
            </UButton>
          </div>
        </form>
      </div>

      <!-- Email Management -->
      <div
        class="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-800"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">
            {{ t('settings.security.emailManagement') }}
          </h3>
        </div>

        <!-- Current Email -->
        <div class="mb-4">
          <label
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            {{ t('settings.security.currentEmail') }}
          </label>
          <div class="flex items-center space-x-2 w-full">
            <UInput
              :model-value="securityInfo?.email"
              disabled
              class="flex-1 w-full"
            />
            <UBadge
              :color="securityInfo?.emailVerified ? 'primary' : 'primary'"
              variant="subtle"
            >
              {{
                securityInfo?.emailVerified
                  ? t('settings.security.verified')
                  : t('settings.security.unverified')
              }}
            </UBadge>
          </div>
        </div>

        <!-- Email Verification -->
        <div
          v-if="!securityInfo?.emailVerified && securityInfo?.email"
          class="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md"
        >
          <div class="flex items-start">
            <UIcon
              name="i-lucide-mail-warning"
              class="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5"
            />
            <div class="ml-3 flex-1">
              <p
                class="text-sm font-medium text-yellow-800 dark:text-yellow-200"
              >
                {{ t('settings.security.emailVerificationRequired') }}
              </p>
              <p class="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {{ t('settings.security.emailVerificationDescription') }}
              </p>
              <div class="mt-3">
                <UButton
                  size="sm"
                  color="primary"
                  @click="handleSendEmailVerification"
                  :loading="emailVerificationLoading"
                >
                  <UIcon name="i-lucide-mail" class="w-4 h-4 mr-2" />
                  {{ t('settings.security.sendVerificationEmail') }}
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- Pending Email Change -->
        <div
          v-if="hasPendingEmailChange(securityInfo)"
          class="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md"
        >
          <div class="flex items-start">
            <UIcon
              name="i-lucide-clock"
              class="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5"
            />
            <div class="ml-3 flex-1">
              <p
                class="text-sm font-medium text-yellow-800 dark:text-yellow-200"
              >
                {{ t('settings.security.emailChangePending') }}
              </p>
              <p class="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {{ t('settings.security.verificationEmailSentTo') }}:
                {{ securityInfo?.pendingEmailChange?.email }}
              </p>
              <div class="mt-2 flex space-x-2">
                <UButton
                  size="xs"
                  color="primary"
                  variant="outline"
                  @click="cancelEmailChange"
                  :loading="emailLoading"
                >
                  {{ t('settings.security.cancelChange') }}
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- Change Email Form -->
        <form
          v-if="!hasPendingEmailChange(securityInfo)"
          @submit.prevent="handleEmailChange"
          class="space-y-4"
        >
          <UFormField
            :label="t('settings.security.newEmail')"
            :description="t('settings.security.newEmailDescription')"
            :error="emailErrors.newEmail"
          >
            <UInput
              v-model="emailForm.newEmail"
              type="email"
              :placeholder="t('settings.security.enterNewEmail')"
              :disabled="emailLoading"
              class="w-full"
              required
            />
          </UFormField>

          <div class="flex justify-end space-x-3">
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              @click="resetEmailForm"
              :disabled="emailLoading"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton
              type="submit"
              :loading="emailLoading"
              :disabled="!isEmailFormValid"
            >
              {{ t('settings.security.requestEmailChange') }}
            </UButton>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SecurityInfo } from '~/composables/useSecurity';

interface Props {
  userId: number;
  userData?: {
    email: string;
    email_verified: boolean;
  };
}

const props = defineProps<Props>();

// Composables
const { $civicApi } = useNuxtApp();
const toast = useToast();
const { t } = useI18n();
const {
  getSecurityInfo,
  changePassword,
  requestEmailChange,
  cancelEmailChange: cancelEmailChangeAPI,
  sendEmailVerification,
  getAuthProviderDisplayName,
  hasPendingEmailChange,
} = useSecurity();

// Reactive state
const securityInfo = ref<SecurityInfo | null>(null);
const loading = ref(true);
const passwordLoading = ref(false);
const emailLoading = ref(false);
const emailVerificationLoading = ref(false);
const showNewPassword = ref(false);

// Password form
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const passwordErrors = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

// Email form
const emailForm = ref({
  newEmail: '',
});

const emailErrors = ref({
  newEmail: '',
});

// Computed
const isPasswordFormValid = computed(() => {
  return (
    passwordForm.value.currentPassword &&
    passwordForm.value.newPassword &&
    passwordForm.value.confirmPassword &&
    passwordForm.value.newPassword === passwordForm.value.confirmPassword &&
    passwordForm.value.newPassword.length >= 8
  );
});

const isEmailFormValid = computed(() => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailForm.value.newEmail && emailRegex.test(emailForm.value.newEmail);
});

// Methods
const fetchSecurityInfo = async () => {
  try {
    loading.value = true;

    // If userData is provided, use it to create a basic security info object
    if (props.userData) {
      securityInfo.value = {
        userId: props.userId,
        username: '', // Not needed for display
        email: props.userData.email,
        authProvider: 'password', // Default, could be enhanced
        emailVerified: props.userData.email_verified,
        canSetPassword: true, // Default, could be enhanced
        isExternalAuth: false, // Default, could be enhanced
        pendingEmailChange: {
          email: null,
          expiresAt: null,
        },
      };
    } else {
      // Fallback to fetching full security info
      securityInfo.value = await getSecurityInfo(props.userId);
    }
  } catch (error: any) {
    console.error('Failed to fetch security info:', error);
    toast.add({
      title: t('common.error'),
      description: t('settings.security.failedToLoadSecurity'),
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
};

const handlePasswordChange = async () => {
  try {
    passwordLoading.value = true;
    passwordErrors.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    };

    // Validate passwords match
    if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
      passwordErrors.value.confirmPassword = t(
        'settings.security.passwordsDoNotMatch'
      );
      return;
    }

    const result = await changePassword(props.userId, {
      currentPassword: passwordForm.value.currentPassword,
      newPassword: passwordForm.value.newPassword,
    });

    if (result.success) {
      toast.add({
        title: t('settings.security.passwordChanged'),
        description: result.message,
        color: 'primary',
      });
      resetPasswordForm();
    }
  } catch (error: any) {
    console.error('Password change failed:', error);

    // Handle specific error cases
    if (error.message?.includes('current password')) {
      passwordErrors.value.currentPassword = t(
        'settings.security.currentPasswordIncorrect'
      );
    } else if (error.message?.includes('external provider')) {
      toast.add({
        title: t('settings.security.cannotChangePassword'),
        description: error.message,
        color: 'primary',
      });
    } else {
      toast.add({
        title: t('settings.security.passwordChangeFailed'),
        description:
          error.message || t('settings.security.failedToChangePassword'),
        color: 'error',
      });
    }
  } finally {
    passwordLoading.value = false;
  }
};

const handleEmailChange = async () => {
  try {
    emailLoading.value = true;
    emailErrors.value = { newEmail: '' };

    const result = await requestEmailChange(props.userId, {
      newEmail: emailForm.value.newEmail,
    });

    if (result.success) {
      toast.add({
        title: t('settings.security.emailChangeRequested'),
        description: result.message,
        color: 'primary',
      });
      resetEmailForm();
      await fetchSecurityInfo(); // Refresh to show pending change
    }
  } catch (error: any) {
    console.error('Email change request failed:', error);

    if (error.message?.includes('already in use')) {
      emailErrors.value.newEmail = t('settings.security.emailAlreadyInUse');
    } else {
      toast.add({
        title: t('settings.security.emailChangeFailed'),
        description:
          error.message || t('settings.security.failedToRequestEmailChange'),
        color: 'error',
      });
    }
  } finally {
    emailLoading.value = false;
  }
};

const cancelEmailChange = async () => {
  try {
    emailLoading.value = true;
    const result = await cancelEmailChangeAPI(props.userId);

    if (result.success) {
      toast.add({
        title: t('settings.security.emailChangeCancelled'),
        description: result.message,
        color: 'primary',
      });
      await fetchSecurityInfo(); // Refresh to hide pending change
    }
  } catch (error: any) {
    console.error('Cancel email change failed:', error);
    toast.add({
      title: t('settings.security.cancelFailed'),
      description:
        error.message || t('settings.security.failedToCancelEmailChange'),
      color: 'error',
    });
  } finally {
    emailLoading.value = false;
  }
};

const handleSendEmailVerification = async () => {
  try {
    emailVerificationLoading.value = true;
    const result = await sendEmailVerification(props.userId);

    if (result.success) {
      toast.add({
        title: t('settings.security.verificationEmailSent'),
        description: result.message,
        color: 'primary',
      });
    }
  } catch (error: any) {
    console.error('Send email verification failed:', error);
    toast.add({
      title: t('settings.security.failedToSendVerificationEmail'),
      description:
        error.message ||
        t('settings.security.failedToSendVerificationEmailDesc'),
      color: 'error',
    });
  } finally {
    emailVerificationLoading.value = false;
  }
};

const resetPasswordForm = () => {
  passwordForm.value = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
  passwordErrors.value = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
  showNewPassword.value = false;
};

const resetEmailForm = () => {
  emailForm.value = { newEmail: '' };
  emailErrors.value = { newEmail: '' };
};

const getProviderIcon = (provider?: string): string => {
  switch (provider) {
    case 'github':
      return 'i-lucide-github';
    case 'google':
      return 'i-lucide-chrome';
    case 'microsoft':
      return 'i-lucide-microsoft';
    case 'password':
    default:
      return 'i-lucide-key';
  }
};

// Lifecycle
onMounted(() => {
  fetchSecurityInfo();
});
</script>
