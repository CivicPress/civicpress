<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import EditorAttachments from './EditorAttachments.vue';
import EditorRelations from './EditorRelations.vue';
import EditorActivity from './EditorActivity.vue';
import GeographyLinkForm from '~/components/GeographyLinkForm.vue';
import GeographySelector from '~/components/GeographySelector.vue';
import { useRecordTypes } from '~/composables/useRecordTypes';
import { useRecordStatuses } from '~/composables/useRecordStatuses';
import { useAuthStore } from '~/stores/auth';

const { t } = useI18n();
const { getRecordTypeLabel } = useRecordTypes();
const { recordStatusOptions, fetchRecordStatuses } = useRecordStatuses();

interface Props {
  recordId?: string;
  recordType?: string;
  title?: string;
  status?: string; // Legal status (stored in YAML + DB)
  workflowState?: string; // Internal editorial status (DB-only, never in YAML)
  author?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
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
  metadata?: Record<string, any>;
  disabled?: boolean;
  isEditing?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  tags: () => [],
  attachedFiles: () => [],
  linkedRecords: () => [],
  linkedGeographyFiles: () => [],
  metadata: () => ({}),
  isEditing: false,
});

const emit = defineEmits<{
  'update:attachedFiles': [files: typeof props.attachedFiles];
  'update:linkedRecords': [records: typeof props.linkedRecords];
  'update:linkedGeographyFiles': [files: typeof props.linkedGeographyFiles];
  'update:recordType': [type: string];
  'update:status': [status: string]; // Legal status (stored in YAML + DB)
  'update:workflowState': [workflowState: string]; // Internal editorial status (DB-only, never in YAML)
  'update:tags': [tags: string[]];
  close: [];
}>();

// Record types for selection
const { getRecordTypeOptions, fetchRecordTypes } = useRecordTypes();
const recordTypeOptions = computed(() => getRecordTypeOptions());

// Selected type as object (for USelectMenu)
const selectedType = computed({
  get: () => {
    if (!props.recordType) return undefined;
    return recordTypeOptions.value.find(
      (opt: any) => opt.value === props.recordType
    );
  },
  set: (value: any) => {
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
const statusOptions = computed(() => {
  return recordStatusOptions().map((option: any) => ({
    value: option.value,
    label: option.label,
    icon: option.icon,
    // Remove 'type' property as it's not needed for USelectMenu
  }));
});

// Selected status as object (for USelectMenu)
const selectedStatus = computed({
  get: () => {
    if (!props.status) return undefined;
    return statusOptions.value.find((opt: any) => opt.value === props.status);
  },
  set: (value: any) => {
    if (value) {
      emit('update:status', typeof value === 'string' ? value : value.value);
    } else {
      emit('update:status', '');
    }
  },
});

// Workflow state options (hardcoded for now - can be refactored later)
const workflowStateOptions = computed(() => [
  { value: 'draft', label: t('records.workflowState.draft') },
  { value: 'under_review', label: t('records.workflowState.underReview') },
  {
    value: 'ready_for_publication',
    label: t('records.workflowState.readyForPublication'),
  },
  { value: 'internal_only', label: t('records.workflowState.internalOnly') },
]);

// Selected workflow state as object (for USelectMenu)
const selectedWorkflowState = computed({
  get: () => {
    if (!props.workflowState) return undefined;
    return workflowStateOptions.value.find(
      (opt: any) => opt.value === props.workflowState
    );
  },
  set: (value: any) => {
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

// Fetch types and statuses on mount
onMounted(async () => {
  await fetchRecordTypes();
  await fetchRecordStatuses();
});

const openSections = ref<string[]>(['details', 'attachments']);

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

// Geography selector state
const showGeographySelector = ref(false);
const selectedGeographyIds = ref<string[]>([]);

// Watch for changes in linkedGeographyFiles prop to update selectedGeographyIds
watch(
  () => props.linkedGeographyFiles,
  (newFiles) => {
    selectedGeographyIds.value = newFiles.map((f) => f.id);
  },
  { immediate: true, deep: true }
);

const handleGeographySelection = (files: any[]) => {
  const newLinks = files
    .filter(
      (file) => !props.linkedGeographyFiles.some((link) => link.id === file.id)
    )
    .map((file) => ({
      id: file.id,
      name: file.name,
      description: file.description || '',
    }));

  if (newLinks.length > 0) {
    emit('update:linkedGeographyFiles', [
      ...props.linkedGeographyFiles,
      ...newLinks,
    ]);
  }
  showGeographySelector.value = false; // Close popover after selection
};

// Tags
const tags = computed(() => props.tags || []);

// Fetch YAML frontmatter from API
const rawYaml = ref<string>('');
const yamlLoading = ref(false);
const yamlError = ref<string | null>(null);

const $civicApi = useNuxtApp().$civicApi;

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
      (runtimeConfig.public as any)?.civicApiUrl || 'http://localhost:3000';
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

    rawYaml.value = await response.text();
  } catch (err: any) {
    yamlError.value = err.message || 'Failed to load frontmatter YAML';
    rawYaml.value = `Error: ${yamlError.value}`;
    console.error('Error fetching frontmatter YAML:', err);
  } finally {
    yamlLoading.value = false;
  }
};

// Expose method to refresh YAML (for parent components to call after save)
defineExpose({
  refreshYaml: () => fetchFrontmatterYaml(true),
});

const accordionItems = computed(() => [
  {
    label: t('records.editor.details'),
    value: 'details',
    icon: 'i-lucide-info',
  },
  {
    label:
      props.attachedFiles.length <= 1
        ? t('records.attachments.titleSingular')
        : t('records.attachments.title'),
    value: 'attachments',
    icon: 'i-lucide-paperclip',
    count: props.attachedFiles.length,
  },
  {
    label: t('records.editor.relations'),
    value: 'relations',
    icon: 'i-lucide-link',
    count:
      props.linkedRecords.length + props.linkedGeographyFiles.length ||
      undefined,
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
  },
]);
</script>

<template>
  <div
    class="record-sidebar w-full lg:w-80 h-full border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto flex flex-col"
  >
    <!-- Sidebar Header (Mobile only) -->
    <div
      class="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex-shrink-0"
    >
      <h2 class="text-sm font-semibold">
        {{ t('records.editor.recordDetails') }}
      </h2>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        size="xs"
        @click="$emit('close')"
        :aria-label="t('common.close')"
      />
    </div>

    <!-- Sidebar Content -->
    <div class="flex-1 overflow-y-auto">
      <UAccordion
        v-model="openSections"
        :items="accordionItems"
        type="multiple"
        class="divide-y divide-gray-100 dark:divide-gray-800/30"
        :ui="{
          item: '',
          trigger:
            'pl-4 pr-4 py-2 w-full flex items-center bg-gray-50 dark:bg-gray-800/30 transition-colors',
          leadingIcon:
            'w-3.5 h-3.5 text-gray-500 dark:text-gray-400 ml-0 mr-2 flex-shrink-0',
          trailingIcon:
            'w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto mr-0 flex-shrink-0',
          label:
            'font-medium text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300',
        }"
      >
        <template #default="{ item }">
          <span
            class="font-medium text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300"
            >{{ item.label }}</span
          >
          <UBadge
            v-if="item.count !== undefined && item.count > 0"
            color="primary"
            variant="soft"
            size="xs"
            class="ml-2 mr-2 flex-shrink-0"
          >
            {{ item.count }}
          </UBadge>
        </template>

        <template #content="{ item }">
          <div class="pl-4 pr-4 pb-4 pt-3">
            <!-- Details Section -->
            <div v-if="item.value === 'details'" class="space-y-4">
              <div>
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
                >
                  {{ t('common.type') }}
                  <span class="text-red-500">*</span>
                </label>
                <!-- Editable type selector for both new and existing records -->
                <USelectMenu
                  v-model="selectedType"
                  :items="recordTypeOptions"
                  :disabled="disabled"
                  :placeholder="t('records.selectType')"
                  class="w-full"
                  size="sm"
                />
              </div>
              <div>
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
                >
                  {{ t('common.status') }}
                </label>
                <!-- Editable status selector - Legal status (stored in YAML + DB) -->
                <USelectMenu
                  v-model="selectedStatus"
                  :items="statusOptions"
                  :disabled="disabled"
                  :placeholder="t('records.selectStatus')"
                  class="w-full"
                  size="sm"
                />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {{ t('records.statusHelper') }}
                </p>
              </div>
              <div>
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
                >
                  {{ t('records.workflowState.label') }}
                </label>
                <!-- Editable workflow state selector - Internal editorial status (DB-only, never in YAML) -->
                <USelectMenu
                  v-model="selectedWorkflowState"
                  :items="workflowStateOptions"
                  :disabled="disabled"
                  :placeholder="t('records.workflowState.select')"
                  class="w-full"
                  size="sm"
                />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {{ t('records.workflowStateHelper') }}
                </p>
              </div>
              <div>
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
                >
                  {{ t('common.tags') }}
                </label>
                <UInputTags
                  :model-value="tags"
                  @update:model-value="emit('update:tags', $event)"
                  :disabled="disabled"
                  :placeholder="t('records.addTagPlaceholder')"
                  size="sm"
                  class="w-full"
                />
              </div>
            </div>

            <!-- Attachments Section -->
            <EditorAttachments
              v-else-if="item.value === 'attachments'"
              :attached-files="attachedFiles"
              :disabled="disabled"
              @update:attached-files="emit('update:attachedFiles', $event)"
            />

            <!-- Relations Section -->
            <div v-else-if="item.value === 'relations'" class="space-y-4">
              <!-- Linked Records -->
              <div>
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{
                    props.linkedRecords.length <= 1
                      ? t('records.linkedRecords.titleSingular')
                      : t('records.linkedRecords.title')
                  }}
                </label>
                <EditorRelations
                  :linked-records="linkedRecords"
                  :record-id="recordId"
                  :disabled="disabled"
                  @update:linked-records="emit('update:linkedRecords', $event)"
                />
              </div>

              <!-- Linked Geography -->
              <div>
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block"
                >
                  {{
                    props.linkedGeographyFiles.length <= 1
                      ? t('records.linkedGeographySingular')
                      : t('records.linkedGeography')
                  }}
                </label>
                <div class="space-y-2">
                  <div class="flex items-center justify-end">
                    <UPopover v-model:open="showGeographySelector">
                      <UButton
                        icon="i-lucide-plus"
                        color="primary"
                        variant="outline"
                        size="xs"
                        :disabled="disabled"
                      >
                        {{ t('records.geography.linkGeography') }}
                      </UButton>

                      <template #content>
                        <GeographySelector
                          v-model:selected-ids="selectedGeographyIds"
                          :multiple="true"
                          @selection-change="handleGeographySelection"
                        />
                      </template>
                    </UPopover>
                  </div>

                  <GeographyLinkForm
                    v-if="linkedGeographyFiles.length > 0"
                    :model-value="linkedGeographyFiles"
                    :disabled="disabled"
                    @update:model-value="
                      emit('update:linkedGeographyFiles', $event)
                    "
                  />

                  <div
                    v-else
                    class="text-center py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
                  >
                    <p class="text-xs text-gray-500">
                      {{ t('records.geography.noLinkedGeographyFiles') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Activity Section -->
            <EditorActivity
              v-else-if="item.value === 'activity'"
              :record-id="recordId"
            />

            <!-- Technical Details Section -->
            <div v-else-if="item.value === 'technical'" class="space-y-4">
              <div>
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
                >
                  {{ t('records.raw.recordId') }}
                </label>
                <p
                  class="text-xs font-mono text-gray-500 dark:text-gray-400 break-all bg-gray-50 dark:bg-gray-800 px-2 py-1.5 rounded"
                >
                  {{ recordId || t('common.noData') }}
                </p>
              </div>
              <div v-if="created_at">
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
                >
                  {{ t('records.metadataFields.created_at') }}
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatDateTime(created_at) }}
                </p>
              </div>
              <div v-if="updated_at">
                <label
                  class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
                >
                  {{ t('records.metadataFields.updated_at') }}
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatDateTime(updated_at) }}
                </p>
              </div>
            </div>

            <!-- Raw YAML Section -->
            <div v-else-if="item.value === 'raw-yaml'" class="space-y-2">
              <div v-if="yamlLoading" class="text-center py-4">
                <UIcon
                  name="i-lucide-loader-2"
                  class="w-5 h-5 animate-spin text-gray-500 mx-auto mb-2"
                />
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ t('records.editor.loadingYaml') }}
                </p>
              </div>
              <div
                v-else
                class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
              >
                <pre
                  class="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words"
                  :class="{
                    'text-red-600 dark:text-red-400': yamlError,
                  }"
                >
                  {{
                    rawYaml ||
                    (props.recordId
                      ? t('common.noData')
                      : t('records.editor.saveToSeeYaml'))
                  }}
                </pre>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('records.editor.rawYamlDescription') }}
              </p>
            </div>
          </div>
        </template>
      </UAccordion>
    </div>
  </div>
</template>

<style scoped>
.record-sidebar {
  flex-shrink: 0;
  /* Smooth scrolling */
  scroll-behavior: smooth;
}

/* Custom scrollbar for sidebar */
.record-sidebar::-webkit-scrollbar {
  width: 6px;
}

.record-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.record-sidebar::-webkit-scrollbar-thumb {
  background: rgb(203, 213, 225);
  border-radius: 3px;
}

.dark .record-sidebar::-webkit-scrollbar-thumb {
  background: rgb(51, 65, 85);
}

.record-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgb(148, 163, 184);
}

.dark .record-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgb(71, 85, 105);
}
</style>
