<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import FileBrowserPopover from '~/components/storage/FileBrowserPopover.vue';
import RecordPreview from '~/components/RecordPreview.vue';
import LinkedRecordList from '~/components/records/LinkedRecordList.vue';
import GeographyLinkForm from '~/components/GeographyLinkForm.vue';

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
  attachedFiles?: Array<{
    id: string; // UUID reference
    path: string; // Display path
    original_name: string; // User-friendly name
    description?: string; // Optional description
    category?: string; // e.g., "reference", "supporting", "evidence"
  }>;
  linkedRecords?: Array<{
    id: string;
    type: string;
    description: string;
  }>;
  linkedGeographyFiles?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
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
const { getAttachmentTypeOptions, fetchAttachmentTypes } = useAttachmentTypes();

// Helper function to find attachment type by value
const getAttachmentTypeByValue = (value: string | undefined) => {
  if (!value) return undefined;
  const options = getAttachmentTypeOptions();
  return options.find((option) => option.value === value) || undefined;
};
const toast = useToast();

// Form data
const form = reactive({
  title: '',
  type: '' as string,
  content: '',
  status: '' as string,
  tags: [] as string[],
  description: '',
  attachedFiles: [] as Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?: string;
  }>,
  linkedRecords: [] as Array<{
    id: string;
    type: string;
    description: string;
  }>,
  linkedGeographyFiles: [] as Array<{
    id: string;
    name: string;
    description?: string;
  }>,
});

// New tag input
const newTag = ref('');

// Selected options for select menus
const selectedRecordType = ref<any>(null);
const selectedRecordStatus = ref<any>(null);
const selectedTemplate = ref<any>(null);

// Delete modal state
const showDeleteModal = ref(false);
const deleting = ref(false);

// Template modal state
const showTemplateModal = ref(false);

// File browser popover state
const showFileBrowser = ref(false);

// Watch for changes to showFileBrowser for debugging
watch(showFileBrowser, (newValue) => {
  console.log('showFileBrowser changed:', newValue);
});

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
  // Fetch record types, statuses, and attachment types
  await Promise.all([
    fetchRecordTypes(),
    fetchRecordStatuses(),
    fetchAttachmentTypes(),
  ]);

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

    // Load linked geography files if they exist
    if ((props.record as any)?.linkedGeographyFiles) {
      form.linkedGeographyFiles =
        (props.record as any).linkedGeographyFiles || [];
    }

    // Load attached files if they exist
    if ((props.record as any)?.attachedFiles) {
      form.attachedFiles = (props.record as any).attachedFiles || [];
    }

    // Load linked records if they exist
    if ((props.record as any)?.linkedRecords) {
      form.linkedRecords = (props.record as any).linkedRecords || [];
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

  return errors;
};

// Handle form submission
const handleSubmit = () => {
  hasSubmitted.value = true;

  // Clear previous errors
  Object.keys(formErrors).forEach((key) => {
    (formErrors as any)[key] = '';
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
    attachedFiles:
      form.attachedFiles.length > 0 ? form.attachedFiles : undefined,
    linkedRecords:
      form.linkedRecords.length > 0 ? form.linkedRecords : undefined,
    linkedGeographyFiles:
      form.linkedGeographyFiles.length > 0
        ? form.linkedGeographyFiles
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

// Handle file browser selection
const handleFilesSelected = (files: any[]) => {
  files.forEach((file) => {
    // Check if file is already attached
    const exists = form.attachedFiles.some(
      (existing) => existing.id === file.id
    );
    if (!exists) {
      form.attachedFiles.push({
        id: file.id,
        path: file.relative_path,
        original_name: file.original_name,
        description: '',
        category: 'reference', // Default category
      });
    }
  });

  showFileBrowser.value = false;

  toast.add({
    title: 'Files Added',
    description: `${files.length} file${files.length !== 1 ? 's' : ''} attached to record.`,
    color: 'primary',
  });
};

// Remove attached file
const removeAttachedFile = (index: number) => {
  form.attachedFiles.splice(index, 1);
};

// Update attached file category
const updateFileCategory = (
  index: number,
  category: string | { value: string }
) => {
  if (form.attachedFiles[index]) {
    const categoryValue =
      typeof category === 'string' ? category : category.value;
    form.attachedFiles[index].category = categoryValue;
  }
};

// Update attached file description
const updateFileDescription = (index: number, description: string) => {
  if (form.attachedFiles[index]) {
    form.attachedFiles[index].description = description;
  }
};

// Handle file download
const downloadFile = async (fileId: string, fileName: string) => {
  if (!process.client) return;

  try {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(
      `${config.public.civicApiUrl}/api/v1/storage/files/${fileId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get the blob data
    const blob = await response.blob();

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
    useToast().add({
      title: 'Download Failed',
      description: 'Failed to download the file. Please try again.',
      color: 'error',
    });
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

        <!-- Geography Files Section -->
        <div class="space-y-4">
          <GeographyLinkForm
            v-model="form.linkedGeographyFiles"
            :disabled="saving"
          />
        </div>

        <!-- File Attachments Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              File Attachments
            </h3>

            <UPopover>
              <UButton
                color="primary"
                variant="outline"
                size="sm"
                :disabled="saving"
                icon="i-lucide-link"
              >
                Link Files
              </UButton>

              <template #content>
                <FileBrowserPopover
                  @files-selected="handleFilesSelected"
                  @cancel="showFileBrowser = false"
                />
              </template>
            </UPopover>
          </div>

          <!-- Attached Files List -->
          <div v-if="form.attachedFiles.length > 0" class="space-y-3">
            <div
              v-for="(file, index) in form.attachedFiles"
              :key="file.id"
              class="border rounded-lg p-4 bg-white dark:bg-gray-700"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <!-- File Name and Path -->
                  <div class="flex items-center gap-2 mb-2">
                    <p
                      class="text-sm font-medium text-gray-900 dark:text-white truncate"
                    >
                      {{ file.original_name }}
                    </p>
                    <span
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      UUID
                    </span>
                  </div>

                  <!-- File Details -->
                  <div class="space-y-1">
                    <p class="text-xs text-gray-500 font-mono">
                      ID: {{ file.id }}
                    </p>
                    <p class="text-xs text-gray-500">Path: {{ file.path }}</p>
                  </div>

                  <!-- Category and Description -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <UFormField label="Category">
                      <USelectMenu
                        :model-value="getAttachmentTypeByValue(file.category)"
                        :items="getAttachmentTypeOptions()"
                        placeholder="Select category"
                        @update:model-value="
                          (value) => updateFileCategory(index, value)
                        "
                        :disabled="saving"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField label="Description">
                      <UInput
                        :model-value="file.description || ''"
                        placeholder="Optional description"
                        @update:model-value="
                          (value) => updateFileDescription(index, value)
                        "
                        :disabled="saving"
                        class="w-full"
                      />
                    </UFormField>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-1 ml-4">
                  <UButton
                    icon="i-lucide-external-link"
                    color="primary"
                    variant="ghost"
                    size="xs"
                    @click="downloadFile(file.id, file.original_name)"
                    :disabled="saving"
                    title="Download file"
                  />
                  <UButton
                    icon="i-lucide-x"
                    color="error"
                    variant="ghost"
                    size="xs"
                    @click="removeAttachedFile(index)"
                    :disabled="saving"
                    title="Remove attachment"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else
            class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center"
          >
            <UIcon
              name="i-lucide-paperclip"
              class="w-8 h-8 text-gray-400 mx-auto mb-2"
            />
            <p class="text-sm text-gray-500 dark:text-gray-400">
              No files attached to this record
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Click "Link Files" above to attach existing files from storage
            </p>
          </div>
        </div>

        <!-- Linked Records Section -->
        <div
          class="space-y-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4"
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Linked Records
            </h3>

            <UPopover>
              <UButton
                color="primary"
                variant="outline"
                size="sm"
                :disabled="saving"
              >
                Link Records
              </UButton>

              <template #content>
                <recordsRecordLinkSelector
                  v-model="form.linkedRecords"
                  :exclude-ids="props.record?.id ? [props.record.id] : []"
                  @close="() => {}"
                />
              </template>
            </UPopover>
          </div>

          <LinkedRecordList
            v-model="form.linkedRecords"
            :editable="true"
            :exclude-ids="props.record?.id ? [props.record.id] : []"
          />
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
