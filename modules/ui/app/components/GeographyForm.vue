<template>
  <UForm :state="form" @submit="handleSubmit" class="space-y-6">
    <!-- Basic Information Card -->
    <UCard>
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Left Column -->
          <div class="space-y-4">
            <UFormField
              label="Name"
              name="name"
              :error="formErrors.name"
              required
            >
              <UInput
                v-model="form.name"
                placeholder="Enter geography file name"
                :disabled="saving"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Description"
              name="description"
              :error="formErrors.description"
              required
            >
              <UTextarea
                v-model="form.description"
                placeholder="Describe this geography data..."
                :disabled="saving"
                :rows="3"
                class="w-full"
              />
            </UFormField>
          </div>

          <!-- Right Column -->
          <div class="space-y-4">
            <UFormField
              label="Category"
              name="category"
              :error="formErrors.category"
              required
            >
              <USelectMenu
                v-model="form.category"
                :items="categoryOptions"
                placeholder="Select category"
                :disabled="saving"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Spatial Reference System ID (SRID)"
              name="srid"
              :error="formErrors.srid"
            >
              <UInput
                v-model.number="form.srid"
                type="number"
                placeholder="4326"
                :disabled="saving"
                class="w-full"
              />
              <template #help>
                <p class="text-sm text-gray-600">
                  Default: 4326 (WGS84). Leave empty to use default.
                </p>
              </template>
            </UFormField>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Geography Data Card -->
    <UCard>
      <div class="space-y-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <!-- Text Input Area (Left) -->
          <div class="space-y-4">
            <UFormField
              label="File Type"
              name="type"
              :error="formErrors.type"
              required
            >
              <USelectMenu
                v-model="form.type"
                :items="typeOptions"
                placeholder="Select file type"
                :disabled="saving"
                value-key="value"
                @change="onTypeChange"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Geography Content"
              name="content"
              :error="formErrors.content"
              required
            >
              <UTextarea
                v-model="form.content"
                placeholder="Paste your GeoJSON or KML content here..."
                :disabled="saving"
                :rows="12"
                class="font-mono text-sm w-full"
                @input="onContentChange"
              />
              <template #help>
                <p class="text-sm text-gray-600">
                  Paste your
                  {{
                    (typeof form.type === 'string'
                      ? form.type
                      : form.type?.value || 'geojson'
                    ).toUpperCase()
                  }}
                  content in the text area above. The preview will update
                  automatically as you type.
                </p>
              </template>
            </UFormField>

            <!-- Action Buttons -->
            <div class="flex gap-2">
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                @click="clearContent"
                :disabled="saving || !form.content"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
                Clear
              </UButton>
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                @click="copyToClipboard"
                :disabled="saving || !form.content"
              >
                <UIcon name="i-lucide-copy" class="w-4 h-4" />
                Copy
              </UButton>
            </div>
          </div>

          <!-- Live Preview (Right) -->
          <div class="flex flex-col space-y-4">
            <h4 class="text-md font-medium text-gray-900 dark:text-white">
              Live Preview
            </h4>

            <!-- Map Preview -->
            <div
              class="border rounded-lg flex-1 bg-gray-50 dark:bg-gray-800 min-h-[400px]"
            >
              <div
                v-if="preview.isLoading"
                class="flex items-center justify-center h-full"
              >
                <UIcon
                  name="i-lucide-loader-2"
                  class="w-6 h-6 animate-spin text-gray-400"
                />
                <span class="ml-2 text-gray-600">Parsing content...</span>
              </div>

              <div
                v-else-if="preview.error"
                class="flex items-center justify-center h-full"
              >
                <div class="text-center">
                  <UIcon
                    name="i-lucide-alert-circle"
                    class="w-8 h-8 text-red-500 mx-auto mb-2"
                  />
                  <p class="text-sm text-red-600">{{ preview.error }}</p>
                </div>
              </div>

              <div v-else-if="preview.parsed" class="h-full">
                <GeographyMap
                  :geography-data="preview.parsed.content"
                  :bounds="preview.parsed.bounds"
                  :interactive="true"
                  height="100%"
                  :color-mapping="form.color_mapping"
                  :icon-mapping="form.icon_mapping"
                />
              </div>

              <div v-else class="flex items-center justify-center h-full">
                <div class="text-center">
                  <UIcon
                    name="i-lucide-map"
                    class="w-8 h-8 text-gray-400 mx-auto mb-2"
                  />
                  <p class="text-sm text-gray-500">
                    Enter content to see preview
                  </p>
                </div>
              </div>
            </div>

            <!-- Validation Results -->
            <div v-if="preview.validation.errors.length > 0" class="space-y-2">
              <h5 class="text-sm font-medium text-red-600">
                Validation Errors:
              </h5>
              <ul class="text-sm text-red-600 space-y-1">
                <li
                  v-for="error in preview.validation.errors"
                  :key="error"
                  class="flex items-start"
                >
                  <UIcon
                    name="i-lucide-x-circle"
                    class="w-4 h-4 mt-0.5 mr-2 flex-shrink-0"
                  />
                  {{ error }}
                </li>
              </ul>
            </div>

            <div
              v-if="preview.validation.warnings.length > 0"
              class="space-y-2"
            >
              <h5 class="text-sm font-medium text-yellow-600">Warnings:</h5>
              <ul class="text-sm text-yellow-600 space-y-1">
                <li
                  v-for="warning in preview.validation.warnings"
                  :key="warning"
                  class="flex items-start"
                >
                  <UIcon
                    name="i-lucide-alert-triangle"
                    class="w-4 h-4 mt-0.5 mr-2 flex-shrink-0"
                  />
                  {{ warning }}
                </li>
              </ul>
            </div>

            <!-- Parsed Data Summary -->
            <div v-if="preview.parsed" class="space-y-2">
              <h5 class="text-sm font-medium text-gray-900 dark:text-white">
                Data Summary:
              </h5>
              <div class="text-sm text-gray-600 space-y-1">
                <div class="flex justify-between">
                  <span>Features:</span>
                  <span class="font-medium">{{
                    preview.parsed.featureCount
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Geometry Types:</span>
                  <span class="font-medium">{{
                    preview.parsed.geometryTypes.join(', ')
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span>SRID:</span>
                  <span class="font-medium">{{ preview.parsed.srid }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Bounds:</span>
                  <span class="font-medium text-xs">{{
                    formatBounds(preview.parsed.bounds)
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Color & Icon Configuration Card -->
    <UCard v-if="preview.parsed && preview.parsed.content">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold">Color & Icon Configuration</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Customize how features appear on the map
            </p>
          </div>
        </div>
      </template>
      <div class="space-y-6">
        <!-- Preset Selection -->
        <div
          class="space-y-3 border-b border-gray-200 dark:border-gray-800 pb-4"
        >
          <h4 class="text-md font-medium">Apply Preset</h4>
          <div class="flex items-center gap-3">
            <USelectMenu
              v-model="selectedPreset"
              :items="presetOptions"
              placeholder="Select a preset..."
              value-key="key"
              class="flex-1"
              @change="onPresetSelected"
            >
              <template #option="{ option }">
                <div class="flex flex-col">
                  <span class="font-medium">{{ option.name }}</span>
                  <span class="text-xs text-gray-500">{{
                    option.description
                  }}</span>
                </div>
              </template>
            </USelectMenu>
            <UButton
              v-if="selectedPreset"
              size="sm"
              color="primary"
              variant="outline"
              @click="applyPreset"
            >
              Apply
            </UButton>
          </div>
        </div>
        <!-- Color Mapping Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-md font-medium">Color Mapping</h4>
            <UButton
              v-if="form.color_mapping"
              size="xs"
              color="red"
              variant="ghost"
              @click="form.color_mapping = undefined"
            >
              Clear
            </UButton>
          </div>

          <div v-if="!form.color_mapping" class="space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Assign colors to features based on property values
            </p>
            <UButton
              size="sm"
              color="primary"
              variant="outline"
              @click="initializeColorMapping"
            >
              <UIcon name="i-lucide-palette" class="w-4 h-4" />
              Configure Colors
            </UButton>
          </div>

          <div v-else class="space-y-4">
            <UFormField label="Property Name" name="color_property">
              <UInput
                v-model="form.color_mapping.property"
                placeholder="e.g., NOM, LETTRE, type"
                @input="updateColorMapping"
              />
              <template #help>
                <p class="text-sm text-gray-600">
                  Property name from GeoJSON features to use for color mapping
                </p>
              </template>
            </UFormField>

            <div v-if="colorPropertyValues.length > 0" class="space-y-2">
              <label class="text-sm font-medium">Color Assignments</label>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  v-for="value in colorPropertyValues"
                  :key="value"
                  class="flex items-center gap-2"
                >
                  <span
                    class="text-sm text-gray-700 dark:text-gray-300 flex-1"
                    >{{ value }}</span
                  >
                  <input
                    v-model="form.color_mapping.colors[value]"
                    type="color"
                    class="w-12 h-8 rounded border border-gray-300 cursor-pointer"
                    @change="updateColorMapping"
                  />
                  <UInput
                    v-model="form.color_mapping.colors[value]"
                    type="text"
                    placeholder="#3b82f6"
                    class="w-24 text-xs"
                    @input="updateColorMapping"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Icon Mapping Section (Phase 1 - Basic) -->
        <div
          class="space-y-4 border-t border-gray-200 dark:border-gray-800 pt-4"
        >
          <div class="flex items-center justify-between">
            <h4 class="text-md font-medium">Icon Mapping</h4>
            <UButton
              v-if="form.icon_mapping"
              size="xs"
              color="red"
              variant="ghost"
              @click="form.icon_mapping = undefined"
            >
              Clear
            </UButton>
          </div>

          <div v-if="!form.icon_mapping" class="space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Assign custom icons to point features (Phase 1 - URL-based)
            </p>
            <UButton
              size="sm"
              color="primary"
              variant="outline"
              @click="initializeIconMapping"
            >
              <UIcon name="i-lucide-image" class="w-4 h-4" />
              Configure Icons
            </UButton>
          </div>

          <div v-else class="space-y-4">
            <UFormField label="Property Name" name="icon_property">
              <UInput
                v-model="form.icon_mapping.property"
                placeholder="e.g., NOM, LETTRE, type"
                @input="updateIconMapping"
              />
              <template #help>
                <p class="text-sm text-gray-600">
                  Property name from GeoJSON features to use for icon mapping
                </p>
              </template>
            </UFormField>

            <UFormField label="Apply To Geometry Types">
              <USelectMenu
                v-model="form.icon_mapping.apply_to"
                :items="geometryTypeOptions"
                multiple
                placeholder="Select geometry types"
              />
              <template #help>
                <p class="text-sm text-gray-600">
                  Which geometry types should use icons (default: Point only)
                </p>
              </template>
            </UFormField>

            <div v-if="iconPropertyValues.length > 0" class="space-y-2">
              <label class="text-sm font-medium">Icon Assignments</label>
              <div class="space-y-3">
                <div
                  v-for="value in iconPropertyValues"
                  :key="value"
                  class="flex items-center gap-2"
                >
                  <span class="text-sm text-gray-700 dark:text-gray-300 w-32">{{
                    value
                  }}</span>
                  <UInput
                    v-model="form.icon_mapping.icons[value].url"
                    type="text"
                    placeholder="https://example.com/icon.png or UUID"
                    class="flex-1 text-xs"
                    @input="updateIconMapping"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </UForm>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '#imports';
import { useDebounceFn } from '@vueuse/core';
import GeographyMap from '~/components/GeographyMap.vue';
import {
  suggestPropertyName,
  extractPropertyValues,
  assignDefaultColors,
} from '~/utils/geography-colors';
import type {
  GeographyFormData,
  GeographyFormErrors,
  GeographyPreviewData,
  ParsedGeographyData,
  GeographyValidationResult,
  GeographyFile,
} from '@civicpress/core';

// Props
interface Props {
  mode: 'create' | 'edit';
  geographyId?: string;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  success: [geographyFile: GeographyFile];
  cancel: [];
}>();

// Composables
const router = useRouter();
const toast = useToast();

// Form data
const form = ref<GeographyFormData>({
  name: '',
  type: 'geojson',
  category: 'zone',
  description: '',
  content: '',
  srid: 4326,
  color_mapping: undefined,
  icon_mapping: undefined,
});

const formErrors = ref<GeographyFormErrors>({});
const saving = ref(false);
const loading = ref(false);

// Presets
const presets = ref<
  Array<{ key: string; name: string; description: string; type: string }>
>([]);
const selectedPreset = ref<string | null>(null);
const presetOptions = computed(() => [
  { key: null, label: 'None', name: 'None', description: 'No preset' },
  ...presets.value.map((p) => ({
    key: p.key,
    label: p.name,
    name: p.name,
    description: p.description,
  })),
]);

// Preview data
const preview = ref<GeographyPreviewData>({
  parsed: null,
  validation: { valid: false, errors: [], warnings: [] },
  isLoading: false,
});

// Form options
const categoryOptions = [
  { label: 'Zone', value: 'zone' },
  { label: 'Boundary', value: 'boundary' },
  { label: 'District', value: 'district' },
  { label: 'Facility', value: 'facility' },
  { label: 'Route', value: 'route' },
];

const typeOptions = [
  { label: 'GeoJSON', value: 'geojson' },
  { label: 'KML', value: 'kml' },
  { label: 'GPX', value: 'gpx' },
  { label: 'Shapefile', value: 'shapefile' },
];

const geometryTypeOptions = [
  { label: 'Point', value: 'Point' },
  { label: 'LineString', value: 'LineString' },
  { label: 'Polygon', value: 'Polygon' },
  { label: 'MultiPoint', value: 'MultiPoint' },
  { label: 'MultiLineString', value: 'MultiLineString' },
  { label: 'MultiPolygon', value: 'MultiPolygon' },
];

// Computed properties
const descriptionText = computed(() => {
  return props.mode === 'create'
    ? 'Add new geographic data to the system'
    : 'Update existing geographic data';
});

const isFormValid = computed(() => {
  return (
    form.value.name &&
    form.value.category &&
    form.value.description &&
    form.value.content &&
    preview.value.validation.valid
  );
});

// Methods
const loadGeographyFile = async () => {
  if (props.mode !== 'edit' || !props.geographyId) return;

  try {
    loading.value = true;
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/geography/${props.geographyId}`
    )) as any;

    if (response.success) {
      const geographyFile: GeographyFile = response.data;

      // Populate form with existing data
      form.value = {
        name: geographyFile.name,
        type: geographyFile.type,
        category: geographyFile.category,
        description: geographyFile.description,
        content: geographyFile.content || '',
        srid: geographyFile.srid,
        color_mapping: geographyFile.metadata?.color_mapping,
        icon_mapping: geographyFile.metadata?.icon_mapping,
      };

      // Trigger preview update
      if (form.value.content) {
        await onContentChange();
      }
    } else {
      throw new Error(response.error || 'Failed to load geography file');
    }
  } catch (error) {
    toast.add({
      title: 'Load Failed',
      description:
        error instanceof Error
          ? error.message
          : 'Failed to load geography file',
      color: 'error',
    });
    emit('cancel');
  } finally {
    loading.value = false;
  }
};

const onTypeChange = () => {
  // Clear content when type changes
  form.value.content = '';
  preview.value.parsed = null;
  preview.value.validation = { valid: false, errors: [], warnings: [] };
};

const onContentChange = useDebounceFn(async () => {
  if (!form.value.content || !form.value.type) {
    preview.value.parsed = null;
    preview.value.validation = { valid: false, errors: [], warnings: [] };
    return;
  }

  try {
    preview.value.isLoading = true;
    preview.value.error = undefined;

    // Validate content
    const response = await useNuxtApp().$civicApi(
      '/api/v1/geography/validate',
      {
        method: 'POST',
        body: {
          content: form.value.content,
          type: form.value.type,
        },
      }
    );

    if (response.success) {
      preview.value.validation = response.data;

      // If valid, parse the content for preview
      if (response.data.valid && response.data.metadata) {
        preview.value.parsed = {
          type: form.value.type,
          content: JSON.parse(form.value.content), // Assuming GeoJSON for now
          bounds: response.data.metadata.bounds,
          srid: response.data.metadata.srid,
          featureCount: response.data.metadata.featureCount,
          geometryTypes: response.data.metadata.geometryTypes,
        };
      } else {
        preview.value.parsed = null;
      }
    } else {
      throw new Error(response.error || 'Validation failed');
    }
  } catch (error) {
    preview.value.error =
      error instanceof Error ? error.message : 'Validation failed';
    preview.value.parsed = null;
    preview.value.validation = { valid: false, errors: [], warnings: [] };
  } finally {
    preview.value.isLoading = false;
  }
}, 500);

const clearContent = () => {
  form.value.content = '';
  preview.value.parsed = null;
  preview.value.validation = { valid: false, errors: [], warnings: [] };
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(form.value.content);
    toast.add({
      title: 'Copied to Clipboard',
      description: 'Geography content has been copied to your clipboard.',
      color: 'primary',
    });
  } catch (error) {
    toast.add({
      title: 'Copy Failed',
      description: 'Failed to copy content to clipboard.',
      color: 'error',
    });
  }
};

const handleSubmit = async () => {
  try {
    saving.value = true;
    formErrors.value = {};

    // Manual validation
    if (!form.value.name || form.value.name.trim().length < 1) {
      formErrors.value.name = 'Name is required';
      return;
    }
    if (!form.value.type) {
      formErrors.value.type = 'File type is required';
      return;
    }
    if (!form.value.category) {
      formErrors.value.category = 'Category is required';
      return;
    }
    if (!form.value.description || form.value.description.trim().length < 1) {
      formErrors.value.description = 'Description is required';
      return;
    }
    if (!form.value.content || form.value.content.trim().length < 1) {
      formErrors.value.content = 'Content is required';
      return;
    }
    if (!form.value.srid || form.value.srid < 1) {
      formErrors.value.srid = 'SRID must be a positive integer';
      return;
    }

    const url =
      props.mode === 'create'
        ? '/api/v1/geography'
        : `/api/v1/geography/${props.geographyId}`;
    const method = props.mode === 'create' ? 'POST' : 'PUT';

    const response = await useNuxtApp().$civicApi(url, {
      method,
      body: {
        name: form.value.name,
        type: form.value.type,
        category: form.value.category,
        description: form.value.description,
        content: form.value.content,
        color_mapping: form.value.color_mapping,
        icon_mapping: form.value.icon_mapping,
        srid: form.value.srid,
      },
    });

    if (response.success) {
      const action = props.mode === 'create' ? 'created' : 'updated';
      toast.add({
        title: `Geography File ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        description: `"${form.value.name}" has been ${action} successfully.`,
        color: 'primary',
      });

      emit('success', response.data);
    } else {
      throw new Error(
        response.error || `Failed to ${props.mode} geography file`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('validation')) {
      // Handle validation errors
      formErrors.value = { content: error.message };
    } else {
      toast.add({
        title: `${props.mode === 'create' ? 'Creation' : 'Update'} Failed`,
        description:
          error instanceof Error
            ? error.message
            : `Failed to ${props.mode} geography file`,
        color: 'error',
      });
    }
  } finally {
    saving.value = false;
  }
};

const handleCancel = () => {
  emit('cancel');
};

const formatBounds = (bounds: any): string => {
  return `${bounds.minLon.toFixed(4)}, ${bounds.minLat.toFixed(4)} to ${bounds.maxLon.toFixed(4)}, ${bounds.maxLat.toFixed(4)}`;
};

// Expose methods and state for parent component
defineExpose({
  handleSubmit,
  handleCancel,
  isFormValid,
  saving,
  form,
});

// Lifecycle
// Color/Icon mapping helpers
const colorPropertyValues = computed(() => {
  if (!form.value.color_mapping?.property || !preview.value.parsed?.content) {
    return [];
  }
  const geoJson = preview.value.parsed.content;
  if (!geoJson.features || !Array.isArray(geoJson.features)) {
    return [];
  }
  const values = new Set<string>();
  geoJson.features.forEach((feature: any) => {
    if (
      feature.properties &&
      feature.properties[form.value.color_mapping!.property!]
    ) {
      values.add(
        String(feature.properties[form.value.color_mapping!.property!])
      );
    }
  });
  return Array.from(values).sort();
});

const iconPropertyValues = computed(() => {
  if (!form.value.icon_mapping?.property || !preview.value.parsed?.content) {
    return [];
  }
  const geoJson = preview.value.parsed.content;
  if (!geoJson.features || !Array.isArray(geoJson.features)) {
    return [];
  }
  const values = new Set<string>();
  geoJson.features.forEach((feature: any) => {
    if (
      feature.properties &&
      feature.properties[form.value.icon_mapping!.property!]
    ) {
      values.add(
        String(feature.properties[form.value.icon_mapping!.property!])
      );
    }
  });
  return Array.from(values).sort();
});

const initializeColorMapping = () => {
  if (!preview.value.parsed?.content) return;

  const geoJson = preview.value.parsed.content;
  if (!geoJson.features || !Array.isArray(geoJson.features)) return;

  // Suggest property name
  const suggestedProperty = suggestPropertyName(geoJson);
  if (!suggestedProperty) {
    toast.add({
      title: 'No Properties Found',
      description: 'No properties found in GeoJSON features',
      color: 'warning',
    });
    return;
  }

  // Extract unique values
  const values = extractPropertyValues(geoJson, suggestedProperty);
  if (values.length === 0) {
    toast.add({
      title: 'No Values Found',
      description: `No values found for property "${suggestedProperty}"`,
      color: 'warning',
    });
    return;
  }

  // Assign default colors
  const colors = assignDefaultColors(values);

  form.value.color_mapping = {
    property: suggestedProperty,
    type: 'property',
    colors,
    default_color: '#6b7280',
  };
};

const initializeIconMapping = () => {
  if (!preview.value.parsed?.content) return;

  const geoJson = preview.value.parsed.content;
  if (!geoJson.features || !Array.isArray(geoJson.features)) return;

  // Suggest property name
  const suggestedProperty = suggestPropertyName(geoJson);
  if (!suggestedProperty) {
    toast.add({
      title: 'No Properties Found',
      description: 'No properties found in GeoJSON features',
      color: 'warning',
    });
    return;
  }

  // Extract unique values
  const values = extractPropertyValues(geoJson, suggestedProperty);
  if (values.length === 0) {
    toast.add({
      title: 'No Values Found',
      description: `No values found for property "${suggestedProperty}"`,
      color: 'warning',
    });
    return;
  }

  // Initialize icons with empty URLs
  const icons: Record<string, any> = {};
  values.forEach((value) => {
    icons[value] = {
      url: '',
      size: [32, 32],
      anchor: [16, 32],
    };
  });

  form.value.icon_mapping = {
    property: suggestedProperty,
    type: 'property',
    icons,
    default_icon: 'circle',
    apply_to: ['Point'],
  };
};

const updateColorMapping = () => {
  // Trigger reactivity update
  if (form.value.color_mapping) {
    form.value.color_mapping = { ...form.value.color_mapping };
  }
};

const updateIconMapping = () => {
  // Trigger reactivity update
  if (form.value.icon_mapping) {
    form.value.icon_mapping = { ...form.value.icon_mapping };
  }
};

// Preset management
const loadPresets = async () => {
  try {
    const response = await useNuxtApp().$civicApi('/api/v1/geography/presets');
    if (response.success) {
      presets.value = response.data || [];
    }
  } catch (error) {
    console.error('Failed to load presets:', error);
  }
};

const onPresetSelected = () => {
  // Preset selection changed, but not applied yet
};

const applyPreset = async () => {
  if (!selectedPreset.value) return;

  try {
    const response = await useNuxtApp().$civicApi(
      `/api/v1/geography/presets/${selectedPreset.value}/apply`,
      {
        method: 'POST',
        body: {
          color_mapping: form.value.color_mapping,
          icon_mapping: form.value.icon_mapping,
        },
      }
    );

    if (response.success) {
      if (response.data.color_mapping) {
        form.value.color_mapping = response.data.color_mapping;
      }
      if (response.data.icon_mapping) {
        form.value.icon_mapping = response.data.icon_mapping;
      }
      toast.add({
        title: 'Preset Applied',
        description: 'Preset has been applied to your configuration',
        color: 'primary',
      });
    }
  } catch (error) {
    toast.add({
      title: 'Failed to Apply Preset',
      description: error instanceof Error ? error.message : 'Unknown error',
      color: 'error',
    });
  }
};

onMounted(async () => {
  await loadPresets();
  if (props.mode === 'edit') {
    loadGeographyFile();
  }
});
</script>
