import type { Ref } from 'vue';
import type { ApiResponse } from '~/utils/api-response';
import type {
  RecordResponse,
  RecordExportResponse,
} from '~/types/api-responses';
import type { useAutosave } from '~/composables/useAutosave';
import type { useRecordLock } from '~/composables/useRecordLock';
import {
  extractTitleFromMarkdown,
  stripFirstLineFromMarkdown,
  prependTitleToMarkdown,
} from '~/composables/recordMarkdown';

// Editor command surface exposed by MarkdownEditor.vue. Kept as a structural
// type so the composable doesn't have to import the component (which would
// create a cycle for tests).
interface EditorCommands {
  executeBold: () => void;
  executeItalic: () => void;
  executeCode: () => void;
  executeHeading: (level: 1 | 2 | 3) => void;
  executeBulletList: () => void;
  executeNumberedList: () => void;
  executeBlockquote: () => void;
  executeHorizontalRule: () => void;
  executeLink: () => void;
  executeImage: () => void;
}

interface SidebarCommands {
  refreshYaml?: () => void;
}

interface RecordEditorProps {
  /**
   * Loose record payload — RecordForm.vue passes either a CivicRecord
   * (store shape) or an api response envelope; the composable only reads
   * `record.id` here. The full destructure happens in RecordForm itself.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record?: any;
  isEditing?: boolean;
  error?: string | null;
  saving?: boolean;
  canDelete?: boolean;
  recordType?: string | null;
  hideBasicFields?: boolean;
}

interface RecordEditorEmit {
  (event: 'delete', recordId: string): void;
  (event: 'saved', recordData: Record<string, unknown>): void;
}

export interface UseRecordEditorActionsDeps {
  /**
   * Reactive form state. Bound to RecordForm.vue's `reactive({...})`
   * which has fields mutated dynamically through many code paths
   * (form.title, form.metadata.tags, form.attachedFiles, ...); the
   * shape is captured at the SFC, not here, so `any` is intentional.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  props: RecordEditorProps;
  emit: RecordEditorEmit;
  allowedTransitions: Ref<string[]>;
  isDraft: Ref<boolean>;
  hasUnpublishedChanges: Ref<boolean>;
  autosave: ReturnType<typeof useAutosave>;
  lockComposable: () => ReturnType<typeof useRecordLock> | null;
  // Additional state shared with the SFC.
  autosaveStatus: Ref<'idle' | 'saving' | 'saved' | 'error'>;
  lastSaved: Ref<Date | null>;
  recordAuthor: Ref<string>;
  recordUpdatedAt: Ref<string>;
  // Template refs from RecordForm.vue.
  editorRef: Ref<EditorCommands | null>;
  sidebarRef: Ref<SidebarCommands | null>;
  // startAutosave is a thin wrapper around autosave.start() the SFC defines;
  // mirrored here to keep handler bodies byte-for-byte the same.
  startAutosave: () => void;
}

/**
 * Bundles the 10 RecordForm action handlers (save / publish / delete /
 * unpublish / archive / view-history / duplicate / export / toolbar /
 * delete-unpublished-changes). Extracted from RecordForm.vue in Phase 2d
 * (ui-008 decomposition). Behaviour is preserved byte-for-byte; only direct
 * closures over component-local state are replaced with `deps.*` references.
 */
export function useRecordEditorActions(deps: UseRecordEditorActionsDeps) {
  const {
    form,
    props,
    emit,
    isDraft,
    autosave,
    autosaveStatus,
    lastSaved,
    recordAuthor,
    recordUpdatedAt,
    editorRef,
    sidebarRef,
    startAutosave,
  } = deps;

  const toast = useToast();
  const $civicApi = useNuxtApp().$civicApi;
  const authStore = useAuthStore();
  const { t } = useI18n();

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
        })) as ApiResponse<RecordResponse>;

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
          )) as ApiResponse<RecordResponse>;
          if (refreshResponse?.success && refreshResponse?.data) {
            const data = refreshResponse.data;
            // Store current workflowState before updating (to preserve if API doesn't return it)
            const currentWorkflowState = form.workflowState;

            // Update isDraft based on response (record might have been published externally)
            isDraft.value = data.isDraft || false;
            // Update hasUnpublishedChanges flag
            deps.hasUnpublishedChanges.value =
              data.hasUnpublishedChanges || false;

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
    } catch (err: unknown) {
      toast.add({
        title: 'Save failed',
        description: (err instanceof Error ? err.message : '') || 'Failed to save draft',
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
      })) as ApiResponse<RecordResponse>;

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
    } catch (err: unknown) {
      toast.add({
        title: 'Publish failed',
        description: (err instanceof Error ? err.message : '') || 'Failed to publish record',
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
      })) as ApiResponse<RecordResponse>;

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
    } catch (err: unknown) {
      const errorMessage =
        (err instanceof Error ? err.message : '') || t('records.editor.failedToDeleteUnpublishedChanges');
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
      })) as ApiResponse<RecordResponse>;

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
            )) as ApiResponse<RecordResponse>;
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
    } catch (err: unknown) {
      toast.add({
        title: 'Unpublish failed',
        description: (err instanceof Error ? err.message : '') || 'Failed to unpublish record',
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
      })) as ApiResponse<RecordResponse>;

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
            )) as ApiResponse<RecordResponse>;
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
    } catch (err: unknown) {
      toast.add({
        title: 'Archive failed',
        description: (err instanceof Error ? err.message : '') || 'Failed to archive record',
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
      const response = (await $civicApi(`/api/v1/records/${form.id}`)) as ApiResponse<RecordResponse>;

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
        })) as ApiResponse<RecordResponse>;

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
    } catch (err: unknown) {
      toast.add({
        title: 'Duplicate failed',
        description: (err instanceof Error ? err.message : '') || 'Failed to duplicate record',
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
      })) as ApiResponse<RecordExportResponse>;

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
    } catch {
      // Fallback: construct markdown manually if API doesn't support export
      try {
        const fullResponse = (await $civicApi(
          `/api/v1/records/${form.id}/frontmatter`
        )) as unknown as string;
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
      } catch (fallbackErr: unknown) {
        toast.add({
          title: 'Export failed',
          description:
            (fallbackErr instanceof Error ? fallbackErr.message : '') ||
            'Failed to export record',
          color: 'error',
        });
      }
    }
  };

  // Toolbar actions
  const handleToolbarAction = (action: string, ...args: unknown[]) => {
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

  return {
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
  };
}
