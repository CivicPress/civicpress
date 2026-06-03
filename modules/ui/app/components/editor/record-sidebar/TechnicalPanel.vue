<script setup lang="ts">
interface Props {
  recordId?: string;
  createdAt?: string;
  updatedAt?: string;
  formatDateTime: (value: string) => string;
}

defineProps<Props>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
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
    <div v-if="createdAt">
      <label
        class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
      >
        {{ t('records.metadataFields.created_at') }}
      </label>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ formatDateTime(createdAt) }}
      </p>
    </div>
    <div v-if="updatedAt">
      <label
        class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block"
      >
        {{ t('records.metadataFields.updated_at') }}
      </label>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ formatDateTime(updatedAt) }}
      </p>
    </div>
  </div>
</template>
