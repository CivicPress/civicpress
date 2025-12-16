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
  status: string; // Legal status (stored in YAML + DB)
  workflowState?: string; // Internal editorial status (DB-only, never in YAML)
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
  status: 'draft', // Legal status (stored in YAML + DB)
  workflowState: 'draft', // Internal editorial status (DB-only, never in YAML)
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
const hasUnpublishedChanges = ref(false); // Track if there's an unpublished draft for a published record
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

// Helper functions for title/content separation
const extractTitleFromMarkdown = (content: string): string | null => {
  if (!content) return null;
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim();
  // Check if first line is an H1 heading (# Title)
  if (firstLine?.startsWith('# ')) {
    return firstLine.substring(2).trim();
  }
  return null;
};

const stripFirstLineFromMarkdown = (content: string): string => {
  if (!content) return '';
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim();
  // If first line is an H1, remove it and any following blank lines
  if (firstLine?.startsWith('# ')) {
    // Remove first line and any immediately following blank lines
    let startIndex = 1;
    while (startIndex < lines.length && lines[startIndex]?.trim() === '') {
      startIndex++;
    }
    return lines.slice(startIndex).join('\n');
  }
  return content;
};

const prependTitleToMarkdown = (title: string, content: string): string => {
  const titleLine = `# ${title}`;
  // If content is empty, just return title
  if (!content.trim()) {
    return titleLine;
  }
  // Ensure there's a blank line between title and content
  return `${titleLine}\n\n${content}`;
};

// Computed property for preview content (includes title as H1)
const previewContent = computed(() => {
  return prependTitleToMarkdown(form.title || '', form.markdownBody || '');
});

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
    // Use ?edit=true to get draft version if it exists (for authenticated users with edit permission)
    try {
      const response = (await $civicApi(
        `/api/v1/records/${props.record.id}?edit=true`
      )) as any;

      if (response?.success && response?.data) {
        const data = response.data;
        isDraft.value = data.isDraft || false;
        // Track if there are unpublished changes (when viewing a published record with a draft)
        hasUnpublishedChanges.value = data.hasUnpublishedChanges || false;

        form.id = data.id;
        form.type = data.type;
        form.status = data.status; // Legal status (stored in YAML + DB)
        // Initialize workflowState from API, default to 'draft' only if not provided
        form.workflowState =
          data.workflowState !== undefined && data.workflowState !== null
            ? data.workflowState
            : 'draft'; // Internal editorial status (DB-only, never in YAML)

        // Extract title from markdown content if first line is H1, otherwise use data.title
        const rawContent = data.markdownBody || data.content || '';
        const extractedTitle = extractTitleFromMarkdown(rawContent);
        form.title = extractedTitle || data.title || '';
        form.markdownBody = extractedTitle
          ? stripFirstLineFromMarkdown(rawContent)
          : rawContent;

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
        form.type = props.record.type;
        form.status = props.record.status; // Legal status (stored in YAML + DB)
        // Initialize workflowState from props, default to 'draft' only if not provided
        form.workflowState =
          (props.record as any).workflowState !== undefined &&
          (props.record as any).workflowState !== null
            ? (props.record as any).workflowState
            : 'draft'; // Internal editorial status (DB-only, never in YAML)

        // Extract title from markdown content if first line is H1, otherwise use props.record.title
        const rawContent = props.record.content || '';
        const extractedTitle = extractTitleFromMarkdown(rawContent);
        form.title = extractedTitle || props.record.title || '';
        form.markdownBody = extractedTitle
          ? stripFirstLineFromMarkdown(rawContent)
          : rawContent;
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
  } else if (!props.isEditing) {
    // For new records: Set default type to first item in dropdown
    const recordTypeOptions = getRecordTypeOptions();
    const firstOption = recordTypeOptions[0];
    if (firstOption && !form.type) {
      form.type = firstOption.value;
    }
  }

  // Initialize author for new records
  if (!props.isEditing) {
    recordAuthor.value = authStore.user?.username || '';
    const now = new Date().toISOString();
    recordCreatedAt.value = now;
    recordUpdatedAt.value = now;
  }

  // Start autosave ONLY if record already has a draft
  if (props.isEditing && form.id && isDraft.value) {
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
          status: data.status, // Legal status (stored in YAML + DB)
          workflowState: data.workflowState, // Internal editorial status (DB-only, never in YAML)
          markdownBody: prependTitleToMarkdown(data.title, data.markdownBody),
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

// Watch isDraft and automatically start/stop autosave when draft status changes
watch(
  () => isDraft.value,
  (newValue) => {
    if (props.isEditing && form.id) {
      if (newValue) {
        // Draft created - start autosave
        autosave.start();
      } else {
        // Draft published or deleted - stop autosave
        autosave.stop();
      }
    }
  },
  { immediate: false } // Don't run on initial mount (handled in onMounted)
);

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
          status: form.status, // Legal status (stored in YAML + DB)
          workflowState: form.workflowState, // Internal editorial status (DB-only, never in YAML)
          markdownBody: prependTitleToMarkdown(form.title, form.markdownBody),
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
          status: form.status, // Legal status (stored in YAML + DB)
          workflowState: form.workflowState, // Internal editorial status (DB-only, never in YAML)
          content: prependTitleToMarkdown(form.title, form.markdownBody),
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

        // Start autosave now that draft exists (before navigation)
        if (props.isEditing) {
          startAutosave();
        }

        toast.add({
          title: 'Draft saved',
          description: 'Your changes have been saved',
          color: 'primary',
        });

        // Navigate to the record edit page after first save
        navigateTo(`/records/${form.type}/${form.id}/edit`);
        return; // Exit early after navigation
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
        // Temporarily stop autosave to prevent triggering on refresh updates
        autosave.stop();

        // Use ?edit=true to fetch the draft version (not the published version)
        const refreshResponse = (await $civicApi(
          `/api/v1/records/${form.id}?edit=true`
        )) as any;
        if (refreshResponse?.success && refreshResponse?.data) {
          const data = refreshResponse.data;
          // Store current workflowState before updating (to preserve if API doesn't return it)
          const currentWorkflowState = form.workflowState;

          // Update isDraft based on response (record might have been published externally)
          isDraft.value = data.isDraft || false;
          // Update hasUnpublishedChanges flag
          hasUnpublishedChanges.value = data.hasUnpublishedChanges || false;

          // Update form with the latest data from the server
          form.type = data.type;
          form.status = data.status; // Legal status (stored in YAML + DB)
          // Preserve workflowState if API returns a valid value, otherwise keep current form value
          // This prevents resetting to 'draft' if the API returns null/undefined
          if (
            data.workflowState !== undefined &&
            data.workflowState !== null &&
            data.workflowState !== ''
          ) {
            form.workflowState = data.workflowState; // Internal editorial status (DB-only, never in YAML)
          } else {
            // If API doesn't return workflowState, keep the current form.workflowState value (don't reset)
            form.workflowState = currentWorkflowState;
          }
          // Extract title from markdown content if first line is H1, otherwise use data.title
          const rawContent = data.markdownBody || data.content || '';
          const extractedTitle = extractTitleFromMarkdown(rawContent);
          form.title = extractedTitle || data.title || '';
          form.markdownBody = extractedTitle
            ? stripFirstLineFromMarkdown(rawContent)
            : rawContent;

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

        // Restart autosave after refresh is complete
        // Only restart if it's still a draft (might have been published externally)
        if (props.isEditing && form.id && isDraft.value) {
          autosave.start();
        }
      } catch (err) {
        console.error('Failed to refresh record after save:', err);
        // Non-critical error, don't show to user
        // Restart autosave even on error, but only if it's still a draft
        if (props.isEditing && form.id && isDraft.value) {
          autosave.start();
        }
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

      // Stop autosave after publishing (no longer a draft)
      autosave.stop();

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

// Handle delete unpublished changes (delete draft)
const handleDeleteUnpublishedChanges = async () => {
  if (!form.id) return;

  try {
    const response = (await $civicApi(`/api/v1/records/${form.id}/draft`, {
      method: 'DELETE',
    })) as any;

    if (response?.success) {
      toast.add({
        title: t('records.editor.unpublishedChangesDeleted'),
        description: t('records.editor.unpublishedChangesDeletedDescription'),
        color: 'primary',
      });

      // Navigate to drafts list page - the draft has been deleted from record_drafts table
      // and will no longer appear in the drafts list
      navigateTo('/records/drafts');
    }
  } catch (err: any) {
    const errorMessage =
      err.message || t('records.editor.failedToDeleteUnpublishedChanges');
    toast.add({
      title: t('common.error'),
      description: errorMessage,
      color: 'error',
    });
  }
};

// Handle unpublish (revert to draft)
const handleUnpublish = async () => {
  if (!form.id) return;

  try {
    const response = (await $civicApi(`/api/v1/records/${form.id}/status`, {
      method: 'POST',
      body: {
        status: 'draft',
      },
    })) as any;

    if (response?.success) {
      toast.add({
        title: 'Record unpublished',
        description: 'The record has been reverted to draft status',
        color: 'primary',
      });

      form.status = 'draft';
      isDraft.value = true;

      // Start autosave after unpublishing (now it's a draft)
      if (props.isEditing && form.id) {
        startAutosave();
      }

      // Refresh record data
      if (props.isEditing && form.id) {
        try {
          const refreshResponse = (await $civicApi(
            `/api/v1/records/${form.id}?edit=true`
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

      // Extract content without title if it exists in markdown
      const rawContent = record.markdownBody || record.content || '';
      const contentWithoutTitle = extractTitleFromMarkdown(rawContent)
        ? stripFirstLineFromMarkdown(rawContent)
        : rawContent;
      const newTitle = `${record.title} (Copy)`;

      // Create a new record with duplicated data
      const duplicateResponse = (await $civicApi('/api/v1/records', {
        method: 'POST',
        body: {
          title: newTitle,
          type: record.type,
          status: 'draft',
          content: prependTitleToMarkdown(newTitle, contentWithoutTitle),
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
  <div class="record-form h-full flex flex-col bg-white dark:bg-gray-900">
    <!-- Header - Sticky -->
    <div
      class="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
    >
      <EditorHeader
        :title="form.title"
        :status="form.status"
        :is-draft="isDraft"
        :has-unpublished-changes="hasUnpublishedChanges"
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
        @delete-unpublished-changes="handleDeleteUnpublishedChanges"
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
    <div class="flex-1 flex overflow-hidden bg-white dark:bg-gray-900">
      <!-- Editor + Preview Section (Left + Middle) -->
      <div
        ref="editorContainerRef"
        class="flex-1 flex flex-col lg:flex-row overflow-hidden"
        :class="{ 'pointer-events-none': isLocked }"
      >
        <!-- Editor Section -->
        <div
          class="flex-1 flex flex-col overflow-hidden"
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
            class="lg:hidden flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800"
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
          class="flex-1 flex flex-col overflow-hidden"
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
            class="lg:hidden flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800"
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
            :content="previewContent"
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
          :workflow-state="form.workflowState"
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
          @update:workflow-state="form.workflowState = $event"
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
