import { ref, computed, watch, type Ref } from 'vue';
import { useRecordTypes } from '~/composables/useRecordTypes';
import { useRecordStatuses } from '~/composables/useRecordStatuses';
import { useTemplates } from '~/composables/useTemplates';
import { useAuthStore } from '~/stores/auth';
import { errorMessage } from '~/utils/errors';

export interface RecordSidebarProps {
  recordId?: string;
  recordType?: string;
  title?: string;
  status?: string;
  workflowState?: string;
  tags?: string[];
  attachedFiles?: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?: string;
  }>;
  linkedRecords?: Array<{ id: string; type: string; description: string }>;
  linkedGeographyFiles?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  isEditing?: boolean;
}

export type RecordSidebarEmit = {
  (e: 'update:recordType', value: string): void;
  (e: 'update:status', value: string): void;
  (e: 'update:workflowState', value: string): void;
  (
    e: 'update:linkedGeographyFiles',
    value: RecordSidebarProps['linkedGeographyFiles']
  ): void;
  (e: 'load-template', templateId: string, content: string): void;
};

export interface UseRecordSidebarDeps {
  props: RecordSidebarProps;
  emit: RecordSidebarEmit;
  t: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * Bundles RecordSidebar state and handlers (templates, statuses, YAML fetch,
 * geography selection). Extracted from RecordSidebar.vue in Phase 2d
 * (W2-T16 decomposition). Behaviour preserved byte-for-byte.
 */
export function useRecordSidebar(deps: UseRecordSidebarDeps) {
  const { props, emit, t } = deps;

  const { getRecordTypeOptions, fetchRecordTypes } = useRecordTypes();
  const { recordStatusOptions, fetchRecordStatuses } = useRecordStatuses();
  const {
    getTemplateOptions,
    fetchTemplate,
    previewTemplate,
    loading: templatesLoading,
  } = useTemplates();

  /** Generic select-option shape matching USelectMenu / getRecordTypeOptions. */
  interface SelectOption {
    value: string;
    label: string;
    icon?: string;
    description?: string;
  }

  /** USelectMenu's v-model accepts a SelectOption or a bare string (typeahead). */
  type SelectValue = SelectOption | string | null | undefined;

  // Record type options + selection
  const recordTypeOptions = computed<SelectOption[]>(
    () => getRecordTypeOptions() as SelectOption[]
  );

  const selectedType = computed({
    get: () => {
      if (!props.recordType) return undefined;
      return recordTypeOptions.value.find(
        (opt) => opt.value === props.recordType
      );
    },
    set: (value: SelectValue) => {
      if (value) {
        emit(
          'update:recordType',
          typeof value === 'string' ? value : value.value
        );
      } else {
        emit('update:recordType', '');
      }
    },
  });

  // Status options for selection (transform to match USelectMenu format)
  const statusOptions = computed<SelectOption[]>(() => {
    return (recordStatusOptions() as SelectOption[]).map((option) => ({
      value: option.value,
      label: option.label,
      icon: option.icon,
    }));
  });

  const selectedStatus = computed({
    get: () => {
      if (!props.status) return undefined;
      return statusOptions.value.find((opt) => opt.value === props.status);
    },
    set: (value: SelectValue) => {
      if (value) {
        emit('update:status', typeof value === 'string' ? value : value.value);
      } else {
        emit('update:status', '');
      }
    },
  });

  // Workflow state options (hardcoded for now - can be refactored later)
  const workflowStateOptions = computed<SelectOption[]>(() => [
    { value: 'draft', label: t('records.workflowState.draft') },
    { value: 'under_review', label: t('records.workflowState.underReview') },
    {
      value: 'ready_for_publication',
      label: t('records.workflowState.readyForPublication'),
    },
    { value: 'internal_only', label: t('records.workflowState.internalOnly') },
  ]);

  const selectedWorkflowState = computed({
    get: () => {
      if (!props.workflowState) return undefined;
      return workflowStateOptions.value.find(
        (opt) => opt.value === props.workflowState
      );
    },
    set: (value: SelectValue) => {
      if (value) {
        emit(
          'update:workflowState',
          typeof value === 'string' ? value : value.value
        );
      } else {
        emit('update:workflowState', '');
      }
    },
  });

  // Template selection state
  const templateOptions = ref<
    Array<{ label: string; value: string; description?: string; icon?: string }>
  >([]);
  const selectedTemplateId = ref<string | undefined>(undefined);
  const showTemplatePreview = ref(false);
  const templatePreviewContent = ref<string>('');
  const templatePreviewLoading = ref(false);

  const selectedTemplate = computed({
    get: () => {
      if (!selectedTemplateId.value) return undefined;
      return templateOptions.value.find(
        (opt) => opt.value === selectedTemplateId.value
      );
    },
    set: (
      value:
        | { label: string; value: string; description?: string; icon?: string }
        | undefined
    ) => {
      selectedTemplateId.value = value ? value.value : undefined;
    },
  });

  // Watch record type changes to load templates
  watch(
    () => props.recordType,
    async (newType) => {
      if (newType && !props.isEditing) {
        // Only show templates for new records
        try {
          templateOptions.value = await getTemplateOptions(newType);
          // Select first template by default if available
          if (templateOptions.value.length > 0 && !selectedTemplateId.value) {
            const firstTemplate = templateOptions.value[0];
            if (firstTemplate) {
              selectedTemplateId.value = firstTemplate.value;
            }
          }
        } catch (error) {
          console.error('Failed to load templates:', error);
          templateOptions.value = [];
        }
      } else {
        templateOptions.value = [];
        selectedTemplateId.value = undefined;
      }
    },
    { immediate: true }
  );

  // Load template and emit to parent
  const handleLoadTemplate = async () => {
    if (!selectedTemplateId.value) return;

    templatePreviewLoading.value = true;
    try {
      const template = await fetchTemplate(selectedTemplateId.value);
      if (template) {
        // Use preview API to get rendered content with smart defaults
        const authStore = useAuthStore();
        const preview = await previewTemplate(selectedTemplateId.value, {
          title: props.title || '',
          user: authStore.user?.username || '',
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0],
          type: props.recordType || '',
          status: props.status || 'draft',
          author: authStore.user?.username || '',
        });

        emit('load-template', selectedTemplateId.value, preview.rendered);
        selectedTemplateId.value = undefined;
        showTemplatePreview.value = false;
      }
    } catch (error) {
      console.error('Failed to load template:', error);
    } finally {
      templatePreviewLoading.value = false;
    }
  };

  // Preview template
  const handlePreviewTemplate = async () => {
    if (!selectedTemplateId.value) return;

    templatePreviewLoading.value = true;
    showTemplatePreview.value = true;
    templatePreviewContent.value = ''; // Clear previous content

    try {
      const authStore = useAuthStore();
      const preview = await previewTemplate(selectedTemplateId.value, {
        title: props.title || '',
        user: authStore.user?.username || '',
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        type: props.recordType || '',
        status: props.status || 'draft',
        author: authStore.user?.username || '',
      });

      if (preview && preview.rendered) {
        templatePreviewContent.value = preview.rendered;
      } else {
        throw new Error('Invalid preview response: missing rendered content');
      }
    } catch (error: unknown) {
      console.error('Failed to preview template:', error);
      const msg =
        errorMessage(error, '') ||
        t('records.templatePreviewError') ||
        'Error loading template preview';
      // Show error in a user-friendly format
      templatePreviewContent.value = `## Error\n\n${msg}\n\nPlease check:\n- The template exists and is valid\n- You have permission to view templates\n- The API is accessible`;
    } finally {
      templatePreviewLoading.value = false;
    }
  };

  // Geography selector state
  const showGeographySelector = ref(false);
  const selectedGeographyIds = ref<string[]>([]);

  // Watch for changes in linkedGeographyFiles prop to update selectedGeographyIds
  watch(
    () => props.linkedGeographyFiles,
    (newFiles) => {
      selectedGeographyIds.value = (newFiles || []).map((f) => f.id);
    },
    { immediate: true, deep: true }
  );

  const handleGeographySelection = (
    files: Array<{ id: string; name: string; description?: string }>
  ) => {
    const existing = props.linkedGeographyFiles || [];
    const newLinks = files
      .filter((file) => !existing.some((link) => link.id === file.id))
      .map((file) => ({
        id: file.id,
        name: file.name,
        description: file.description || '',
      }));

    if (newLinks.length > 0) {
      emit('update:linkedGeographyFiles', [...existing, ...newLinks]);
    }
    showGeographySelector.value = false; // Close popover after selection
  };

  // Date formatting
  const formatDateTime = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Raw YAML fetching
  const rawYaml = ref<string>('');
  const yamlLoading = ref(false);
  const yamlError = ref<string | null>(null);

  const fetchFrontmatterYaml = async (force = false) => {
    if (!props.recordId) {
      rawYaml.value = 'No record ID available';
      return;
    }

    // Skip if already loaded and not forcing refresh
    if (!force && rawYaml.value && !yamlError.value) {
      return;
    }

    yamlLoading.value = true;
    yamlError.value = null;

    try {
      // API returns plain text YAML, not JSON
      // Use fetch directly since $civicApi expects JSON responses
      const runtimeConfig = useRuntimeConfig();
      const apiBase =
        (runtimeConfig.public as { civicApiUrl?: string })?.civicApiUrl ||
        'http://localhost:3000';
      const authStore = useAuthStore();

      const response = await fetch(
        `${apiBase}/api/v1/records/${props.recordId}/frontmatter`,
        {
          headers: {
            Accept: 'text/yaml',
            ...(authStore.token
              ? { Authorization: `Bearer ${authStore.token}` }
              : {}),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const yamlText = await response.text();
      // Remove leading/trailing whitespace from the YAML content
      rawYaml.value = yamlText.trim();
    } catch (err: unknown) {
      yamlError.value = errorMessage(err, 'Failed to load frontmatter YAML');
      rawYaml.value = `Error: ${yamlError.value}`;
      console.error('Error fetching frontmatter YAML:', err);
    } finally {
      yamlLoading.value = false;
    }
  };

  // Accordion sections state
  const openSections = ref<string[]>(
    props.isEditing
      ? ['details', 'attachments']
      : ['template', 'details', 'attachments']
  );

  // Fetch frontmatter YAML when record ID is available and raw-yaml section is opened
  watch(
    [() => props.recordId, () => openSections.value.includes('raw-yaml')],
    async ([recordId, isOpen]) => {
      if (recordId && isOpen && !yamlLoading.value) {
        await fetchFrontmatterYaml();
      }
    },
    { immediate: true }
  );

  // Accordion items
  const accordionItems = computed(() => {
    const items: Array<{
      label: string;
      value: string;
      icon: string;
      count?: number;
    }> = [];

    // Add template section first (only for new records)
    if (!props.isEditing) {
      items.push({
        label: t('records.templates.title'),
        value: 'template',
        icon: 'i-lucide-file-text',
      });
    }

    const attachedFiles = props.attachedFiles || [];
    const linkedRecords = props.linkedRecords || [];
    const linkedGeographyFiles = props.linkedGeographyFiles || [];

    // Add other sections
    items.push(
      {
        label: t('records.editor.details'),
        value: 'details',
        icon: 'i-lucide-info',
      },
      {
        label:
          attachedFiles.length <= 1
            ? t('records.attachments.titleSingular')
            : t('records.attachments.title'),
        value: 'attachments',
        icon: 'i-lucide-paperclip',
        count: attachedFiles.length,
      },
      {
        label: t('records.editor.relations'),
        value: 'relations',
        icon: 'i-lucide-link',
        count:
          linkedRecords.length + linkedGeographyFiles.length || undefined,
      },
      {
        label: t('records.editor.activity'),
        value: 'activity',
        icon: 'i-lucide-history',
      },
      {
        label: t('records.editor.technicalDetails'),
        value: 'technical',
        icon: 'i-lucide-settings',
      },
      {
        label: t('records.editor.rawYaml'),
        value: 'raw-yaml',
        icon: 'i-lucide-code',
      }
    );

    return items;
  });

  return {
    // Record types/statuses
    recordTypeOptions,
    selectedType,
    statusOptions,
    selectedStatus,
    workflowStateOptions,
    selectedWorkflowState,
    fetchRecordTypes,
    fetchRecordStatuses,
    // Templates
    templateOptions,
    selectedTemplate,
    selectedTemplateId,
    showTemplatePreview,
    templatePreviewContent,
    templatePreviewLoading,
    templatesLoading,
    handleLoadTemplate,
    handlePreviewTemplate,
    // Geography
    showGeographySelector,
    selectedGeographyIds,
    handleGeographySelection,
    // Misc
    formatDateTime,
    // YAML
    rawYaml,
    yamlLoading,
    yamlError,
    fetchFrontmatterYaml,
    // Accordion
    openSections,
    accordionItems,
  };
}
