<script setup lang="ts">
import LinkedRecordList from '~/components/records/LinkedRecordList.vue';

interface LinkedRecord {
  id: string;
  type: string;
  description: string;
}

interface Props {
  linkedRecords?: LinkedRecord[];
}

defineProps<Props>();

const { t } = useI18n();
</script>

<template>
  <div>
    <LinkedRecordList
      v-if="linkedRecords && linkedRecords.length > 0"
      :model-value="linkedRecords"
      :editable="false"
    />
    <div v-else class="text-center py-8">
      <UIcon
        name="i-lucide-link"
        class="w-12 h-12 text-gray-400 mx-auto mb-4"
      />
      <h4
        class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2"
      >
        {{ t('records.linkedRecords.noRecordsLinkedTitle') }}
      </h4>
      <p class="text-gray-600 dark:text-gray-400 mb-4">
        {{ t('records.linkedRecords.noRecordsLinkedDesc') }}
      </p>
    </div>
  </div>
</template>
