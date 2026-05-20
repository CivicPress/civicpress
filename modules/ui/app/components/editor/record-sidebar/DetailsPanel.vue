<script setup lang="ts">
interface Props {
  selectedType: any;
  recordTypeOptions: any[];
  selectedStatus: any;
  statusOptions: any[];
  selectedWorkflowState: any;
  workflowStateOptions: any[];
  tags: string[];
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  'update:selectedType': [value: any];
  'update:selectedStatus': [value: any];
  'update:selectedWorkflowState': [value: any];
  'update:tags': [value: string[]];
}>();

const { t } = useI18n();

const selectedTypeProxy = computed({
  get: () => props.selectedType,
  set: (value) => emit('update:selectedType', value),
});
const selectedStatusProxy = computed({
  get: () => props.selectedStatus,
  set: (value) => emit('update:selectedStatus', value),
});
const selectedWorkflowStateProxy = computed({
  get: () => props.selectedWorkflowState,
  set: (value) => emit('update:selectedWorkflowState', value),
});
</script>

<template>
  <div class="space-y-4">
    <div>
      <label
        class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
      >
        {{ t('common.type') }}
        <span class="text-red-500">*</span>
      </label>
      <!-- Editable type selector for both new and existing records -->
      <USelectMenu
        v-model="selectedTypeProxy"
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
        v-model="selectedStatusProxy"
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
        v-model="selectedWorkflowStateProxy"
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
</template>
