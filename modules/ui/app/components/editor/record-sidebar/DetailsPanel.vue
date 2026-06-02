<script setup lang="ts">
/**
 * USelect's v-model contract differs slightly across the three selects
 * here (each option type has different optional fields — color, icon,
 * description) — TS picks distinct anonymous types for each that don't
 * unify under a single SelectOption interface. The proxies bridge prop
 * ↔ emit through `any` to avoid a per-select-shape type each. Runtime
 * is identical; the cost is per-form type fidelity, which the parent
 * (RecordSidebar) already enforces.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedType: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTypeOptions: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedStatus: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  statusOptions: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedWorkflowState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflowStateOptions: any[];
  tags: string[];
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'update:selectedType': [value: any];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'update:selectedStatus': [value: any];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'update:selectedWorkflowState': [value: any];
  'update:tags': [value: string[]];
}>();
/* eslint-enable @typescript-eslint/no-explicit-any */

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
