<script setup lang="ts">
import { onMounted } from 'vue';
import EditorAttachments from './EditorAttachments.vue';
import EditorActivity from './EditorActivity.vue';
import TemplatePanel from './record-sidebar/TemplatePanel.vue';
import DetailsPanel from './record-sidebar/DetailsPanel.vue';
import RelationsPanel from './record-sidebar/RelationsPanel.vue';
import TechnicalPanel from './record-sidebar/TechnicalPanel.vue';
import RawYamlPanel from './record-sidebar/RawYamlPanel.vue';
import TemplatePreviewModal from './record-sidebar/TemplatePreviewModal.vue';
import { useRecordSidebar } from '~/composables/useRecordSidebar';

const { t } = useI18n();

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  'load-template': [templateId: string, content: string];
  close: [];
}>();

// State + handlers extracted to composable in Phase 2d (W2-T16 decomposition)
const {
  recordTypeOptions,
  selectedType,
  statusOptions,
  selectedStatus,
  workflowStateOptions,
  selectedWorkflowState,
  fetchRecordTypes,
  fetchRecordStatuses,
  templateOptions,
  selectedTemplate,
  selectedTemplateId,
  showTemplatePreview,
  templatePreviewContent,
  templatePreviewLoading,
  templatesLoading,
  handleLoadTemplate,
  handlePreviewTemplate,
  showGeographySelector,
  selectedGeographyIds,
  handleGeographySelection,
  formatDateTime,
  rawYaml,
  yamlLoading,
  yamlError,
  fetchFrontmatterYaml,
  openSections,
  accordionItems,
} = useRecordSidebar({
  props,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit: emit as any,
  t,
});

// Fetch types and statuses on mount
onMounted(async () => {
  await fetchRecordTypes();
  await fetchRecordStatuses();
});

// Expose method to refresh YAML (for parent components to call after save)
defineExpose({
  refreshYaml: () => fetchFrontmatterYaml(true),
});
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
            <!-- Template Section (only for new records) -->
            <TemplatePanel
              v-if="item.value === 'template'"
              :record-type="recordType"
              :template-options="templateOptions"
              :selected-template="selectedTemplate"
              :disabled="disabled"
              :templates-loading="templatesLoading"
              :template-preview-loading="templatePreviewLoading"
              @update:selected-template="selectedTemplate = $event"
              @preview-template="handlePreviewTemplate"
              @load-template="handleLoadTemplate"
            />

            <!-- Details Section -->
            <DetailsPanel
              v-else-if="item.value === 'details'"
              :selected-type="selectedType"
              :record-type-options="recordTypeOptions"
              :selected-status="selectedStatus"
              :status-options="statusOptions"
              :selected-workflow-state="selectedWorkflowState"
              :workflow-state-options="workflowStateOptions"
              :tags="tags"
              :disabled="disabled"
              @update:selected-type="selectedType = $event"
              @update:selected-status="selectedStatus = $event"
              @update:selected-workflow-state="selectedWorkflowState = $event"
              @update:tags="emit('update:tags', $event)"
            />

            <!-- Attachments Section -->
            <EditorAttachments
              v-else-if="item.value === 'attachments'"
              :attached-files="attachedFiles"
              :disabled="disabled"
              @update:attached-files="emit('update:attachedFiles', $event)"
            />

            <!-- Relations Section -->
            <RelationsPanel
              v-else-if="item.value === 'relations'"
              :record-id="recordId"
              :linked-records="linkedRecords"
              :linked-geography-files="linkedGeographyFiles"
              :selected-geography-ids="selectedGeographyIds"
              :show-geography-selector="showGeographySelector"
              :disabled="disabled"
              @update:linked-records="emit('update:linkedRecords', $event)"
              @update:linked-geography-files="
                emit('update:linkedGeographyFiles', $event)
              "
              @update:selected-geography-ids="selectedGeographyIds = $event"
              @update:show-geography-selector="showGeographySelector = $event"
              @geography-selection="handleGeographySelection"
            />

            <!-- Activity Section -->
            <EditorActivity
              v-else-if="item.value === 'activity'"
              :record-id="recordId"
            />

            <!-- Technical Details Section -->
            <TechnicalPanel
              v-else-if="item.value === 'technical'"
              :record-id="recordId"
              :created_at="created_at"
              :updated_at="updated_at"
              :format-date-time="formatDateTime"
            />

            <!-- Raw YAML Section -->
            <RawYamlPanel
              v-else-if="item.value === 'raw-yaml'"
              :record-id="recordId"
              :raw-yaml="rawYaml"
              :yaml-loading="yamlLoading"
              :yaml-error="yamlError"
            />
          </div>
        </template>
      </UAccordion>
    </div>

    <!-- Template Preview Modal -->
    <TemplatePreviewModal
      v-model:open="showTemplatePreview"
      :template-preview-content="templatePreviewContent"
      :template-preview-loading="templatePreviewLoading"
      :selected-template-id="selectedTemplateId"
      @load-template="handleLoadTemplate"
    />
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
