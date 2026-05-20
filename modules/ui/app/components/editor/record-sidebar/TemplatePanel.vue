<script setup lang="ts">
interface Props {
  recordType?: string;
  templateOptions: any[];
  selectedTemplate: any;
  disabled?: boolean;
  templatesLoading?: boolean;
  templatePreviewLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  templatesLoading: false,
  templatePreviewLoading: false,
});

const emit = defineEmits<{
  'update:selectedTemplate': [value: any];
  'preview-template': [];
  'load-template': [];
}>();

const { t } = useI18n();

const selectedTemplateProxy = computed({
  get: () => props.selectedTemplate,
  set: (value) => emit('update:selectedTemplate', value),
});
</script>

<template>
  <div class="space-y-4">
    <div v-if="recordType && templateOptions.length > 0">
      <label
        class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
      >
        {{ t('records.selectTemplate') }}
      </label>
      <div class="space-y-2">
        <USelectMenu
          v-model="selectedTemplateProxy"
          :items="templateOptions"
          :disabled="disabled || templatesLoading"
          :loading="templatesLoading"
          :placeholder="t('records.selectTemplate')"
          class="w-full"
          size="sm"
          searchable
        />
        <div v-if="selectedTemplateProxy" class="flex gap-2">
          <UButton
            icon="i-lucide-eye"
            variant="outline"
            size="xs"
            :disabled="
              disabled || templatePreviewLoading || !selectedTemplateProxy
            "
            :loading="templatePreviewLoading"
            @click="emit('preview-template')"
            class="flex-1 justify-center"
          >
            {{ t('records.previewTemplate') }}
          </UButton>
          <UButton
            icon="i-lucide-file-text"
            color="primary"
            size="xs"
            :disabled="disabled || templatePreviewLoading"
            :loading="templatePreviewLoading"
            @click="emit('load-template')"
            class="flex-1 justify-center"
          >
            {{ t('records.templates.loadTemplate') }}
          </UButton>
        </div>
      </div>
    </div>
    <div
      v-else-if="!recordType"
      class="text-center py-4 text-gray-500 dark:text-gray-400"
    >
      <p class="text-xs">
        {{
          t('records.selectTypeFirst') ||
          'Please select a record type first to see available templates'
        }}
      </p>
    </div>
    <div v-else class="text-center py-4 text-gray-500 dark:text-gray-400">
      <p class="text-xs">
        {{
          t('records.noTemplatesAvailable') ||
          'No templates available for this record type'
        }}
      </p>
    </div>
  </div>
</template>
