<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('auth.resetPasswordComingSoon')" />
    </template>

    <template #body>
      <div class="flex justify-center items-center h-full">
        <UCard class="w-full max-w-md">
          <template #default>
            <div class="space-y-6">
              <div class="text-center space-y-4">
                <UIcon
                  name="i-lucide-lock"
                  class="w-16 h-16 mx-auto text-gray-400"
                />
                <div class="space-y-2">
                  <h2
                    class="text-2xl font-semibold text-gray-900 dark:text-white"
                  >
                    {{ t('auth.resetPasswordTitle') }}
                  </h2>
                  <p class="text-gray-600 dark:text-gray-400">
                    {{ t('auth.resetPasswordDesc') }}
                  </p>
                </div>
              </div>

              <div class="space-y-3">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('auth.resetPasswordSupportText') }}
                  <a
                    href="mailto:hello@civicpress.io"
                    class="text-primary hover:underline"
                  >
                    hello@civicpress.io
                  </a>
                </p>
              </div>
            </div>
          </template>

          <!-- Footer Links -->
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
