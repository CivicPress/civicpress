<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import type { ApiResponse } from '~/utils/api-response';
import EditorHeader from './editor/EditorHeader.vue';
import MarkdownEditor from './editor/MarkdownEditor.vue';
import EditorToolbar from './editor/EditorToolbar.vue';
import PreviewPanel from './editor/PreviewPanel.vue';
import RecordSidebar from './editor/RecordSidebar.vue';
import { useAutosave } from '~/composables/useAutosave';
import { useRecordLock } from '~/composables/useRecordLock';
import {
  extractTitleFromMarkdown,
  stripFirstLineFromMarkdown,
  prependTitleToMarkdown,
} from '~/composables/recordMarkdown';
import { useRecordEditorActions } from '~/composables/useRecordEditorActions';

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
  delete: [recordId: string];
  saved: [recordData: Record<string, unknown>];
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
  geography: undefined as
    | { srid?: number; zone_ref?: string; bbox?: number[]; center?: { lon: number; lat: number } }
    | undefined,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lockInfo = ref<any>(null);
const isLocked = computed(() => lockInfo.value?.locked || false);
const lockedBy = computed(() => lockInfo.value?.lockedBy || null);

// Record metadata for YAML display
const recordAuthor = ref<string>('');
const recordCreatedAt = ref<string>('');
const recordUpdatedAt = ref<string>('');

// Template refs (declared early so action handlers can close over them)
const editorRef = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const editorContainerRef = ref<HTMLDivElement | null>(null);
const sidebarRef = ref<InstanceType<typeof RecordSidebar> | null>(null);

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
    )) as ApiResponse;

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
      )) as ApiResponse;

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
        // CivicRecord doesn't model workflowState / geography / attachedFiles /
        // linkedRecords / linkedGeographyFiles directly; the record is a loose
        // server payload here. Narrow once via a structural type.
        const r = props.record as typeof props.record & {
          workflowState?: string;
          geography?: typeof form.geography;
          attachedFiles?: typeof form.attachedFiles;
          linkedRecords?: typeof form.linkedRecords;
          linkedGeographyFiles?: typeof form.linkedGeographyFiles;
        };
        form.id = r.id;
        form.type = r.type;
        form.status = r.status; // Legal status (stored in YAML + DB)
        // Initialize workflowState from props, default to 'draft' only if not provided
        form.workflowState =
          r.workflowState !== undefined && r.workflowState !== null
            ? r.workflowState
            : 'draft'; // Internal editorial status (DB-only, never in YAML)

        // Extract title from markdown content if first line is H1, otherwise use props.record.title
        const rawContent = r.content || '';
        const extractedTitle = extractTitleFromMarkdown(rawContent);
        form.title = extractedTitle || r.title || '';
        form.markdownBody = extractedTitle
          ? stripFirstLineFromMarkdown(rawContent)
          : rawContent;
        form.description =
          (typeof r.metadata?.description === 'string'
            ? r.metadata.description
            : '') || '';
        form.tags = r.metadata?.tags || [];
        form.geography = r.geography;
        form.attachedFiles = r.attachedFiles || [];
        form.linkedRecords = r.linkedRecords || [];
        form.linkedGeographyFiles = r.linkedGeographyFiles || [];
        const metadata = r.metadata || {};
        form.metadata = {
          tags: metadata.tags || [],
          description:
            (typeof metadata.description === 'string'
              ? metadata.description
              : '') || '',
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

// Action handlers (extracted to composable in Phase 2d for ui-008)
const {
  handleSaveDraft,
  handlePublish,
  handleDelete,
  handleDeleteUnpublishedChanges,
  handleUnpublish,
  handleArchive,
  handleViewHistory,
  handleDuplicate,
  handleExport,
  handleToolbarAction,
} = useRecordEditorActions({
  form,
  props,
  emit,
  allowedTransitions,
  isDraft,
  hasUnpublishedChanges,
  autosave,
  lockComposable: () => lockComposable, // capture-time getter — lockComposable is reassignable
  autosaveStatus,
  lastSaved,
  recordAuthor,
  recordUpdatedAt,
  editorRef,
  sidebarRef,
  startAutosave,
});

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

// Handle template loading
const handleLoadTemplate = async (templateId: string, content: string) => {
  // Confirm before loading template (will overwrite existing content)
  if (form.markdownBody && form.markdownBody.trim()) {
    const confirmed = confirm(
      t('records.confirmLoadTemplate') ||
        'Loading a template will replace your current content. Continue?'
    );
    if (!confirmed) return;
  }

  // Extract title if first line is H1
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim();
  if (firstLine?.startsWith('# ')) {
    form.title = firstLine.substring(2).trim();
    // Remove first line and any following blank lines
    let startIndex = 1;
    while (startIndex < lines.length && lines[startIndex]?.trim() === '') {
      startIndex++;
    }
    form.markdownBody = lines.slice(startIndex).join('\n');
  } else {
    form.markdownBody = content;
  }

  toast.add({
    title: t('records.templateLoaded') || 'Template loaded',
    description:
      t('records.templateLoadedDesc') ||
      'Template content has been loaded into the editor',
    color: 'primary',
  });
};

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
          @load-template="handleLoadTemplate"
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
