<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import EditorHeader from './editor/EditorHeader.vue';
import MarkdownEditor from './editor/MarkdownEditor.vue';
import EditorToolbar from './editor/EditorToolbar.vue';
import PreviewPanel from './editor/PreviewPanel.vue';
import RecordSidebar from './editor/RecordSidebar.vue';
import { useAutosave } from '~/composables/useAutosave';
import { useRecordLock } from '~/composables/useRecordLock';

// Types
interface RecordFormData {
  title: string;
  type: string;
  markdownBody: string;
  status: string;
  tags: string[];
  description: string;
  geography?: any;
  attachedFiles?: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?: string;
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
  recordType?: string | null;
  hideBasicFields?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  record: null,
  isEditing: false,
  error: null,
  saving: false,
  canDelete: false,
  recordType: null,
  hideBasicFields: false,
});

// Emits
const emit = defineEmits<{
  submit: [recordData: RecordFormData];
  delete: [recordId: string];
  saved: [recordData: any];
}>();

// Composables
const { t } = useI18n();
const { getRecordTypeOptions, getRecordTypeLabel, fetchRecordTypes } =
  useRecordTypes();
const { recordStatusOptions, getRecordStatusLabel, fetchRecordStatuses } =
  useRecordStatuses();
const { getTemplateOptions, getTemplateById, processTemplate } = useTemplates();
const toast = useToast();
const $civicApi = useNuxtApp().$civicApi;
const authStore = useAuthStore();

// Form data
const form = reactive({
  id: '',
  title: '',
  type: '',
  markdownBody: '',
  status: 'draft',
  tags: [] as string[],
  description: '',
  geography: undefined as any,
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
  metadata: {
    tags: [] as string[],
    description: '',
  },
});

// UI State
const showPreview = ref(
  process.client
    ? localStorage.getItem('editor-preview-visible') === 'true'
    : false
);
const previewWidth = ref(
  process.client
    ? parseInt(localStorage.getItem('editor-preview-width') || '50', 10)
    : 50
);
const isResizing = ref(false);
const allowedTransitions = ref<string[]>([]);
const isDraft = ref(false);
const showSidebar = ref(false);

// Responsive state
const windowWidth = ref(process.client ? window.innerWidth : 1920);
const isMobile = computed(() => windowWidth.value <= 768);

// Watch window resize
if (process.client) {
  const updateWidth = () => {
    windowWidth.value = window.innerWidth;
  };
  window.addEventListener('resize', updateWidth);
  onUnmounted(() => {
    window.removeEventListener('resize', updateWidth);
  });
}

// Autosave state
const autosaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const lastSaved = ref<Date | null>(null);

// Lock state
const lockInfo = ref<any>(null);
const isLocked = computed(() => lockInfo.value?.locked || false);
const lockedBy = computed(() => lockInfo.value?.lockedBy || null);

// Record metadata for YAML display
const recordAuthor = ref<string>('');
const recordCreatedAt = ref<string>('');
const recordUpdatedAt = ref<string>('');

// Initialize lock (only in edit mode) - moved to after form.id is set
let lockComposable: ReturnType<typeof useRecordLock> | null = null;
const initializeLock = () => {
  if (props.isEditing && form.id) {
    lockComposable = useRecordLock({
      recordId: form.id,
      onLockAcquired: () => {
        console.log('Lock acquired');
      },
      onLockLost: () => {
        toast.add({
          title: 'Lock lost',
          description: 'Another user has taken control of this record',
          color: 'error',
        });
      },
      onLockError: (error) => {
        if (error.message.includes('locked by')) {
          toast.add({
            title: 'Record locked',
            description: error.message,
            color: 'neutral',
          });
        }
      },
    });
    watch(
      () => lockComposable?.lockInfo,
      (newLockInfo) => {
        if (newLockInfo) {
          lockInfo.value = newLockInfo;
        }
      },
      { immediate: true, deep: true }
    );
  }
};

// Fetch allowed transitions
const fetchAllowedTransitions = async () => {
  if (!props.isEditing || !props.record?.id) return;

  try {
    const response = (await $civicApi(
      `/api/v1/records/${props.record.id}/transitions`
    )) as any;

    if (response?.success && response?.data?.transitions) {
      allowedTransitions.value = response.data.transitions;
    }
  } catch (err) {
    console.error('Failed to fetch transitions:', err);
  }
};

// Initialize form
onMounted(async () => {
  await Promise.all([fetchRecordTypes(), fetchRecordStatuses()]);

  if (props.isEditing && props.record) {
    // Load record (check draft first, then published)
    try {
      const response = (await $civicApi(
        `/api/v1/records/${props.record.id}`
      )) as any;

      if (response?.success && response?.data) {
        const data = response.data;
        isDraft.value = data.isDraft || false;

        form.id = data.id;
        form.title = data.title;
        form.type = data.type;
        form.status = data.status;
        form.markdownBody = data.markdownBody || data.content || '';
        form.description = data.metadata?.description || '';
        form.tags = data.metadata?.tags || [];
        form.geography = data.geography;
        form.attachedFiles = data.attachedFiles || [];
        form.linkedRecords = data.linkedRecords || [];
        form.linkedGeographyFiles = data.linkedGeographyFiles || [];
        form.metadata = data.metadata || { tags: [], description: '' };

        // Store metadata for YAML display
        recordAuthor.value =
          data.author || data.created_by || authStore.user?.username || '';
        recordCreatedAt.value =
          data.created_at || data.created || new Date().toISOString();
        recordUpdatedAt.value =
          data.updated_at || data.updated || new Date().toISOString();

        await fetchAllowedTransitions();

        // Initialize lock after record is loaded
        initializeLock();
      }
    } catch (err) {
      console.error('Failed to load record:', err);
      // Fallback to props.record if API fails
      if (props.record) {
        form.id = props.record.id;
        form.title = props.record.title;
        form.type = props.record.type;
        form.status = props.record.status;
        form.markdownBody = props.record.content || '';
        form.description = (props.record.metadata as any)?.description || '';
        form.tags = props.record.metadata?.tags || [];
        form.geography = (props.record as any).geography;
        form.attachedFiles = (props.record as any).attachedFiles || [];
        form.linkedRecords = (props.record as any).linkedRecords || [];
        form.linkedGeographyFiles =
          (props.record as any).linkedGeographyFiles || [];
        const metadata = props.record.metadata || {};
        form.metadata = {
          tags: metadata.tags || [],
          description: (metadata as any).description || '',
        };

        // Store metadata for YAML display
        recordAuthor.value =
          props.record.author || authStore.user?.username || '';
        recordCreatedAt.value =
          props.record.created_at || new Date().toISOString();
        recordUpdatedAt.value =
          props.record.updated_at || new Date().toISOString();

        // Initialize lock after fallback data is set
        initializeLock();
      }
    }
  } else if (props.recordType) {
    form.type = props.recordType;
  }

  // Initialize author for new records
  if (!props.isEditing) {
    recordAuthor.value = authStore.user?.username || '';
    const now = new Date().toISOString();
    recordCreatedAt.value = now;
    recordUpdatedAt.value = now;
  }

  // Start autosave (only in edit mode)
  if (props.isEditing && form.id) {
    startAutosave();
  }
});

// Autosave
const autosave = useAutosave(form, {
  debounceMs: 2000,
  enabled: props.isEditing,
  onSave: async (data) => {
    if (!props.isEditing || !form.id) return;

    autosaveStatus.value = 'saving';

    try {
      await $civicApi(`/api/v1/records/${form.id}/draft`, {
        method: 'PUT',
        body: {
          title: data.title,
          type: data.type,
          status: data.status,
          markdownBody: data.markdownBody,
          metadata: {
            ...data.metadata,
            tags: data.tags,
            description: data.description,
          },
          geography: data.geography,
          attachedFiles: data.attachedFiles,
          linkedRecords: data.linkedRecords,
          linkedGeographyFiles: data.linkedGeographyFiles,
        },
      });

      autosaveStatus.value = 'saved';
      lastSaved.value = new Date();

      // Refresh YAML in sidebar if it's loaded (after autosave)
      if (
        sidebarRef.value &&
        typeof sidebarRef.value.refreshYaml === 'function'
      ) {
        sidebarRef.value.refreshYaml();
      }
    } catch (err) {
      autosaveStatus.value = 'error';
      throw err;
    }
  },
  onError: (error) => {
    console.error('Autosave failed:', error);
  },
});

const startAutosave = () => {
  autosave.start();
};

// Save draft manually
const handleSaveDraft = async () => {
  if (!form.title || !form.type) {
    toast.add({
      title: 'Validation error',
      description: 'Title and type are required',
      color: 'error',
    });
    return;
  }

  try {
    if (props.isEditing && form.id) {
      // Update existing draft
      await $civicApi(`/api/v1/records/${form.id}/draft`, {
        method: 'PUT',
        body: {
          title: form.title,
          type: form.type,
          status: form.status,
          markdownBody: form.markdownBody,
          metadata: {
            ...form.metadata,
            tags: form.tags,
            description: form.description,
          },
          geography: form.geography,
          attachedFiles: form.attachedFiles,
          linkedRecords: form.linkedRecords,
          linkedGeographyFiles: form.linkedGeographyFiles,
        },
      });
    } else {
      // Create new draft
      const response = (await $civicApi('/api/v1/records', {
        method: 'POST',
        body: {
          title: form.title,
          type: form.type,
          status: form.status,
          content: form.markdownBody,
          metadata: {
            ...form.metadata,
            tags: form.tags,
            description: form.description,
          },
          geography: form.geography,
          attachedFiles: form.attachedFiles,
          linkedRecords: form.linkedRecords,
          linkedGeographyFiles: form.linkedGeographyFiles,
        },
      })) as any;

      if (response?.success && response?.data) {
        form.id = response.data.id;
        isDraft.value = true;
      }
    }

    toast.add({
      title: 'Draft saved',
      description: 'Your changes have been saved',
      color: 'primary',
    });

    autosaveStatus.value = 'saved';
    lastSaved.value = new Date();

    // If type was changed, update the form to reflect the saved type
    // This ensures the UI stays in sync with the saved data
    if (props.isEditing && form.id) {
      try {
        const refreshResponse = (await $civicApi(
          `/api/v1/records/${form.id}`
        )) as any;
        if (refreshResponse?.success && refreshResponse?.data) {
          const data = refreshResponse.data;
          // Update form with the latest data from the server
          form.type = data.type;
          form.status = data.status;
          form.title = data.title;
          // Update metadata for YAML display
          recordAuthor.value =
            data.author || data.created_by || authStore.user?.username || '';
          recordUpdatedAt.value =
            data.updated_at ||
            data.last_draft_saved_at ||
            new Date().toISOString();

          // Emit saved event with updated record data for parent components (e.g., to update breadcrumbs)
          emit('saved', data);
        }
      } catch (err) {
        console.error('Failed to refresh record after save:', err);
        // Non-critical error, don't show to user
      }
    }

    // Refresh YAML in sidebar if it's loaded
    if (
      sidebarRef.value &&
      typeof sidebarRef.value.refreshYaml === 'function'
    ) {
      sidebarRef.value.refreshYaml();
    }
  } catch (err: any) {
    toast.add({
      title: 'Save failed',
      description: err.message || 'Failed to save draft',
      color: 'error',
    });
    autosaveStatus.value = 'error';
  }
};

// Publish draft
const handlePublish = async (targetStatus?: string) => {
  if (!form.id) {
    toast.add({
      title: 'Error',
      description: 'Record ID is required',
      color: 'error',
    });
    return;
  }

  try {
    const response = (await $civicApi(`/api/v1/records/${form.id}/publish`, {
      method: 'POST',
      body: {
        status: targetStatus || form.status,
      },
    })) as any;

    if (response?.success) {
      toast.add({
        title: 'Record published',
        description: 'The record has been published successfully',
        color: 'primary',
      });

      // Note: User can navigate via the toast or manually

      isDraft.value = false;

      // Navigate to view page
      navigateTo(`/records/${form.type}/${form.id}`);
    }
  } catch (err: any) {
    toast.add({
      title: 'Publish failed',
      description: err.message || 'Failed to publish record',
      color: 'error',
    });
  }
};

// Handle delete
const handleDelete = () => {
  if (props.record?.id) {
    emit('delete', props.record.id);
  }
};

// Handle unpublish (revert to draft)
const handleUnpublish = async () => {
  if (!form.id) return;

  try {
    const response = (await $civicApi(`/api/v1/records/${form.id}/publish`, {
      method: 'DELETE',
    })) as any;

    if (response?.success) {
      toast.add({
        title: 'Record unpublished',
        description: 'The record has been reverted to draft status',
        color: 'primary',
      });

      form.status = 'draft';
      isDraft.value = true;

      // Refresh record data
      if (props.isEditing && form.id) {
        try {
          const refreshResponse = (await $civicApi(
            `/api/v1/records/${form.id}`
          )) as any;
          if (refreshResponse?.success && refreshResponse?.data) {
            const data = refreshResponse.data;
            form.status = data.status;
            emit('saved', data);
          }
        } catch (err) {
          console.error('Failed to refresh record after unpublish:', err);
        }
      }
    }
  } catch (err: any) {
    toast.add({
      title: 'Unpublish failed',
      description: err.message || 'Failed to unpublish record',
      color: 'error',
    });
  }
};

// Handle archive
const handleArchive = async () => {
  if (!form.id) return;

  try {
    const response = (await $civicApi(`/api/v1/records/${form.id}`, {
      method: 'PUT',
      body: {
        status: 'archived',
      },
    })) as any;

    if (response?.success) {
      toast.add({
        title: 'Record archived',
        description: 'The record has been archived',
        color: 'primary',
      });

      form.status = 'archived';

      // Refresh record data
      if (props.isEditing && form.id) {
        try {
          const refreshResponse = (await $civicApi(
            `/api/v1/records/${form.id}`
          )) as any;
          if (refreshResponse?.success && refreshResponse?.data) {
            const data = refreshResponse.data;
            form.status = data.status;
            emit('saved', data);
          }
        } catch (err) {
          console.error('Failed to refresh record after archive:', err);
        }
      }
    }
  } catch (err: any) {
    toast.add({
      title: 'Archive failed',
      description: err.message || 'Failed to archive record',
      color: 'error',
    });
  }
};

// Handle view history
const handleViewHistory = () => {
  if (form.id) {
    navigateTo(`/records/${form.type}/${form.id}/history`);
  }
};

// Handle duplicate
const handleDuplicate = async () => {
  if (!form.id) return;

  try {
    // Fetch the current record
    const response = (await $civicApi(`/api/v1/records/${form.id}`)) as any;

    if (response?.success && response?.data) {
      const record = response.data;

      // Create a new record with duplicated data
      const duplicateResponse = (await $civicApi('/api/v1/records', {
        method: 'POST',
        body: {
          title: `${record.title} (Copy)`,
          type: record.type,
          status: 'draft',
          content: record.markdownBody || record.content || '',
          metadata: {
            ...record.metadata,
            tags: record.tags || [],
            description: record.description || '',
          },
          geography: record.geography,
          attachedFiles: record.attachedFiles || [],
          linkedRecords: record.linkedRecords || [],
          linkedGeographyFiles: record.linkedGeographyFiles || [],
        },
      })) as any;

      if (duplicateResponse?.success && duplicateResponse?.data) {
        toast.add({
          title: 'Record duplicated',
          description: 'A new draft has been created',
          color: 'primary',
        });

        // Navigate to the new record
        navigateTo(
          `/records/${duplicateResponse.data.type}/${duplicateResponse.data.id}/edit`
        );
      }
    }
  } catch (err: any) {
    toast.add({
      title: 'Duplicate failed',
      description: err.message || 'Failed to duplicate record',
      color: 'error',
    });
  }
};

// Handle export
const handleExport = async () => {
  if (!form.id) return;

  try {
    const response = (await $civicApi(`/api/v1/records/${form.id}/export`, {
      method: 'GET',
    })) as any;

    if (response?.success && response?.data?.markdown) {
      // Create a blob and download
      const blob = new Blob([response.data.markdown], {
        type: 'text/markdown',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.title || 'record'}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.add({
        title: 'Record exported',
        description: 'The record has been exported as Markdown',
        color: 'primary',
      });
    }
  } catch (err: any) {
    // Fallback: construct markdown manually if API doesn't support export
    try {
      const fullResponse = (await $civicApi(
        `/api/v1/records/${form.id}/frontmatter`
      )) as any;
      const frontmatter = fullResponse || '';
      const markdown = `---\n${frontmatter}\n---\n\n${form.markdownBody}`;

      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.title || 'record'}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.add({
        title: 'Record exported',
        description: 'The record has been exported as Markdown',
        color: 'primary',
      });
    } catch (fallbackErr: any) {
      toast.add({
        title: 'Export failed',
        description: fallbackErr.message || 'Failed to export record',
        color: 'error',
      });
    }
  }
};

// Toolbar actions
const handleToolbarAction = (action: string, ...args: any[]) => {
  if (!editorRef.value) return;

  switch (action) {
    case 'bold':
      editorRef.value.executeBold();
      break;
    case 'italic':
      editorRef.value.executeItalic();
      break;
    case 'underline':
      // Markdown doesn't support underline, use bold instead
      editorRef.value.executeBold();
      break;
    case 'code':
      editorRef.value.executeCode();
      break;
    case 'heading':
      if (args[0] && typeof args[0] === 'number') {
        editorRef.value.executeHeading(args[0] as 1 | 2 | 3);
      }
      break;
    case 'bulletList':
      editorRef.value.executeBulletList();
      break;
    case 'numberedList':
      editorRef.value.executeNumberedList();
      break;
    case 'blockquote':
      editorRef.value.executeBlockquote();
      break;
    case 'horizontalRule':
      editorRef.value.executeHorizontalRule();
      break;
    case 'link':
      editorRef.value.executeLink();
      break;
    case 'image':
      editorRef.value.executeImage();
      break;
  }
};

// Preview toggle
const togglePreview = () => {
  showPreview.value = !showPreview.value;
  if (process.client) {
    localStorage.setItem('editor-preview-visible', String(showPreview.value));
  }
};

// Resize handlers
const startResize = () => {
  isResizing.value = true;
};

const handleResize = (e: MouseEvent) => {
  if (!isResizing.value) return;

  const container = editorContainerRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
  const clampedWidth = Math.max(20, Math.min(80, newWidth));

  previewWidth.value = clampedWidth;
  if (process.client) {
    localStorage.setItem('editor-preview-width', String(clampedWidth));
  }
};

const stopResize = () => {
  isResizing.value = false;
};

onMounted(() => {
  if (process.client) {
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  }
});

onUnmounted(() => {
  if (process.client) {
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }
  autosave.stop();
});

// Refs
const editorRef = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const editorContainerRef = ref<HTMLDivElement | null>(null);
const sidebarRef = ref<InstanceType<typeof RecordSidebar> | null>(null);

// Expose for parent components
defineExpose({
  form,
  handleSaveDraft,
  handlePublish,
});
</script>

<template>
  <div class="record-form h-full flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Header - Sticky -->
    <div
      class="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
    >
      <EditorHeader
        :title="form.title"
        :status="form.status"
        :is-draft="isDraft"
        :is-editing="isEditing"
        :autosave-status="autosaveStatus"
        :last-saved="lastSaved"
        :disabled="saving || isLocked"
        :allowed-transitions="allowedTransitions"
        @update:title="form.title = $event"
        @update:status="form.status = $event"
        @save-changes="handleSaveDraft"
        @save-draft="handleSaveDraft"
        @publish="handlePublish"
        @unpublish="handleUnpublish"
        @archive="handleArchive"
        @delete="handleDelete"
        @view-history="handleViewHistory"
        @duplicate="handleDuplicate"
        @export="handleExport"
      />
    </div>

    <!-- Lock Warning -->
    <UAlert
      v-if="isLocked && lockedBy && lockedBy !== authStore.user?.username"
      color="neutral"
      variant="soft"
      :title="`Record locked by ${lockedBy}`"
      description="You cannot edit this record while it's locked by another user."
      icon="i-lucide-lock"
      class="mx-4 mt-4"
    />

    <!-- Main Content Area - Responsive Grid Layout -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Editor + Preview Section (Left + Middle) -->
      <div
        ref="editorContainerRef"
        class="flex-1 flex flex-col lg:flex-row overflow-hidden"
        :class="{ 'pointer-events-none': isLocked }"
      >
        <!-- Editor Section -->
        <div
          class="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900"
          :class="{
            'lg:w-1/2 border-r border-gray-200 dark:border-gray-800':
              showPreview && !isMobile,
            'lg:w-full': !showPreview || isMobile,
          }"
          :style="{
            width: showPreview && !isMobile ? `${previewWidth}%` : '100%',
          }"
        >
          <!-- Mobile View Toggle -->
          <div
            class="lg:hidden flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
          >
            <div class="flex gap-2">
              <UButton
                :variant="!showPreview ? 'solid' : 'ghost'"
                color="primary"
                size="xs"
                @click="showPreview = false"
              >
                Editor
              </UButton>
              <UButton
                :variant="showPreview ? 'solid' : 'ghost'"
                color="primary"
                size="xs"
                @click="showPreview = true"
              >
                Preview
              </UButton>
            </div>
            <UButton
              :icon="showSidebar ? 'i-lucide-x' : 'i-lucide-panel-right'"
              variant="ghost"
              size="xs"
              @click="showSidebar = !showSidebar"
              aria-label="Toggle sidebar"
            />
          </div>

          <!-- Toolbar -->
          <EditorToolbar
            :disabled="saving || isLocked"
            :show-preview="showPreview"
            @bold="handleToolbarAction('bold')"
            @italic="handleToolbarAction('italic')"
            @underline="handleToolbarAction('underline')"
            @code="handleToolbarAction('code')"
            @heading="handleToolbarAction('heading', $event)"
            @bullet-list="handleToolbarAction('bulletList')"
            @numbered-list="handleToolbarAction('numberedList')"
            @blockquote="handleToolbarAction('blockquote')"
            @horizontal-rule="handleToolbarAction('horizontalRule')"
            @link="handleToolbarAction('link')"
            @image="handleToolbarAction('image')"
            @toggle-preview="togglePreview"
          />

          <!-- Editor -->
          <div class="flex-1 overflow-hidden">
            <MarkdownEditor
              ref="editorRef"
              v-model="form.markdownBody"
              :disabled="saving || isLocked"
              placeholder="Start writing your record content..."
              class="h-full"
            />
          </div>
        </div>

        <!-- Resize Handle (Desktop only) -->
        <div
          v-if="showPreview && !isMobile"
          class="hidden lg:block w-1 bg-gray-200 dark:bg-gray-800 cursor-col-resize hover:bg-primary-500 dark:hover:bg-primary-600 transition-colors"
          @mousedown="startResize"
          role="separator"
          aria-label="Resize editor and preview"
        />

        <!-- Preview Section -->
        <div
          v-if="showPreview || isMobile"
          class="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900"
          :class="{
            'lg:w-1/2': !isMobile,
            'absolute inset-0 z-20': isMobile && showPreview,
          }"
          :style="{
            width: showPreview && !isMobile ? `${100 - previewWidth}%` : '100%',
          }"
        >
          <!-- Mobile Preview Header -->
          <div
            class="lg:hidden flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
          >
            <span class="text-sm font-medium">Preview</span>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              @click="showPreview = false"
              aria-label="Close preview"
            />
          </div>
          <PreviewPanel
            :content="form.markdownBody"
            :show="showPreview || !isMobile"
          />
        </div>
      </div>

      <!-- Sidebar (Right) - Desktop: Always visible, Mobile: Slide-over -->
      <div
        v-if="!isMobile || showSidebar"
        class="lg:relative fixed inset-y-0 right-0 z-30 lg:z-auto"
        :class="{
          'lg:w-80 w-full max-w-sm': true,
          'translate-x-0': showSidebar || !isMobile,
          'translate-x-full': isMobile && !showSidebar,
        }"
      >
        <RecordSidebar
          ref="sidebarRef"
          :record-id="form.id"
          :record-type="form.type"
          :title="form.title"
          :status="form.status"
          :author="recordAuthor || authStore.user?.username || ''"
          :created_at="recordCreatedAt"
          :updated_at="recordUpdatedAt"
          :tags="form.tags"
          :attached-files="form.attachedFiles"
          :linked-records="form.linkedRecords"
          :linked-geography-files="form.linkedGeographyFiles"
          :metadata="form.metadata"
          :disabled="saving || isLocked"
          :is-editing="isEditing"
          @update:attached-files="form.attachedFiles = $event"
          @update:linked-records="form.linkedRecords = $event"
          @update:linked-geography-files="form.linkedGeographyFiles = $event"
          @update:record-type="form.type = $event"
          @update:status="form.status = $event"
          @update:tags="form.tags = $event"
          @close="showSidebar = false"
        />
      </div>

      <!-- Mobile Sidebar Overlay -->
      <div
        v-if="isMobile && showSidebar"
        class="fixed inset-0 bg-black/50 z-20 lg:hidden"
        @click="showSidebar = false"
        aria-label="Close sidebar"
      />
    </div>
  </div>
</template>

<style scoped>
.record-form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Smooth transitions for mobile sidebar */
@media (max-width: 1024px) {
  .record-form > div > div:last-child {
    transition: transform 0.3s ease-in-out;
  }
}
</style>
