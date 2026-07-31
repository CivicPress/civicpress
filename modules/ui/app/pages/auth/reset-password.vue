<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const { $civicApi } = useNuxtApp();

// The reset link carries the single-use token as ?token=…
const token = computed(() => {
  const q = route.query.token;
  return typeof q === 'string' ? q : Array.isArray(q) ? (q[0] ?? '') : '';
});

const state = reactive({ newPassword: '', confirmPassword: '' });
const loading = ref(false);
const done = ref(false);
const error = ref('');

const passwordsMatch = computed(
  () => state.newPassword === state.confirmPassword
);
const isValid = computed(
  () =>
    state.newPassword.length >= 8 &&
    passwordsMatch.value &&
    token.value.trim() !== ''
);

const handleSubmit = async () => {
  if (!isValid.value) {
    if (!passwordsMatch.value) error.value = t('auth.passwordsDoNotMatch');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await $civicApi('/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, newPassword: state.newPassword },
    });
    done.value = true;
  } catch (err: unknown) {
    // Surface the server's message (uniform "invalid or expired", or a
    // password-policy explanation).
    const msg =
      (err as { data?: { error?: { message?: string } }; message?: string })
        ?.data?.error?.message ||
      (err as { message?: string })?.message ||
      t('auth.resetPasswordError');
    error.value = msg;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('auth.resetPasswordTitle')" />
    </template>

    <template #body>
      <div class="flex justify-center items-center h-full">
        <UCard class="w-full max-w-md">
          <template #default>
            <!-- Success state -->
            <div v-if="done" class="space-y-6 text-center">
              <UIcon
                name="i-lucide-circle-check"
                class="w-16 h-16 mx-auto text-primary"
              />
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">
                  {{ t('auth.resetPasswordSuccessTitle') }}
                </h2>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ t('auth.resetPasswordSuccess') }}
                </p>
              </div>
              <UButton to="/auth/login" block>
                {{ t('auth.backToLogin') }}
              </UButton>
            </div>

            <!-- Missing-token state -->
            <div
              v-else-if="!token"
              class="space-y-6 text-center"
            >
              <UIcon
                name="i-lucide-link-2-off"
                class="w-16 h-16 mx-auto text-gray-400"
              />
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">
                  {{ t('auth.resetPasswordInvalidTitle') }}
                </h2>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ t('auth.resetPasswordMissingToken') }}
                </p>
              </div>
              <UButton to="/auth/forgot-password" block variant="soft">
                {{ t('auth.forgotPasswordSubmit') }}
              </UButton>
            </div>

            <!-- Reset form -->
            <div v-else class="space-y-6">
              <div class="text-center space-y-2">
                <UIcon
                  name="i-lucide-lock-keyhole"
                  class="w-12 h-12 mx-auto text-gray-400"
                />
                <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">
                  {{ t('auth.resetPasswordTitle') }}
                </h2>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ t('auth.resetPasswordFormDesc') }}
                </p>
              </div>

              <UAlert
                v-if="error"
                color="error"
                variant="soft"
                :title="error"
                icon="i-lucide-alert-triangle"
              />

              <UForm
                :state="state"
                class="flex flex-col gap-4"
                @submit="handleSubmit"
              >
                <UFormField
                  :label="t('auth.password')"
                  name="newPassword"
                  :help="t('auth.passwordRequirements')"
                  required
                >
                  <UInput
                    v-model="state.newPassword"
                    type="password"
                    :placeholder="t('auth.passwordPlaceholder')"
                    :disabled="loading"
                    autocomplete="new-password"
                    icon="i-lucide-lock"
                    class="w-full"
                  />
                </UFormField>

                <UFormField
                  :label="t('auth.confirmPassword')"
                  name="confirmPassword"
                  :error="
                    state.confirmPassword && !passwordsMatch
                      ? t('auth.passwordsDoNotMatch')
                      : undefined
                  "
                  required
                >
                  <UInput
                    v-model="state.confirmPassword"
                    type="password"
                    :placeholder="t('auth.confirmPasswordPlaceholder')"
                    :disabled="loading"
                    autocomplete="new-password"
                    icon="i-lucide-lock"
                    class="w-full"
                  />
                </UFormField>

                <UButton
                  type="submit"
                  block
                  :loading="loading"
                  :disabled="!isValid || loading"
                >
                  {{ t('auth.resetPasswordSubmit') }}
                </UButton>
              </UForm>
            </div>
          </template>

          <template #footer>
            <div class="text-center">
              <NuxtLink
                to="/auth/login"
                class="text-sm text-primary hover:underline"
              >
                {{ t('auth.backToLogin') }}
              </NuxtLink>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
