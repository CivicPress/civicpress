<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Configurations</h1>
        </template>
        <template #description>
          Manage system settings, roles, workflows, and organization
          configuration
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <!-- Available Configurations Section -->
      <div class="grid gap-6 mt-8">
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Available Configurations</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Loaded dynamically from the configuration service
            </p>
          </template>

          <div
            v-if="!ready || loading"
            class="py-8 text-center text-sm text-gray-600 dark:text-gray-400"
          >
            Loading configurations…
          </div>
          <div
            v-else-if="error"
            class="py-8 text-center text-sm text-red-600 dark:text-red-400"
          >
            {{ error }}
          </div>
          <div v-else class="grid gap-4">
            <UCard
              v-for="cfg in configurations"
              :key="cfg.file"
              class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="font-medium">{{ cfg.name }}</h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      {{ cfg.description }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <UButton
                      :to="`/settings/configuration/${cfg.file}/edit`"
                      size="sm"
                      >Edit
                    </UButton>
                    <UButton
                      :to="`/settings/configuration/${cfg.file}/raw`"
                      variant="outline"
                      size="sm"
                      >Edit Raw
                    </UButton>
                  </div>
                </div>
              </template>
            </UCard>
          </div>
        </UCard>

        <!-- Configuration Status Section -->
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Configuration Status</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              System health and configuration validation
            </p>
          </template>

          <div class="grid gap-4">
            <!-- Configuration Validation -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="font-medium">Configuration Validation</h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      Check for configuration errors and warnings
                    </p>
                  </div>
                  <UButton
                    @click="validateConfiguration"
                    variant="outline"
                    size="sm"
                    :loading="validating"
                  >
                    Validate Configuration
                  </UButton>
                </div>
              </template>
              <div v-if="validationResults" class="space-y-3">
                <div
                  v-for="(result, index) in validationResults"
                  :key="index"
                  class="flex items-start gap-3 p-3 rounded-lg"
                  :class="{
                    'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200':
                      result.status === 'success',
                    'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200':
                      result.status === 'warning',
                    'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200':
                      result.status === 'error',
                  }"
                >
                  <UIcon
                    :name="getStatusIcon(result.status)"
                    class="w-5 h-5 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p class="font-medium">{{ result.title }}</p>
                    <p class="text-sm opacity-80">{{ result.message }}</p>
                  </div>
                </div>
              </div>
              <div v-else class="text-sm text-gray-600 dark:text-gray-400">
                <p>
                  Click "Validate Configuration" to check for any configuration
                  issues.
                </p>
              </div>
            </UCard>

            <!-- Configuration Backup -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="font-medium">Configuration Backup</h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      Export and import configuration files
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <UButton
                      @click="exportConfiguration"
                      variant="outline"
                      size="sm"
                    >
                      Export All
                    </UButton>
                    <UButton
                      @click="importConfiguration"
                      variant="outline"
                      size="sm"
                    >
                      Import
                    </UButton>
                  </div>
                </div>
              </template>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                <p>
                  Export current configuration for backup or import
                  configuration from another instance.
                </p>
              </div>
            </UCard>
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
import { extractErrorMessage, type ApiResponse } from '~/utils/api-response';
definePageMeta({
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-auth', 'require-config-manage'],
});

const authStore = useAuthStore();
const ready = computed(() => authStore.isInitialized);

// Permission check via store
const canManageConfiguration = computed(() =>
  authStore.hasPermission('config:manage')
);

// Breadcrumb navigation
const breadcrumbItems = [
  {
    label: 'Home',
    to: '/',
  },
  {
    label: 'Settings',
    to: '/settings',
  },
  {
    label: 'Configuration',
  },
];

// Dynamic configuration list
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configurations = ref<any[]>([]);
const loading = ref(false);
const error = ref('');

const fetchConfigurations = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = (await useNuxtApp().$civicApi(
      '/api/v1/config/list'
    )) as ApiResponse<unknown[]>;
    if (response.success) {
      configurations.value = response.data || [];
    } else {
      error.value =
        extractErrorMessage(response) || 'Failed to load configurations';
    }
  } catch (err: unknown) {
    error.value =
      (err instanceof Error ? err.message : '') ||
      'Failed to load configurations';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchConfigurations();
});

// Configuration validation
const validating = ref(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validationResults = ref<any[]>([]);

const validateConfiguration = async () => {
  if (!canManageConfiguration.value) return;

  validating.value = true;
  try {
    const response = (await useNuxtApp().$civicApi(
      '/api/v1/config/validate/all'
    )) as ApiResponse;

    if (response.success && response.data) {
      // response.data is an object keyed by type → { valid, errors[] }
      const entries = Object.entries(response.data || {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = entries.map(([type, result]: any) => ({
        status: result?.valid ? 'success' : 'error',
        title: `${type}`,
        message: result?.valid
          ? 'Valid'
          : Array.isArray(result?.errors) && result.errors.length
            ? result.errors[0]
            : 'Invalid configuration',
      }));
      validationResults.value = items;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allValid = items.every((i: any) => i.status === 'success');
      useToast().add({
        title: allValid ? 'All configurations valid' : 'Validation completed',
        description: allValid
          ? 'No issues found across all configuration files.'
          : 'Some configurations have issues. See details below.',
        color: allValid ? 'primary' : 'neutral',
      });
    } else {
      validationResults.value = [
        {
          status: 'warning',
          title: 'Configuration Validation',
          message: 'Validation endpoint returned an unexpected response.',
        },
      ];
      useToast().add({
        title: 'Validation error',
        description: 'Unexpected response from validation endpoint.',
        color: 'error',
      });
    }
  } catch (error) {
    console.error('Configuration validation failed:', error);
    // Show basic status if API call fails
    validationResults.value = [
      {
        status: 'warning',
        title: 'Configuration Validation',
        message:
          'Unable to validate configuration files. API endpoint may not be available yet.',
      },
    ];
    useToast().add({
      title: 'Validation failed',
      description: 'Unable to validate configurations. Check server logs.',
      color: 'error',
    });
  } finally {
    validating.value = false;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return 'i-heroicons-check-circle';
    case 'warning':
      return 'i-heroicons-exclamation-triangle';
    case 'error':
      return 'i-heroicons-x-circle';
    default:
      return 'i-heroicons-information-circle';
  }
};

type ConfigBundle = {
  civicpress_config_export?: string;
  exported_at?: string;
  files: Record<string, string>;
};

const exportConfiguration = async () => {
  if (!canManageConfiguration.value) return;

  try {
    const response = (await useNuxtApp().$civicApi(
      '/api/v1/config/export'
    )) as ApiResponse<ConfigBundle>;

    if (!response.success || !response.data) {
      throw new Error(
        extractErrorMessage(response) || 'Configuration export failed'
      );
    }

    // Download the bundle as a JSON file client-side.
    const blob = new Blob([JSON.stringify(response.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'civicpress-config.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    useToast().add({
      title: 'Configuration exported',
      description: `Exported ${Object.keys(response.data.files).length} configuration files.`,
      color: 'primary',
    });
  } catch (err: unknown) {
    console.error('Configuration export failed:', err);
    useToast().add({
      title: 'Export failed',
      description:
        (err instanceof Error ? err.message : '') ||
        'Could not export configuration.',
      color: 'error',
    });
  }
};

// Apply a parsed bundle: POST it, summarize the per-file result, refresh the
// list. Split out from the file-picker below so it is unit-testable.
const applyConfigBundle = async (files: Record<string, string>) => {
  try {
    const response = (await useNuxtApp().$civicApi('/api/v1/config/import', {
      method: 'POST',
      body: { files },
    })) as ApiResponse<{
      applied: number;
      skipped: number;
      failed: number;
      results: Array<{ type: string; status: string; message?: string }>;
    }>;

    if (!response.success || !response.data) {
      throw new Error(
        extractErrorMessage(response) || 'Configuration import failed'
      );
    }

    const { applied, skipped, failed } = response.data;
    useToast().add({
      title: 'Configuration imported',
      description: `Applied ${applied}, skipped ${skipped}, failed ${failed}.`,
      color: failed > 0 ? 'warning' : 'primary',
    });
    await fetchConfigurations();
  } catch (err: unknown) {
    console.error('Configuration import failed:', err);
    useToast().add({
      title: 'Import failed',
      description:
        (err instanceof Error ? err.message : '') ||
        'Could not import configuration.',
      color: 'error',
    });
  }
};

const importConfiguration = async () => {
  if (!canManageConfiguration.value) return;

  // Pick a bundle file, parse it, then hand off to applyConfigBundle.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    let files: Record<string, string> | undefined;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ConfigBundle> & {
        data?: Partial<ConfigBundle>;
      };
      // Accept a raw { files } bundle or the export envelope's `data`.
      files = parsed?.files ?? parsed?.data?.files;
      if (!files || typeof files !== 'object') {
        throw new Error('Not a CivicPress configuration bundle');
      }
    } catch (err: unknown) {
      console.error('Configuration import failed:', err);
      useToast().add({
        title: 'Import failed',
        description:
          (err instanceof Error ? err.message : '') ||
          'That file is not a CivicPress configuration bundle.',
        color: 'error',
      });
      return;
    }

    await applyConfigBundle(files);
  };
  input.click();
};

// Redirect handled in initial onMounted
</script>
