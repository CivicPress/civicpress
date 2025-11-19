<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

const authStore = useAuthStore();
const { t } = useI18n();

const items = computed(
  () =>
    [
      {
        label: t('auth.usernameAndPassword'),
        description: t('auth.usernameAndPasswordDesc'),
        icon: 'i-lucide-user',
        slot: 'credentials' as const,
      },
      {
        label: t('auth.githubToken'),
        description: t('auth.githubTokenDesc'),
        icon: 'i-lucide-github',
        slot: 'token' as const,
      },
    ] satisfies TabsItem[]
);

const state = reactive({
  username: '',
  password: '',
  gitToken: '',
});

const loading = ref(false);
const error = ref('');

// Computed properties for form validation
const isCredentialsValid = computed(() => {
  return state.username.trim() !== '' && state.password.trim() !== '';
});

const isTokenValid = computed(() => {
  return state.gitToken.trim() !== '';
});

// Handle form submission
const handleCredentialsLogin = async () => {
  loading.value = true;
  error.value = '';

  try {
    await authStore.login(state.username, state.password);
    // Redirect to dashboard on success
    await navigateTo('/');
  } catch (err: any) {
    error.value = err.message || t('auth.loginFailed');
  } finally {
    loading.value = false;
  }
};

const handleTokenLogin = async () => {
  loading.value = true;
  error.value = '';

  try {
    await authStore.loginWithToken(state.gitToken);
    // Redirect to dashboard on success
    await navigateTo('/');
  } catch (err: any) {
    error.value = err.message || t('auth.loginFailed');
  } finally {
    loading.value = false;
  }
};

// Watch for auth errors
watch(
  () => authStore.authError,
  (newError) => {
    if (newError) {
      error.value = newError;
    }
  }
);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('auth.login')" />
    </template>

    <template #body>
      <div class="flex justify-center items-center h-full">
        <UCard class="w-full max-w-md">
          <template #default>
            <UTabs
              :items="items"
              variant="link"
              :ui="{ trigger: 'grow' }"
              class="gap-4 w-full min-h-80"
            >
              <template #credentials="{ item }">
                <p class="text-muted mb-4">
                  {{ item.description }}
                </p>

                <UForm
                  :state="state"
                  class="flex flex-col gap-4"
                  @submit="handleCredentialsLogin"
                >
                  <UFormField
                    :label="t('auth.username')"
                    name="username"
                    required
                  >
                    <UInput
                      v-model="state.username"
                      :placeholder="t('auth.usernamePlaceholder')"
                      :disabled="loading"
                      autocomplete="username"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    :label="t('auth.password')"
                    name="password"
                    required
                  >
                    <UInput
                      v-model="state.password"
                      type="password"
                      :placeholder="t('auth.passwordPlaceholder')"
                      :disabled="loading"
                      autocomplete="current-password"
                      class="w-full"
                    />
                  </UFormField>

                  <UButton
                    :label="t('auth.signIn')"
                    type="submit"
                    :loading="loading"
                    :disabled="!isCredentialsValid"
                    variant="soft"
                    class="self-end"
                  />
                </UForm>
              </template>

              <template #token="{ item }">
                <p class="text-muted mb-4">
                  {{ item.description }}
                </p>

                <UForm
                  :state="state"
                  class="flex flex-col gap-4"
                  @submit="handleTokenLogin"
                >
                  <UFormField
                    :label="t('auth.githubToken')"
                    name="gitToken"
                    required
                  >
                    <UInput
                      v-model="state.gitToken"
                      type="password"
                      :placeholder="t('auth.githubTokenPlaceholder')"
                      :disabled="loading"
                      autocomplete="off"
                      class="w-full"
                    />
                  </UFormField>

                  <UAlert
                    color="primary"
                    variant="soft"
                    :title="t('auth.githubTokenRequired')"
                    :description="t('auth.githubTokenRequiredDesc')"
                    icon="i-lucide-info"
                  />

                  <UButton
                    :label="t('auth.signIn')"
                    type="submit"
                    :loading="loading"
                    :disabled="!isTokenValid"
                    variant="soft"
                    class="self-end"
                  />
                </UForm>
              </template>
            </UTabs>

            <UAlert
              v-if="error"
              color="error"
              variant="soft"
              :title="error"
              icon="i-lucide-alert-circle"
            />
          </template>

          <!-- Footer Links -->
          <template #footer>
            <div class="text-center space-y-2">
              <p class="text-sm text-gray-600">
                {{ t('auth.dontHaveAccount') }}
                <NuxtLink
                  to="/auth/register"
                  class="text-primary hover:underline"
                >
                  {{ t('auth.createOne') }}
                </NuxtLink>
              </p>
              <p class="text-sm text-gray-600">
                <NuxtLink
                  to="/auth/forgot-password"
                  class="text-primary hover:underline"
                >
                  {{ t('auth.forgotPassword') }}
                </NuxtLink>
              </p>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
