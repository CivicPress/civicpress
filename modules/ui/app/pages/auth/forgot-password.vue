<script setup lang="ts">
const { t } = useI18n();
const { $civicApi } = useNuxtApp();

const state = reactive({ identifier: '' });
const loading = ref(false);
const submitted = ref(false);
const error = ref('');

const isValid = computed(() => state.identifier.trim() !== '');

const handleSubmit = async () => {
  if (!isValid.value) return;
  loading.value = true;
  error.value = '';
  try {
    // The endpoint always responds the same way (anti-enumeration). We show a
    // generic confirmation regardless of whether an account matched.
    await $civicApi('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: state.identifier.trim() },
    });
    submitted.value = true;
  } catch {
    // A network/server failure is the only thing worth surfacing here; the
    // request outcome itself is deliberately opaque.
    error.value = t('auth.forgotPasswordError');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('auth.forgotPasswordTitle')" />
    </template>

    <template #body>
      <div class="flex justify-center items-center h-full">
        <UCard class="w-full max-w-md">
          <template #default>
            <!-- Confirmation state -->
            <div v-if="submitted" class="space-y-6 text-center">
              <UIcon
                name="i-lucide-mail-check"
                class="w-16 h-16 mx-auto text-primary"
              />
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">
                  {{ t('auth.forgotPasswordSentTitle') }}
                </h2>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ t('auth.forgotPasswordSent') }}
                </p>
              </div>
            </div>

            <!-- Request form -->
            <div v-else class="space-y-6">
              <div class="text-center space-y-2">
                <UIcon
                  name="i-lucide-key-round"
                  class="w-12 h-12 mx-auto text-gray-400"
                />
                <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">
                  {{ t('auth.forgotPasswordTitle') }}
                </h2>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ t('auth.forgotPasswordDesc') }}
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
                  :label="t('auth.usernameOrEmail')"
                  name="identifier"
                  required
                >
                  <UInput
                    v-model="state.identifier"
                    :placeholder="t('auth.usernameOrEmailPlaceholder')"
                    :disabled="loading"
                    autocomplete="username"
                    icon="i-lucide-user"
                    class="w-full"
                  />
                </UFormField>

                <UButton
                  type="submit"
                  block
                  :loading="loading"
                  :disabled="!isValid || loading"
                >
                  {{ t('auth.forgotPasswordSubmit') }}
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
