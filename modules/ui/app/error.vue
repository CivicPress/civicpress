<script setup lang="ts">
import Logo from '~/components/Logo.vue';

const { t } = useI18n();

const props = defineProps<{
  error: {
    statusCode?: number;
    statusMessage?: string;
    message?: string;
  };
}>();

const route = useRoute();

// Determine error type
const is404 = computed(() => props.error?.statusCode === 404);
const is500 = computed(() => props.error?.statusCode === 500);

// Error title and message
const errorTitle = computed(() => {
  if (is404.value) return t('error.notFound.title');
  if (is500.value) return t('error.serverError.title');
  return t('error.generic.title');
});

const errorMessage = computed(() => {
  if (is404.value) return t('error.notFound.message');
  if (is500.value) return t('error.serverError.message');
  return props.error?.message || t('error.generic.message');
});

const errorCode = computed(() => props.error?.statusCode || 500);

// Actions
const goHome = () => {
  navigateTo('/');
};

const goBack = () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigateTo('/');
  }
};
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"
  >
    <div class="max-w-md w-full px-4">
      <div class="text-center">
        <!-- Logo -->
        <div class="mb-8 flex flex-col items-center justify-center gap-4">
          <!-- Logo Icon -->
          <div class="scale-[2] mb-4">
            <Logo size="lg" :show-text="false" />
          </div>
          <!-- Logo Text -->
          <div class="scale-[1.5]">
            <span
              class="font-bold tracking-wide text-gray-900 dark:text-gray-100 text-2xl"
            >
              CivicPress
            </span>
          </div>
        </div>

        <!-- Error Code -->
        <div class="mb-4">
          <h1 class="text-9xl font-bold text-gray-200 dark:text-gray-700">
            {{ errorCode }}
          </h1>
        </div>

        <!-- Error Title -->
        <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          {{ errorTitle }}
        </h2>

        <!-- Error Message -->
        <p class="text-gray-600 dark:text-gray-400 mb-8">
          {{ errorMessage }}
        </p>

        <!-- Actions -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <UButton
            color="neutral"
            variant="link"
            size="lg"
            @click="goBack"
            :icon="'i-lucide-arrow-left'"
          >
            {{ t('error.goBack') }}
          </UButton>
          <UButton
            color="neutral"
            variant="link"
            size="lg"
            @click="goHome"
            :icon="'i-lucide-home'"
          >
            {{ t('error.goHome') }}
          </UButton>
        </div>

        <!-- Additional Help for 404 -->
        <!-- <div v-if="is404" class="mt-8 text-sm text-gray-500 dark:text-gray-400">
          <p>{{ t('error.notFound.suggestions') }}</p>
          <ul class="mt-4 space-y-2 text-left max-w-xs mx-auto">
            <li class="flex items-start">
              <span class="mr-2">•</span>
              <span>{{ t('error.notFound.suggestion1') }}</span>
            </li>
            <li class="flex items-start">
              <span class="mr-2">•</span>
              <span>{{ t('error.notFound.suggestion2') }}</span>
            </li>
            <li class="flex items-start">
              <span class="mr-2">•</span>
              <span>{{ t('error.notFound.suggestion3') }}</span>
            </li>
          </ul>
        </div> -->

        <!-- Additional Help for 500 -->
        <div v-if="is500" class="mt-8 text-sm text-gray-500 dark:text-gray-400">
          <p>{{ t('error.serverError.help') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
