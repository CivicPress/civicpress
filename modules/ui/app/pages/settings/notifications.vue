<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Notifications</h1>
        </template>
        <template #description>
          Send a test email to verify configuration
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb
        :items="[
          { label: 'Settings', to: '/settings' },
          { label: 'Notifications' },
        ]"
      />

      <UCard class="mt-8">
        <template #header>
          <h3 class="text-base font-medium">Send Test Email</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Uses the configured email provider (SendGrid/SMTP)
          </p>
        </template>

        <div class="grid gap-4 max-w-xl">
          <UFormGroup label="Recipient" :error="errors.to">
            <UInput v-model="form.to" placeholder="you@example.com" />
          </UFormGroup>
          <UFormGroup label="Subject">
            <UInput
              v-model="form.subject"
              placeholder="Test email from CivicPress"
            />
          </UFormGroup>
          <UFormGroup label="Message">
            <UTextarea
              v-model="form.message"
              :rows="5"
              placeholder="Hello from CivicPress!"
            />
          </UFormGroup>
          <div class="flex items-center gap-2">
            <USelect
              v-model="form.provider"
              :items="providerOptions"
              class="w-48"
            />
            <UButton :loading="loading" @click="sendTest">Send Test</UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useNuxtApp } from '#app';

definePageMeta({
  layout: 'default',
  middleware: ['require-users-manage'],
});

const { $civicApi } = useNuxtApp();
const authStore = useAuthStore();

const form = ref({
  to: '',
  subject: 'CivicPress Test Email',
  message: 'Hello from CivicPress!',
  provider: 'auto' as string,
});
const errors = ref<{ to?: string }>({});
const loading = ref(false);
const providerOptions = ref([
  { label: 'Auto (from config)', value: 'auto' },
  { label: 'SendGrid', value: 'sendgrid' },
  { label: 'SMTP', value: 'smtp' },
]);

async function sendTest() {
  errors.value = {};
  if (!form.value.to) {
    errors.value.to = 'Recipient is required';
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
        title: 'Test email sent',
        color: 'primary',
        description: 'Check your inbox for the test email.',
      });
    } else {
      throw new Error(res?.error || 'Failed to send test email');
    }
  } catch (e: any) {
    useToast().add({
      title: 'Failed to send test email',
      description: e?.message || String(e),
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>
