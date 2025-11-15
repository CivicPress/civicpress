<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ configTitle }}
          </h1>
        </template>
        <template #description>
          {{ configDescription }}
        </template>
        <template #right>
          <UButton
            @click="saveConfiguration"
            :loading="saving"
            :disabled="!hasChanges"
          >
            Save Changes
          </UButton>
          <UButton
            @click="resetToOriginal"
            variant="outline"
            :disabled="!hasChanges"
          >
            Reset
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <div class="grid gap-6 mt-8">
        <!-- Dynamic Configuration Form -->
        <UDashboardPanel>
          <template #header>
            <UDashboardNavbar>
              <template #title>
                <div class="flex items-center gap-3">
                  <UIcon
                    name="i-heroicons-cog-6-tooth"
                    class="w-6 h-6 text-primary-500"
                  />
                  <div>
                    <h3 class="text-lg font-semibold">Configuration Fields</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      Edit configuration values below
                    </p>
                  </div>
                </div>
              </template>
            </UDashboardNavbar>
          </template>

          <template #body>
            <div v-if="loading" class="flex items-center justify-center py-12">
              <div class="text-center">
                <UIcon
                  name="i-heroicons-arrow-path"
                  class="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4"
                />
                <p class="text-gray-600 dark:text-gray-400">
                  Loading configuration...
                </p>
              </div>
            </div>

            <div v-else-if="error && ready" class="text-center py-12">
              <UIcon
                name="i-heroicons-exclamation-triangle"
                class="w-12 h-12 text-red-500 mx-auto mb-4"
              />
              <h3
                class="text-lg font-semibold text-red-700 dark:text-red-300 mb-2"
              >
                Configuration Error
              </h3>
              <p class="text-gray-600 dark:text-gray-400 mb-4">{{ error }}</p>
              <UButton @click="loadConfiguration" variant="outline"
                >Retry</UButton
              >
            </div>

            <div v-else-if="configMetadata" class="space-y-8">
              <!-- Render form fields based on metadata -->
              <div v-for="(field, key) in configMetadata" :key="String(key)">
                <div v-show="String(key) !== '_metadata'">
                  <!-- Handle nested objects (like roles) -->
                  <div v-if="isNestedObject(field)" class="space-y-6">
                    <UDashboardPanel>
                      <template #header>
                        <UDashboardNavbar>
                          <template #title>
                            <div class="flex items-center gap-3">
                              <UIcon
                                name="i-heroicons-squares-2x2"
                                class="w-6 h-6 text-primary-500"
                              />
                              <div>
                                <h4 class="text-lg font-semibold">
                                  {{ formatFieldLabel(String(key)) }}
                                </h4>
                                <p
                                  class="text-sm text-gray-600 dark:text-gray-400"
                                >
                                  {{
                                    field.description ||
                                    `Manage ${formatFieldLabel(String(key)).toLowerCase()}`
                                  }}
                                </p>
                              </div>
                            </div>
                          </template>
                        </UDashboardNavbar>
                      </template>

                      <template #body>
                        <div class="space-y-6">
                          <div
                            v-for="(nestedField, nestedKey) in field"
                            :key="String(nestedKey)"
                            class="border-l-4 border-primary-200 pl-4"
                          >
                            <h5
                              class="font-medium text-gray-900 dark:text-white mb-3"
                            >
                              {{ formatFieldLabel(String(nestedKey)) }}
                            </h5>
                            <div class="space-y-4">
                              <!-- If this is a metadata field (has value), render directly -->
                              <ConfigurationField
                                v-if="isMetadataField(nestedField)"
                                :field-key="`${String(key)}.${String(nestedKey)}`"
                                :field="nestedField"
                                :value="
                                  getSecondLevelValue(
                                    String(key),
                                    String(nestedKey)
                                  )
                                "
                                @update="updateSecondLevelFieldValue"
                              />

                              <!-- Otherwise iterate sub-fields inside this group -->
                              <div
                                v-else-if="Array.isArray(nestedField)"
                                class="space-y-2"
                              >
                                <div
                                  v-for="(item, idx) in nestedField"
                                  :key="idx"
                                >
                                  <UFormField
                                    :label="`${formatFieldLabel(String(nestedKey))} ${idx + 1}`"
                                  >
                                    <UInput
                                      :model-value="
                                        getNestedValue(
                                          String(key),
                                          String(nestedKey),
                                          String(idx)
                                        )
                                      "
                                      @update:model-value="
                                        (val: any) =>
                                          updateNestedFieldValue(
                                            `${String(key)}.${String(nestedKey)}.${String(idx)}`,
                                            val
                                          )
                                      "
                                    />
                                  </UFormField>
                                </div>
                              </div>

                              <div
                                v-else
                                v-for="(subField, subKey) in nestedField"
                                :key="String(subKey)"
                                v-show="String(subKey) !== '_metadata'"
                              >
                                <ConfigurationField
                                  v-if="
                                    subField && typeof subField === 'object'
                                  "
                                  :field-key="`${String(key)}.${String(nestedKey)}.${String(subKey)}`"
                                  :field="subField"
                                  :value="
                                    getNestedValue(
                                      String(key),
                                      String(nestedKey),
                                      String(subKey)
                                    )
                                  "
                                  @update="updateNestedFieldValue"
                                />
                                <div v-else>
                                  <UFormField
                                    :label="formatFieldLabel(String(subKey))"
                                  >
                                    <UInput
                                      :model-value="
                                        getNestedValue(
                                          String(key),
                                          String(nestedKey),
                                          String(subKey)
                                        )
                                      "
                                      @update:model-value="
                                        (val: any) =>
                                          updateNestedFieldValue(
                                            `${String(key)}.${String(nestedKey)}.${String(subKey)}`,
                                            val
                                          )
                                      "
                                    />
                                  </UFormField>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </template>
                    </UDashboardPanel>
                  </div>

                  <!-- Handle flat fields -->
                  <div v-else>
                    <ConfigurationField
                      :field-key="String(key)"
                      :field="field"
                      :value="getTopLevelValue(String(key))"
                      @update="updateFieldValue"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="ready" class="text-center py-12">
              <p class="text-gray-600 dark:text-gray-400">
                No configuration metadata available
              </p>
            </div>
          </template>
        </UDashboardPanel>
      </div>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import SystemFooter from '~/components/SystemFooter.vue';
import {
  getFieldValue as normalizeValue,
  isMetadataField,
} from '~/utils/config';

definePageMeta({
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-config-manage'],
});

const authStore = useAuthStore();
const ready = computed(() => authStore.isInitialized);
const route = useRoute();

// Get configuration file from route
const configFile = computed(() => route.params.configFile as string);

// Check permission via store
const canManageConfiguration = computed(() =>
  authStore.hasPermission('config:manage')
);

// Configuration state
const loading = ref(true);
const error = ref<string | null>(null);
const configMetadata = ref<any>(null);
const originalConfig = ref<any>(null);
const config = ref<any>({});

// Computed properties
const configTitle = computed(
  () => configMetadata.value?._metadata?.name || 'Configuration'
);
const configDescription = computed(
  () =>
    configMetadata.value?._metadata?.description ||
    'Manage system configuration'
);

// Breadcrumb navigation
const breadcrumbItems = computed(() => [
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
    to: '/settings/configuration',
  },
  {
    label: configTitle.value,
  },
]);

// Form state
const saving = ref(false);
const hasChanges = ref(false);

// Load configuration
const loadConfiguration = async () => {
  loading.value = true;
  error.value = null;

  try {
    // Load configuration metadata first
    const metadataResponse = (await useNuxtApp().$civicApi(
      `/api/v1/config/metadata/${configFile.value}`
    )) as any;
    if (metadataResponse.success && metadataResponse.data) {
      configMetadata.value = metadataResponse.data;
    } else {
      throw new Error('Failed to load configuration metadata');
    }

    // Load configuration data
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/config/${configFile.value}`
    )) as any;
    if (response.success && response.data) {
      originalConfig.value = JSON.parse(JSON.stringify(response.data));
      config.value = JSON.parse(JSON.stringify(response.data));
    } else {
      throw new Error(
        response.message || `Failed to load ${configFile.value} configuration`
      );
    }
  } catch (err: any) {
    console.error(`Failed to load ${configFile.value} configuration:`, err);
    error.value = err.message || 'Failed to load configuration';
  } finally {
    loading.value = false;
  }
};

// Helper functions
const isNestedObject = (field: any) => {
  return (
    typeof field === 'object' &&
    field !== null &&
    !Array.isArray(field) &&
    (field as any).value === undefined &&
    Object.keys(field).some(
      (key) => key !== '_metadata' && typeof (field as any)[key] === 'object'
    )
  );
};

const formatFieldLabel = (key: string) => {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Normalized getters
const getTopLevelValue = (key: string) => {
  const cfg = config.value?.[key];
  if (cfg !== undefined) return normalizeValue(cfg);
  const metaField = configMetadata.value?.[key];
  return normalizeValue(metaField);
};

const getNestedValue = (
  sectionKey: string,
  nestedKey: string,
  subKey: string
) => {
  const cfg = config.value?.[sectionKey]?.[nestedKey]?.[subKey];
  if (cfg !== undefined) return normalizeValue(cfg);
  const metaField = configMetadata.value?.[sectionKey]?.[nestedKey]?.[subKey];
  return normalizeValue(metaField);
};

// Get second-level value (for fields like social.twitter where field itself is a metadata object)
const getSecondLevelValue = (sectionKey: string, nestedKey: string) => {
  const cfg = config.value?.[sectionKey]?.[nestedKey];
  if (cfg !== undefined) return normalizeValue(cfg);
  const metaField = configMetadata.value?.[sectionKey]?.[nestedKey];
  return normalizeValue(metaField);
};

// Update field value (store as scalar in config)
const updateFieldValue = (key: string, value: any) => {
  config.value[key] = value;
  hasChanges.value = true;
};

// Update nested field value
const updateNestedFieldValue = (fullKey: string, value: any) => {
  const parts = fullKey.split('.');
  if (parts.length !== 3) return;

  const [sectionKey, nestedKey, subKey] = parts;
  if (!sectionKey || !nestedKey || !subKey) return;

  // Ensure nested structure exists
  if (!config.value[sectionKey]) {
    config.value[sectionKey] = {};
  }
  if (!config.value[sectionKey][nestedKey]) {
    config.value[sectionKey][nestedKey] = {};
  }

  config.value[sectionKey][nestedKey][subKey] = value;
  hasChanges.value = true;
};

// Update second-level metadata field (e.g., social.twitter)
const updateSecondLevelFieldValue = (fullKey: string, value: any) => {
  const parts = fullKey.split('.');
  if (parts.length !== 2) return;
  const [sectionKey, nestedKey] = parts;
  if (!config.value[sectionKey]) config.value[sectionKey] = {};
  config.value[sectionKey][nestedKey] = value;
  hasChanges.value = true;
};

// Save configuration
const saveConfiguration = async () => {
  if (!canManageConfiguration.value) return;

  saving.value = true;
  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/config/${configFile.value}`,
      {
        method: 'PUT',
        body: config.value,
      }
    )) as any;

    if (response.success) {
      // Mark as saved
      hasChanges.value = false;
      originalConfig.value = JSON.parse(JSON.stringify(config.value));

      useToast().add({
        title: 'Success',
        description: `${configTitle.value} configuration saved successfully`,
        color: 'primary',
      });
    } else {
      throw new Error(response.message || 'Failed to save configuration');
    }
  } catch (err: any) {
    console.error('Failed to save configuration:', err);
    useToast().add({
      title: 'Error',
      description: `Failed to save ${configTitle.value} configuration: ${err.message}`,
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
};

// Reset to original configuration
const resetToOriginal = () => {
  if (originalConfig.value) {
    config.value = JSON.parse(JSON.stringify(originalConfig.value));
    hasChanges.value = false;
  }
};

// Load configuration on mount
onMounted(async () => {
  await loadConfiguration();
});

// Redirect if user cannot manage configuration
watch(canManageConfiguration, (canManage) => {
  if (!canManage) {
    navigateTo('/settings');
  }
});
</script>
