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

// Form errors
const formErrors = reactive({
  title: '',
  type: '',
  content: '',
  status: '',
  tags: '',
  description: '',
  template: '',
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

watch(selectedTemplate, (newValue) => {
  if (newValue && !props.isEditing) {
    // Apply template content
    const template = getTemplateById(newValue.value);
    if (template) {
      const variables = {
        title: form.title || '[Record Title]',
        user: 'Current User', // TODO: Get from auth store
        timestamp: new Date().toISOString(),
      };

      const processedContent = processTemplate(template, variables);
      form.content = processedContent;
    }
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
    formErrors[key as keyof typeof formErrors] = '';
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

// Remove tag
const removeTag = (tag: string) => {
  const index = form.tags.indexOf(tag);
  if (index > -1) {
    form.tags.splice(index, 1);
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Form + Preview -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
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

        <!-- Template Selection (only for new records) -->
        <UFormField
          v-if="!props.isEditing && form.type"
          label="Template"
          :error="
            hasSubmitted && formErrors.template
              ? formErrors.template
              : undefined
          "
        >
          <USelectMenu
            v-model="selectedTemplate"
            :items="templateOptionsComputed"
            placeholder="Select a template (optional)"
            :disabled="saving"
            class="w-full"
          />
          <template #help>
            <p class="text-sm text-gray-600">
              Choose a template to pre-populate the record content. You can
              modify the content after selection.
            </p>
          </template>
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
          <div class="space-y-2 w-full">
            <UInput
              v-model="newTag"
              placeholder="Add a tag and press Enter"
              :disabled="saving"
              @keyup.enter="
                addTag(newTag);
                newTag = '';
              "
              class="w-full"
            />
            <div v-if="form.tags.length > 0" class="flex flex-wrap gap-2">
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
          </div>
        </UFormField>

        <!-- Content -->
        <div class="space-y-2">
          <UFormField
            label="Content"
            required
            :error="
              hasSubmitted && formErrors.content
                ? formErrors.content
                : undefined
            "
          >
            <UTextarea
              v-model="form.content"
              placeholder="Enter the record content"
              :disabled="saving"
              :rows="18"
              class="font-mono w-full"
            />
          </UFormField>
        </div>
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
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="error"
      icon="i-lucide-alert-circle"
    />
  </div>
</template>
