<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('settings.notifications.title') }}
          </h1>
        </template>
        <template #description>
          {{ t('settings.notifications.sendTestEmail') }}
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb
        :items="[
          { label: t('common.home'), to: '/' },
          { label: t('settings.title'), to: '/settings' },
          { label: t('settings.notifications.title') },
        ]"
      />

      <UCard class="mt-8">
        <template #header>
          <h3 class="text-base font-medium">
            {{ t('settings.notifications.sendTestEmail') }}
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('settings.notifications.usesConfiguredProvider') }}
          </p>
        </template>

        <div class="grid gap-4 max-w-xl">
          <UFormField
            :label="t('settings.notifications.recipient')"
            name="to"
            :error="errors.to"
          >
            <UInput
              v-model="form.to"
              :placeholder="`${t('settings.notifications.recipientPlaceholder')}@${t('settings.notifications.recipientPlaceholderDomain')}`"
            />
          </UFormField>
          <UFormField
            :label="t('settings.notifications.subject')"
            name="subject"
          >
            <UInput
              v-model="form.subject"
              :placeholder="t('settings.notifications.subjectPlaceholder')"
            />
          </UFormField>
          <UFormField
            :label="t('settings.notifications.message')"
            name="message"
          >
            <UTextarea
              v-model="form.message"
              :rows="5"
              :placeholder="t('settings.notifications.messagePlaceholder')"
            />
          </UFormField>
          <div class="flex items-center gap-2">
            <USelect
              v-model="form.provider"
              :items="providerOptions"
              class="w-48"
            />
            <UButton :loading="loading" @click="sendTest">{{
              t('settings.notifications.sendTest')
            }}</UButton>
          </div>
        </div>
      </UCard>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SystemFooter from '~/components/SystemFooter.vue';
import { useAuthStore } from '~/stores/auth';
import { useNuxtApp } from '#imports';

definePageMeta({
  layout: 'default',
  middleware: ['require-users-manage'],
});

const { $civicApi } = useNuxtApp();
const authStore = useAuthStore();
const { t } = useI18n();

const form = ref({
  to: '',
  subject: 'CivicPress Test Email',
  message: 'Hello from CivicPress!',
  provider: 'auto' as string,
});
const errors = ref<{ to?: string }>({});
const loading = ref(false);
const providerOptions = computed(() => [
  { label: t('settings.notifications.auto'), value: 'auto' },
  { label: t('settings.notifications.sendgrid'), value: 'sendgrid' },
  { label: t('settings.notifications.smtp'), value: 'smtp' },
]);

async function sendTest() {
  errors.value = {};
  if (!form.value.to) {
    errors.value.to = t('settings.notifications.recipientRequired');
    return;
  }
  loading.value = true;
  try {
    const res: any = await $civicApi('/api/v1/notifications/test', {
      method: 'POST',
      body: {
        to: form.value.to,
        subject: form.value.subject,
        message: form.value.message,
        provider:
          form.value.provider === 'auto' ? undefined : form.value.provider,
      },
    });
    if (res?.success) {
      useToast().add({
        title: t('settings.notifications.testEmailSent'),
        color: 'primary',
        description: t('settings.notifications.checkInbox'),
      });
    } else {
      throw new Error(
        res?.error || t('settings.notifications.failedToSendTestEmail')
      );
    }
  } catch (e: any) {
    useToast().add({
      title: t('settings.notifications.failedToSendTestEmail'),
      description: e?.message || String(e),
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>
