<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';

// Types
interface RecordFormData {
  title: string;
  type: string;
  content: string;
  status: string;
  tags: string[];
  description: string;
  geography?: {
    srid?: number;
    zone_ref?: string;
    bbox?: [number, number, number, number];
    center?: { lon: number; lat: number };
    attachments?: Array<{
      id?: string; // UUID reference (preferred)
      path: string; // Display path
      role: string;
      description?: string;
    }>;
  };
  metadata: {
    tags: string[];
    description: string;
  };
}

// Props
interface Props {
  record?: CivicRecord | null;
  isEditing?: boolean;
  error?: string | null;
  saving?: boolean;
  canDelete?: boolean;
  recordType?: string | null; // Pre-select type for type-specific creation
}

const props = withDefaults(defineProps<Props>(), {
  record: null,
  isEditing: false,
  error: null,
  saving: false,
  canDelete: false,
  recordType: null,
});

// Emits
const emit = defineEmits<{
  submit: [recordData: RecordFormData];
  delete: [recordId: string];
}>();

// Composables
const { getRecordTypeOptions, getRecordTypeLabel, fetchRecordTypes } =
  useRecordTypes();
const { recordStatusOptions, getRecordStatusLabel, fetchRecordStatuses } =
  useRecordStatuses();
const { getTemplateOptions, getTemplateById, processTemplate } = useTemplates();
const toast = useToast();

// Form data
const form = reactive({
  title: '',
  type: '' as string,
  content: '',
  status: '' as string,
  tags: [] as string[],
  description: '',
  geography: {
    srid: 4326,
    zone_ref: '',
    bbox: [0, 0, 0, 0] as [number, number, number, number],
    center: { lon: 0, lat: 0 },
    attachments: [] as Array<{
      id?: string; // UUID reference
      path: string; // Display path
      role: string;
      description?: string;
    }>,
  },
});

// New tag input
const newTag = ref('');

// New attachment inputs
const newAttachment = reactive({
  file: null as File | null,
  path: '',
  role: '',
  description: '',
});

// File upload state
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// Selected options for select menus
const selectedRecordType = ref<any>(null);
const selectedRecordStatus = ref<any>(null);
const selectedTemplate = ref<any>(null);

// Delete modal state
const showDeleteModal = ref(false);
const deleting = ref(false);

// Template modal state
const showTemplateModal = ref(false);

// Form errors
const formErrors = reactive({
  title: '',
  type: '',
  content: '',
  status: '',
  tags: '',
  description: '',

  geography: {
    srid: '',
    zone_ref: '',
    bbox: '',
    center: '',
    attachments: '',
  },
});

// Track if form has been submitted to avoid showing errors on initial load
const hasSubmitted = ref(false);

// Computed properties
const isFormValid = computed(() => {
  return form.title && form.type && form.content && form.status;
});

const recordTypeOptionsComputed = computed(() => {
  return getRecordTypeOptions().map((option: any) => ({
    label: option.label,
    icon: option.icon,
    value: option.value,
    description: option.description,
  }));
});

const recordStatusOptionsComputed = computed(() => {
  return recordStatusOptions().map((option: any) => ({
    label: option.label,
    icon: option.icon,
    value: option.value,
    description: option.description,
  }));
});

const templateOptionsComputed = computed(() => {
  if (!form.type) return [];
  return getTemplateOptions(form.type);
});

// Watch for selected options changes
watch(selectedRecordType, (newValue) => {
  if (newValue) {
    form.type = newValue.value;
    // Clear template selection when type changes
    selectedTemplate.value = null;
  }
});

watch(selectedRecordStatus, (newValue) => {
  if (newValue) {
    form.status = newValue.value;
  }
});

// Initialize form
onMounted(async () => {
  // Fetch record types and statuses
  await Promise.all([fetchRecordTypes(), fetchRecordStatuses()]);

  if (props.isEditing && props.record) {
    // Populate form with existing record data
    form.title = props.record.title;
    form.type = props.record.type;
    form.status = props.record.status;
    form.tags = props.record.metadata?.tags || [];
    form.description = (props.record.metadata as any)?.description || '';

    // Extract content body from full markdown (remove YAML frontmatter)
    let contentBody = props.record.content || '';
    if (contentBody) {
      // Remove YAML frontmatter if present
      const frontmatterMatch = contentBody.match(
        /^---\s*\n([\s\S]*?)\n---\s*\n/
      );
      if (frontmatterMatch) {
        // Extract only the content after the frontmatter
        contentBody = contentBody
          .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
          .trim();
      }
    }
    form.content = contentBody;

    // Load geography data if it exists
    if (props.record?.geography) {
      const geo = props.record.geography;
      form.geography = {
        srid: geo.srid || 4326,
        zone_ref: geo.zone_ref || '',
        bbox: geo.bbox || [0, 0, 0, 0],
        center: geo.center || { lon: 0, lat: 0 },
        attachments: geo.attachments || [],
      };
    }

    // Set selected options
    const typeOption = recordTypeOptionsComputed.value.find(
      (option) => option.value === props.record?.type
    );
    if (typeOption) {
      selectedRecordType.value = typeOption;
    }

    const statusOption = recordStatusOptionsComputed.value.find(
      (option) => option.value === props.record?.status
    );
    if (statusOption) {
      selectedRecordStatus.value = statusOption;
    }
  } else if (props.recordType) {
    // Pre-select record type for type-specific creation
    form.type = props.recordType;
    const typeOption = recordTypeOptionsComputed.value.find(
      (option) => option.value === props.recordType
    );
    if (typeOption) {
      selectedRecordType.value = typeOption;
    }
  }
});

// Validation
const validateForm = () => {
  const errors: any = {};

  if (!form.title.trim()) {
    errors.title = 'Title is required';
  }

  if (!form.type) {
    errors.type = 'Record type is required';
  }

  if (!form.content.trim()) {
    errors.content = 'Content is required';
  }

  if (!form.status) {
    errors.status = 'Status is required';
  }

  // Validate geography data (only if any geography fields are filled)
  if (
    form.geography &&
    (form.geography.zone_ref?.trim() ||
      (form.geography.center &&
        (form.geography.center.lon !== 0 || form.geography.center.lat !== 0)) ||
      (form.geography.bbox &&
        !form.geography.bbox.every((coord) => coord === 0)) ||
      (form.geography.attachments && form.geography.attachments.length > 0))
  ) {
    const geoErrors: any = {};

    // Validate SRID
    if (
      form.geography.srid !== undefined &&
      !Number.isInteger(form.geography.srid)
    ) {
      geoErrors.srid = 'SRID must be an integer';
    }

    // Validate center coordinates
    if (
      form.geography.center &&
      (form.geography.center.lon !== 0 || form.geography.center.lat !== 0)
    ) {
      const { lon, lat } = form.geography.center;
      if (typeof lon !== 'number' || typeof lat !== 'number') {
        geoErrors.center = 'Center coordinates must be numbers';
      } else {
        if (lon < -180 || lon > 180) {
          geoErrors.center = 'Longitude must be between -180 and 180';
        }
        if (lat < -90 || lat > 90) {
          geoErrors.center = 'Latitude must be between -90 and 90';
        }
      }
    }

    // Validate bounding box
    if (
      form.geography.bbox &&
      !form.geography.bbox.every((coord) => coord === 0)
    ) {
      const [minLon, minLat, maxLon, maxLat] = form.geography.bbox;
      if (
        !Array.isArray(form.geography.bbox) ||
        form.geography.bbox.length !== 4
      ) {
        geoErrors.bbox = 'Bounding box must have exactly 4 coordinates';
      } else if (minLon >= maxLon || minLat >= maxLat) {
        geoErrors.bbox =
          'Invalid bounding box: min coordinates must be less than max coordinates';
      }
    }

    // Validate zone_ref
    if (form.geography.zone_ref && form.geography.zone_ref.trim() === '') {
      geoErrors.zone_ref = 'Zone reference cannot be empty if provided';
    }

    // Validate attachments
    if (form.geography.attachments && form.geography.attachments.length > 0) {
      form.geography.attachments.forEach((attachment, index) => {
        if (!attachment.path.trim()) {
          geoErrors.attachments = `Attachment ${index + 1} path is required`;
        }
        if (!attachment.role.trim()) {
          geoErrors.attachments = `Attachment ${index + 1} role is required`;
        }
      });
    }

    if (Object.keys(geoErrors).length > 0) {
      errors.geography = geoErrors;
    }
  }

  return errors;
};

// Handle form submission
const handleSubmit = () => {
  hasSubmitted.value = true;

  // Clear previous errors
  Object.keys(formErrors).forEach((key) => {
    if (key === 'geography') {
      Object.keys(formErrors.geography).forEach((geoKey) => {
        (formErrors.geography as any)[geoKey] = '';
      });
    } else {
      (formErrors as any)[key] = '';
    }
  });

  // Validate form
  const errors = validateForm();
  if (Object.keys(errors).length > 0) {
    Object.assign(formErrors, errors);
    return;
  }

  // Prepare record data
  const recordData: RecordFormData = {
    title: form.title.trim(),
    type: form.type,
    content: form.content.trim(),
    status: form.status,
    tags: form.tags,
    description: form.description.trim(),
    geography:
      form.geography.zone_ref?.trim() ||
      (form.geography.center &&
        (form.geography.center.lon !== 0 || form.geography.center.lat !== 0)) ||
      (form.geography.bbox &&
        !form.geography.bbox.every((coord) => coord === 0)) ||
      (form.geography.attachments && form.geography.attachments.length > 0)
        ? form.geography
        : undefined,
    metadata: {
      tags: form.tags,
      description: form.description.trim(),
    },
  };

  emit('submit', recordData);
};

// Handle delete confirmation
const confirmDelete = async () => {
  deleting.value = true;
  try {
    if (props.record?.id) {
      emit('delete', props.record.id);
    }
    showDeleteModal.value = false;
  } catch (error) {
    console.error('Error deleting record:', error);
    toast.add({
      title: 'Error',
      description: 'Failed to delete record',
      color: 'error',
    });
  } finally {
    deleting.value = false;
  }
};

// Add tag
const addTag = (tag: string) => {
  if (tag && !form.tags.includes(tag)) {
    form.tags.push(tag);
  }
};

// Handle tag input enter key
const handleTagEnter = () => {
  if (newTag.value.trim()) {
    addTag(newTag.value.trim());
    newTag.value = '';
  }
};

// Remove tag
const removeTag = (tag: string) => {
  const index = form.tags.indexOf(tag);
  if (index > -1) {
    form.tags.splice(index, 1);
  }
};

// Handle file selection
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    newAttachment.file = file;
    newAttachment.path = file.name; // Show filename in path field
  }
};

// Upload file to storage
const uploadFile = async (
  file: File,
  folder: string = 'public'
): Promise<{ id: string; path: string } | null> => {
  try {
    uploading.value = true;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    formData.append('description', `Geography attachment: ${file.name}`);

    const response = await $fetch('/api/v1/storage/files', {
      method: 'POST',
      body: formData,
    });

    if (response.success && response.data) {
      return {
        id: response.data.id,
        path: response.data.path, // This is the relative path for display
      };
    } else {
      throw new Error(response.error || 'Upload failed');
    }
  } catch (error) {
    console.error('File upload failed:', error);
    toast.add({
      title: 'Upload Failed',
      description:
        error instanceof Error ? error.message : 'Failed to upload file',
      color: 'red',
    });
    return null;
  } finally {
    uploading.value = false;
  }
};

// Add attachment (with file upload if file is selected)
const addAttachment = async () => {
  if (!newAttachment.role.trim()) {
    toast.add({
      title: 'Validation Error',
      description: 'Role is required for attachments',
      color: 'red',
    });
    return;
  }

  let attachmentData: {
    id?: string;
    path: string;
    role: string;
    description?: string;
  };

  // If file is selected, upload it first
  if (newAttachment.file) {
    const uploadResult = await uploadFile(newAttachment.file);
    if (!uploadResult) {
      return; // Upload failed, error already shown
    }

    attachmentData = {
      id: uploadResult.id,
      path: uploadResult.path,
      role: newAttachment.role.trim(),
      description: newAttachment.description.trim() || undefined,
    };
  } else if (newAttachment.path.trim()) {
    // Manual path entry (legacy support)
    attachmentData = {
      path: newAttachment.path.trim(),
      role: newAttachment.role.trim(),
      description: newAttachment.description.trim() || undefined,
    };
  } else {
    toast.add({
      title: 'Validation Error',
      description: 'Please select a file or enter a path',
      color: 'red',
    });
    return;
  }

  form.geography.attachments.push(attachmentData);

  // Clear form
  newAttachment.file = null;
  newAttachment.path = '';
  newAttachment.role = '';
  newAttachment.description = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

// Remove attachment
const removeAttachment = (index: number) => {
  form.geography.attachments.splice(index, 1);
};

// Methods for updating bounding box coordinates
const updateBboxMinLon = (value: number) => {
  form.geography.bbox[0] = value;
};

const updateBboxMinLat = (value: number) => {
  form.geography.bbox[1] = value;
};

const updateBboxMaxLon = (value: number) => {
  form.geography.bbox[2] = value;
};

const updateBboxMaxLat = (value: number) => {
  form.geography.bbox[3] = value;
};

// Clear geography data
const clearGeography = () => {
  form.geography = {
    srid: 4326,
    zone_ref: '',
    bbox: [0, 0, 0, 0],
    center: { lon: 0, lat: 0 },
    attachments: [],
  };
};

// Open template modal
const openTemplateModal = () => {
  if (selectedTemplate.value) {
    showTemplateModal.value = true;
  }
};

// Load template
const loadTemplate = () => {
  if (selectedTemplate.value) {
    const template = getTemplateById(selectedTemplate.value.value);
    if (template) {
      const variables = {
        title: form.title || '[Record Title]',
        user: 'Current User', // TODO: Get from auth store
        timestamp: new Date().toISOString(),
      };

      const processedContent = processTemplate(template, variables);
      form.content = processedContent;

      // Close modal
      showTemplateModal.value = false;

      // Show success message
      toast.add({
        title: 'Template Loaded',
        description: `Template "${template.name}" has been loaded successfully.`,
        color: 'primary',
      });
    }
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Form + Preview -->
    <div>
      <div class="grid grid-cols-1 gap-6">
        <!-- Title -->
        <UFormField
          label="Title"
          required
          :error="
            hasSubmitted && formErrors.title ? formErrors.title : undefined
          "
        >
          <UInput
            v-model="form.title"
            placeholder="Enter record title"
            :disabled="saving"
            class="w-full"
          />
        </UFormField>

        <!-- Record Type -->
        <UFormField
          label="Record Type"
          required
          :error="hasSubmitted && formErrors.type ? formErrors.type : undefined"
        >
          <USelectMenu
            v-model="selectedRecordType"
            :items="recordTypeOptionsComputed"
            placeholder="Select record type"
            :disabled="saving || props.recordType !== null"
            class="w-full"
          />
        </UFormField>

        <!-- Status -->
        <UFormField
          label="Status"
          required
          :error="
            hasSubmitted && formErrors.status ? formErrors.status : undefined
          "
        >
          <USelectMenu
            v-model="selectedRecordStatus"
            :items="recordStatusOptionsComputed"
            placeholder="Select status"
            :disabled="saving"
            class="w-full"
          />
        </UFormField>

        <!-- Description -->
        <UFormField
          label="Description"
          :error="
            hasSubmitted && formErrors.description
              ? formErrors.description
              : undefined
          "
        >
          <UTextarea
            v-model="form.description"
            placeholder="Enter record description (optional)"
            :disabled="saving"
            :rows="3"
            class="w-full"
          />
        </UFormField>

        <!-- Tags -->
        <UFormField
          label="Tags"
          :error="hasSubmitted && formErrors.tags ? formErrors.tags : undefined"
        >
          <UInput
            v-model="newTag"
            placeholder="Add a tag and press Enter"
            :disabled="saving"
            @keyup.enter="handleTagEnter"
            class="w-full"
          />
          <div v-if="form.tags.length > 0" class="flex flex-wrap gap-2 mt-2">
            <UBadge
              v-for="tag in form.tags"
              :key="tag"
              color="primary"
              variant="soft"
              size="sm"
            >
              {{ tag }}
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="removeTag(tag)"
              />
            </UBadge>
          </div>
        </UFormField>

        <!-- Geography Section -->
        <div class="">
          <div class="">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Geography
            </h3>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              @click="clearGeography"
              :disabled="saving"
            >
              Clear
            </UButton>
          </div>

          <!-- SRID -->
          <UFormField
            label="Spatial Reference System ID (SRID)"
            :error="
              hasSubmitted && formErrors.geography?.srid
                ? formErrors.geography.srid
                : undefined
            "
          >
            <UInput
              v-model.number="form.geography.srid"
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

          <!-- Zone Reference -->
          <UFormField
            label="Zone Reference"
            :error="
              hasSubmitted && formErrors.geography?.zone_ref
                ? formErrors.geography.zone_ref
                : undefined
            "
          >
            <UInput
              v-model="form.geography.zone_ref"
              placeholder="e.g., city-limits, district-1, ward-a"
              :disabled="saving"
              class="w-full"
            />
            <template #help>
              <p class="text-sm text-gray-600">
                Administrative boundary or zone identifier.
              </p>
            </template>
          </UFormField>

          <!-- Center Coordinates -->
          <div class="space-y-2">
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Center Coordinates
            </label>
            <div class="grid grid-cols-2 gap-2">
              <UFormField
                label="Longitude"
                :error="
                  hasSubmitted && formErrors.geography?.center
                    ? formErrors.geography.center
                    : undefined
                "
              >
                <UInput
                  v-model.number="form.geography.center.lon"
                  type="number"
                  step="0.000001"
                  placeholder="-73.5673"
                  :disabled="saving"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Latitude"
                :error="
                  hasSubmitted && formErrors.geography?.center
                    ? formErrors.geography.center
                    : undefined
                "
              >
                <UInput
                  v-model.number="form.geography.center.lat"
                  type="number"
                  step="0.000001"
                  placeholder="45.5017"
                  :disabled="saving"
                  class="w-full"
                />
              </UFormField>
            </div>
            <div>
              <p class="text-sm text-gray-600">
                Center point coordinates (longitude: -180 to 180, latitude: -90
                to 90).
              </p>
            </div>
          </div>

          <!-- Bounding Box -->
          <div class="space-y-2">
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Bounding Box
            </label>
            <div class="grid grid-cols-2 gap-2">
              <UFormField
                label="Min Longitude"
                :error="
                  hasSubmitted && formErrors.geography?.bbox
                    ? formErrors.geography.bbox
                    : undefined
                "
              >
                <UInput
                  :model-value="form.geography.bbox[0]"
                  type="number"
                  step="0.000001"
                  placeholder="-73.6000"
                  :disabled="saving"
                  class="w-full"
                  @update:model-value="updateBboxMinLon"
                />
              </UFormField>
              <UFormField
                label="Min Latitude"
                :error="
                  hasSubmitted && formErrors.geography?.bbox
                    ? formErrors.geography.bbox
                    : undefined
                "
              >
                <UInput
                  :model-value="form.geography.bbox[1]"
                  type="number"
                  step="0.000001"
                  placeholder="45.4800"
                  :disabled="saving"
                  class="w-full"
                  @update:model-value="updateBboxMinLat"
                />
              </UFormField>
              <UFormField
                label="Max Longitude"
                :error="
                  hasSubmitted && formErrors.geography?.bbox
                    ? formErrors.geography.bbox
                    : undefined
                "
              >
                <UInput
                  :model-value="form.geography.bbox[2]"
                  type="number"
                  step="0.000001"
                  placeholder="-73.5300"
                  :disabled="saving"
                  class="w-full"
                  @update:model-value="updateBboxMaxLon"
                />
              </UFormField>
              <UFormField
                label="Max Latitude"
                :error="
                  hasSubmitted && formErrors.geography?.bbox
                    ? formErrors.geography.bbox
                    : undefined
                "
              >
                <UInput
                  :model-value="form.geography.bbox[3]"
                  type="number"
                  step="0.000001"
                  placeholder="45.5200"
                  :disabled="saving"
                  class="w-full"
                  @update:model-value="updateBboxMaxLat"
                />
              </UFormField>
            </div>
            <div>
              <p class="text-sm text-gray-600">
                Bounding box coordinates [minLon, minLat, maxLon, maxLat].
              </p>
            </div>
          </div>

          <!-- Attachments -->
          <div class="space-y-3">
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Attachments
            </label>

            <!-- Add new attachment -->
            <div
              class="space-y-3 p-4 border rounded-lg bg-white dark:bg-gray-700"
            >
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                Add Geography File
              </h4>

              <!-- File Upload Option -->
              <div class="space-y-2">
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Upload File
                </label>
                <input
                  ref="fileInput"
                  type="file"
                  @change="handleFileSelect"
                  :disabled="saving || uploading"
                  accept=".geojson,.kml,.gpx,.json,.csv,.pdf,.jpg,.jpeg,.png,.gif"
                  class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300"
                />
                <p class="text-xs text-gray-500">
                  Supports geographic files (.geojson, .kml, .gpx), images, and
                  documents
                </p>
              </div>

              <!-- OR separator -->
              <div class="flex items-center">
                <div class="flex-1 border-t border-gray-300"></div>
                <span
                  class="px-3 text-xs text-gray-500 bg-white dark:bg-gray-700"
                  >OR</span
                >
                <div class="flex-1 border-t border-gray-300"></div>
              </div>

              <!-- Manual Path Entry -->
              <div class="space-y-2">
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Manual Path Entry
                </label>
                <UInput
                  v-model="newAttachment.path"
                  placeholder="File path or URL"
                  :disabled="saving || uploading || !!newAttachment.file"
                  class="w-full"
                />
              </div>

              <!-- Role and Description -->
              <div class="grid grid-cols-1 gap-2">
                <UInput
                  v-model="newAttachment.role"
                  placeholder="Role (e.g., map, data, context, document)"
                  :disabled="saving || uploading"
                  class="w-full"
                />
                <UInput
                  v-model="newAttachment.description"
                  placeholder="Description (optional)"
                  :disabled="saving || uploading"
                  class="w-full"
                />
              </div>

              <UButton
                color="primary"
                variant="outline"
                size="sm"
                @click="addAttachment"
                :disabled="
                  saving ||
                  uploading ||
                  !newAttachment.role.trim() ||
                  (!newAttachment.file && !newAttachment.path.trim())
                "
                :loading="uploading"
                class="w-full"
              >
                {{ uploading ? 'Uploading...' : 'Add Attachment' }}
              </UButton>
            </div>

            <!-- Existing attachments -->
            <div v-if="form.geography.attachments.length > 0" class="space-y-2">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                Attached Files
              </h4>
              <div
                v-for="(attachment, index) in form.geography.attachments"
                :key="index"
                class="flex items-center justify-between p-3 border rounded-lg bg-white dark:bg-gray-700"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p
                      class="text-sm font-medium text-gray-900 dark:text-white truncate"
                    >
                      {{ attachment.path }}
                    </p>
                    <span
                      v-if="attachment.id"
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    >
                      UUID
                    </span>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Role: {{ attachment.role }}
                    <span v-if="attachment.description">
                      - {{ attachment.description }}
                    </span>
                  </p>
                  <p
                    v-if="attachment.id"
                    class="text-xs text-gray-400 font-mono"
                  >
                    ID: {{ attachment.id }}
                  </p>
                </div>
                <div class="flex items-center gap-1">
                  <UButton
                    v-if="attachment.id"
                    icon="i-lucide-external-link"
                    color="blue"
                    variant="ghost"
                    size="xs"
                    @click="
                      () =>
                        window.open(
                          `/api/v1/storage/files/${attachment.id}`,
                          '_blank'
                        )
                    "
                    :disabled="saving"
                    title="Download file"
                  />
                  <UButton
                    icon="i-lucide-x"
                    color="red"
                    variant="ghost"
                    size="xs"
                    @click="removeAttachment(index)"
                    :disabled="saving"
                    title="Remove attachment"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Template Loading -->
        <div class="my-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">
            Templates
          </h3>
          <div v-if="form.type" class="space-y-2">
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Available Templates
            </label>
            <div class="flex items-center gap-2">
              <UButton
                color="primary"
                variant="outline"
                size="sm"
                @click="openTemplateModal"
                :disabled="
                  saving || !selectedTemplate || !templateOptionsComputed.length
                "
              >
                Load Template
              </UButton>
              <USelectMenu
                v-model="selectedTemplate"
                :items="templateOptionsComputed"
                placeholder="Select a template"
                :disabled="saving"
                class="flex-1"
              />
            </div>
            <p class="text-sm text-gray-600">
              Choose a template and click "Load Template" to populate the
              content field.
            </p>
          </div>
          <div v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
            Select a record type above to see available templates.
          </div>
        </div>
      </div>
      <div class="my-4 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <!-- Content -->
        <div class="space-y-2">
          <UCard class="h-full flex flex-col">
            <template #header>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Content</span>
              </div>
            </template>
            <div class="-m-6">
              <UFormField
                required
                :error="
                  hasSubmitted && formErrors.content
                    ? formErrors.content
                    : undefined
                "
                class="extended-textarea"
              >
                <UTextarea
                  v-model="form.content"
                  placeholder="Enter the record content"
                  :disabled="saving"
                  class="font-mono w-full border-none h-full"
                  variant="none"
                />
              </UFormField>
            </div>
          </UCard>
        </div>

        <!-- Preview Pane (right column on lg+) -->
        <div class="">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Preview</span>
              </div>
            </template>
            <div class="p-2">
              <RecordPreview :content="form.content" :wrap="true" />
            </div>
          </UCard>
        </div>
      </div>
    </div>

    <!-- Form Actions -->
    <div class="flex items-center justify-between pt-6 border-t">
      <!-- Delete Button (only for editing) -->
      <UModal
        v-if="isEditing && canDelete"
        title="Delete Record"
        description="Are you sure you want to delete this record? This action cannot be undone."
      >
        <UButton
          color="error"
          variant="outline"
          :disabled="saving"
          @click="showDeleteModal = true"
        >
          Delete Record
        </UButton>

        <template #body>
          <div class="space-y-4">
            <p class="text-gray-700 dark:text-gray-300">
              Are you sure you want to delete
              <strong>{{ record?.title }}</strong
              >? This will permanently remove this record and all associated
              data.
            </p>

            <div
              class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
            >
              <div class="flex items-start space-x-3">
                <UIcon
                  name="i-lucide-alert-circle"
                  class="w-5 h-5 text-red-600 mt-0.5"
                />
                <div class="text-sm text-red-700 dark:text-red-300">
                  <p class="font-medium">Warning:</p>
                  <ul class="mt-1 space-y-1">
                    <li>• Record will be permanently deleted</li>
                    <li>• All associated data will be lost</li>
                    <li>• This action cannot be reversed</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #footer="{ close }">
          <div class="flex justify-end space-x-3">
            <UButton color="neutral" variant="outline" @click="close">
              Cancel
            </UButton>
            <UButton color="error" :loading="deleting" @click="confirmDelete">
              Delete Record
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Template Confirmation Modal -->
      <UModal
        v-model:open="showTemplateModal"
        title="Load Template"
        description="Are you sure you want to load this template? This will replace your current content."
      >
        <template #body>
          <div class="space-y-4">
            <div
              class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
            >
              <div class="flex items-start space-x-3">
                <UIcon
                  name="i-lucide-info"
                  class="w-5 h-5 text-blue-600 mt-0.5"
                />
                <div class="text-sm text-blue-700 dark:text-blue-300">
                  <p class="font-medium">Template Details:</p>
                  <ul class="mt-1 space-y-1">
                    <li>
                      • <strong>Name:</strong> {{ selectedTemplate?.label }}
                    </li>
                    <li>• <strong>Type:</strong> {{ form.type }}</li>
                    <li v-if="selectedTemplate?.description">
                      • <strong>Description:</strong>
                      {{ selectedTemplate.description }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div
              class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
            >
              <div class="flex items-start space-x-3">
                <UIcon
                  name="i-lucide-alert-triangle"
                  class="w-5 h-5 text-yellow-600 mt-0.5"
                />
                <div class="text-sm text-yellow-700 dark:text-yellow-300">
                  <p class="font-medium">Warning:</p>
                  <ul class="mt-1 space-y-1">
                    <li>• Current content will be completely replaced</li>
                    <li>
                      • Template variables will be filled with current form data
                    </li>
                    <li>• This action cannot be undone</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #footer="{ close }">
          <div class="flex justify-end space-x-3">
            <UButton color="neutral" variant="outline" @click="close">
              Cancel
            </UButton>
            <UButton color="primary" :loading="saving" @click="loadTemplate">
              Load Template
            </UButton>
          </div>
        </template>
      </UModal>

      <div class="flex items-center space-x-4">
        <UButton
          type="submit"
          color="primary"
          :loading="saving"
          :disabled="!isFormValid"
          @click="handleSubmit"
        >
          {{ isEditing ? 'Update Record' : 'Create Record' }}
        </UButton>

        <UButton
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="$router.back()"
        >
          Cancel
        </UButton>
      </div>
    </div>

    <!-- Error Display -->
    <!-- <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-alert-circle" /> -->
  </div>
</template>

<style>
.extended-textarea > div:nth-child(2) {
  min-height: 100vh;
}

.extended-textarea > div:nth-child(2) textarea {
  min-height: 100vh;
}
</style>
