<template>
  <UCard>
    <template #header>
      <div class="flex items-center space-x-3">
        <UIcon name="i-lucide-map-pin" class="w-6 h-6 text-primary-600" />
        <div>
          <h2 class="text-xl font-semibold">
            {{
              mode === 'create'
                ? 'Create Geography File'
                : 'Edit Geography File'
            }}
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ descriptionText }}
          </p>
        </div>
      </div>
    </template>

    <UForm :state="form" @submit="handleSubmit" class="space-y-6">
      <!-- Basic Information -->
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
          Basic Information
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            />
          </UFormField>

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
            />
          </UFormField>
        </div>

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
          />
          <template #help>
            <p class="text-sm text-gray-600">
              Default: 4326 (WGS84). Leave empty to use default.
            </p>
          </template>
        </UFormField>
      </div>

      <!-- Geography Content -->
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
          Geography Data
        </h3>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Text Input Area -->
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
                class="font-mono text-sm"
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

          <!-- Live Preview -->
          <div class="space-y-4">
            <h4 class="text-md font-medium text-gray-900 dark:text-white">
              Live Preview
            </h4>

            <!-- Map Preview -->
            <div class="border rounded-lg h-64 bg-gray-50 dark:bg-gray-800">
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

      <!-- Submit Button -->
      <div class="flex justify-end gap-4 pt-6 border-t">
        <UButton
          color="neutral"
          variant="ghost"
          @click="handleCancel"
          :disabled="saving"
        >
          Cancel
        </UButton>
        <UButton
          type="submit"
          color="primary"
          :loading="saving"
          :disabled="!isFormValid"
        >
          {{
            mode === 'create'
              ? 'Create Geography File'
              : 'Update Geography File'
          }}
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '#imports';
import { useDebounceFn } from '@vueuse/core';
import GeographyMap from '~/components/GeographyMap.vue';
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
});

const formErrors = ref<GeographyFormErrors>({});
const saving = ref(false);
const loading = ref(false);

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

// Lifecycle
onMounted(() => {
  if (props.mode === 'edit') {
    loadGeographyFile();
  }
});
</script>
