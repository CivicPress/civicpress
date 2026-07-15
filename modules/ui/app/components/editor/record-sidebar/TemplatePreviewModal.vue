<script setup lang="ts">
import RecordPreview from '~/components/RecordPreview.vue';

interface Props {
  open: boolean;
  templatePreviewContent: string;
  templatePreviewLoading: boolean;
  selectedTemplateId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'load-template': [];
}>();

const { t } = useI18n();

const openProxy = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});
</script>

<template>
  <UModal
    v-model:open="openProxy"
    :title="t('records.templatePreview')"
    :description="
      t('records.templatePreviewDescription') ||
      'Preview how the selected template will look with your current form data'
    "
    :ui="{
      content:
        'w-[calc(100vw-2rem)] max-w-4xl rounded-lg shadow-lg ring ring-default',
    }"
  >
    <template #body>
      <div class="space-y-4">
        <div
          v-if="templatePreviewLoading"
          class="flex items-center justify-center py-8"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="w-6 h-6 animate-spin text-gray-500"
          />
          <span class="ml-2 text-sm text-gray-500">
            {{ t('records.loadingTemplate') }}
          </span>
        </div>
        <div
          v-else-if="templatePreviewContent"
          class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto"
        >
          <RecordPreview :content="templatePreviewContent" :wrap="true" />
        </div>
        <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
          <p class="text-sm">
            {{
              t('records.noPreviewContent') || 'No preview content available'
            }}
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="openProxy = false">
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="primary"
          :disabled="!selectedTemplateId || templatePreviewLoading"
          @click="emit('load-template')"
        >
          {{ t('records.templates.loadTemplate') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
