<template>
  <UForm :state="form" @submit="handleSubmit" class="space-y-6">
    <!-- Basic Information Card -->
    <GeographyBasicInfoCard
      :form="form"
      :form-errors="formErrors"
      :saving="saving"
      :category-options="categoryOptions"
    />

    <!-- Geography Data Card -->
    <GeographyDataCard
      :form="form"
      :form-errors="formErrors"
      :preview="preview"
      :saving="saving"
      :type-options="typeOptions"
      :format-bounds="formatBounds"
      @type-change="onTypeChange"
      @content-change="onContentChange"
      @clear-content="clearContent"
      @copy-to-clipboard="copyToClipboard"
    />

    <!-- Color & Icon Configuration Card -->
    <GeographyMappingCard
      v-if="preview.parsed && preview.parsed.content"
      :form="form"
      :selected-preset="selectedPreset"
      :preset-options="presetOptions"
      :geometry-type-options="geometryTypeOptions"
      :color-property-values="colorPropertyValues"
      :icon-property-values="iconPropertyValues"
      @update:selected-preset="(val) => (selectedPreset = val)"
      @preset-selected="onPresetSelected"
      @apply-preset="applyPreset"
      @initialize-color-mapping="initializeColorMapping"
      @update-color-mapping="updateColorMapping"
      @initialize-icon-mapping="initializeIconMapping"
      @update-icon-mapping="updateIconMapping"
    />
  </UForm>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import GeographyBasicInfoCard from '~/components/geography-form/GeographyBasicInfoCard.vue';
import GeographyDataCard from '~/components/geography-form/GeographyDataCard.vue';
import GeographyMappingCard from '~/components/geography-form/GeographyMappingCard.vue';
import { useGeographyForm } from '~/composables/useGeographyForm';
import type { GeographyFile } from '~/types/geography';

// Props
interface Props {
  mode: 'create' | 'edit';
  geographyId?: string;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  success: [geographyFile: GeographyFile];
  cancel: [];
}>();

// Composables
const { t } = useI18n();

// Action handlers + state (extracted to composable in Phase 2d for ui-013)
const {
  // State
  form,
  formErrors,
  saving,
  preview,
  selectedPreset,
  // Computed
  presetOptions,
  categoryOptions,
  typeOptions,
  geometryTypeOptions,
  isFormValid,
  colorPropertyValues,
  iconPropertyValues,
  // Methods
  loadGeographyFile,
  onTypeChange,
  onContentChange,
  clearContent,
  copyToClipboard,
  handleSubmit,
  handleCancel,
  formatBounds,
  initializeColorMapping,
  initializeIconMapping,
  updateColorMapping,
  updateIconMapping,
  loadPresets,
  onPresetSelected,
  applyPreset,
} = useGeographyForm({
  props,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit: emit as (event: 'success' | 'cancel', ...args: any[]) => void,
  t,
});

// Expose methods and state for parent component
defineExpose({
  handleSubmit,
  handleCancel,
  isFormValid,
  saving,
  form,
  formErrors,
  preview,
  clearContent,
});

// Lifecycle
onMounted(async () => {
  await loadPresets();
  if (props.mode === 'edit') {
    loadGeographyFile();
  }
});
</script>
