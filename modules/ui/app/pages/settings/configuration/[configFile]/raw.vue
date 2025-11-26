<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            Edit Raw YAML - {{ configFile }}
          </h1>
        </template>
        <template #description>
          Directly edit the YAML content for this configuration file
        </template>
        <template #right>
          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="outline"
              @click="resetToDefaults"
              :loading="resetting"
              >Reset to Defaults
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              @click="validate"
              :loading="validating"
              >Validate
            </UButton>
            <UButton
              color="primary"
              @click="save"
              :loading="saving"
              :disabled="!hasChanges"
              >Save</UButton
            >
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <div class="mt-6 grid gap-4">
        <UAlert v-if="error" color="error" variant="soft">{{ error }}</UAlert>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium">YAML Content</h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Path: {{ filePath }}
                </p>
              </div>
              <UBadge :color="statusColor" variant="soft">{{
                statusLabel
              }}</UBadge>
            </div>
          </template>

          <div>
            <textarea
              class="w-full font-mono text-sm border rounded p-3 min-h-[720px] bg-white dark:bg-gray-900"
              v-model="yaml"
              spellcheck="false"
            />
          </div>
        </UCard>
      </div>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import SystemFooter from '~/components/SystemFooter.vue';

definePageMeta({
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-auth', 'require-config-manage'],
});

const route = useRoute();
const configFile = computed(() => route.params.configFile as string);

const breadcrumbItems = [
  { label: 'Home', to: '/' },
  { label: 'Settings', to: '/settings' },
  { label: 'Configuration', to: '/settings/configuration' },
  { label: 'Raw' },
];

const yaml = ref('');
const original = ref('');
const loading = ref(false);
const saving = ref(false);
const resetting = ref(false);
const validating = ref(false);
const error = ref<string | null>(null);
const validation = ref<{ valid: boolean; errors: string[] } | null>(null);

const hasChanges = computed(() => yaml.value !== original.value);

const statusLabel = computed(() =>
  hasChanges.value ? 'Unsaved changes' : 'Saved'
);
const statusColor = computed(
  () =>
    (hasChanges.value ? 'primary' : 'primary') as
      | 'primary'
      | 'error'
      | 'neutral'
);

const filePath = computed(() => {
  // Approximate path display only
  return configFile.value === 'notifications'
    ? `.system-data/${configFile.value}.yml`
    : `data/.civic/${configFile.value}.yml`;
});

const load = async () => {
  loading.value = true;
  error.value = null;
  validation.value = null;
  try {
    const res = (await useNuxtApp().$civicApi(
      `/api/v1/config/raw/${configFile.value}`
    )) as any;
    if (typeof res === 'string') {
      yaml.value = res;
      original.value = res;
    } else if (res?.success && typeof res?.data === 'string') {
      yaml.value = res.data;
      original.value = res.data;
    } else {
      throw new Error('Unexpected response');
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load raw YAML';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  if (!hasChanges.value) return;
  saving.value = true;
  error.value = null;
  try {
    await useNuxtApp().$civicApi(`/api/v1/config/raw/${configFile.value}`, {
      method: 'PUT',
      body: yaml.value,
      headers: { 'Content-Type': 'text/yaml' } as any,
    });
    original.value = yaml.value;
    useToast().add({
      title: 'Saved',
      description: 'Configuration saved',
      color: 'primary',
    });
  } catch (e: any) {
    error.value = e.message || 'Failed to save YAML';
  } finally {
    saving.value = false;
  }
};

const resetToDefaults = async () => {
  resetting.value = true;
  error.value = null;
  try {
    await useNuxtApp().$civicApi(`/api/v1/config/${configFile.value}/reset`, {
      method: 'POST',
    });
    await load();
  } catch (e: any) {
    error.value = e.message || 'Failed to reset to defaults';
  } finally {
    resetting.value = false;
  }
};

const validate = async () => {
  validating.value = true;
  error.value = null;
  validation.value = null;
  try {
    // Send current editor content for validation (validates what user is editing, not saved file)
    const res = (await useNuxtApp().$civicApi(
      `/api/v1/config/${configFile.value}/validate`,
      {
        method: 'POST',
        body: yaml.value,
        headers: { 'Content-Type': 'text/yaml' } as any,
      }
    )) as any;
    validation.value = res?.data || null;
    if (validation.value) {
      const isValid = !!validation.value.valid;
      useToast().add({
        title: isValid ? 'Configuration is valid' : 'Validation failed',
        description: isValid
          ? `${configFile.value} passed validation.`
          : Array.isArray(validation.value.errors) &&
              validation.value.errors.length
            ? String(validation.value.errors[0])
            : 'There are validation issues in the configuration.',
        color: isValid ? 'primary' : 'neutral',
      });
    } else {
      useToast().add({
        title: 'Validation error',
        description: 'Unexpected response from validation endpoint.',
        color: 'error',
      });
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to validate configuration';
    // Extract validation errors from response if available
    if (e?.data?.data?.errors && Array.isArray(e.data.data.errors)) {
      validation.value = e.data.data;
      useToast().add({
        title: 'Validation failed',
        description: e.data.data.errors[0] || error.value,
        color: 'error',
      });
    } else {
      useToast().add({
        title: 'Validation failed',
        description: error.value || 'Unknown error',
        color: 'error',
      });
    }
  } finally {
    validating.value = false;
  }
};

onMounted(load);
</script>
