<script setup lang="ts">
import { ref } from 'vue';
import LinkedRecordList from '~/components/records/LinkedRecordList.vue';

const { t } = useI18n();

interface Props {
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
  recordId?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  linkedRecords: () => [],
  linkedGeographyFiles: () => [],
  disabled: false,
});

const emit = defineEmits<{
  'update:linkedRecords': [records: typeof props.linkedRecords];
  'update:linkedGeographyFiles': [files: typeof props.linkedGeographyFiles];
}>();

const showRecordSelector = ref(false);
</script>

<template>
  <div class="space-y-4">
    <!-- Linked Records -->
    <div>
      <div class="flex items-center justify-end mb-3">
        <UPopover v-model:open="showRecordSelector">
          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="outline"
            size="xs"
            :disabled="disabled"
          >
            {{ t('records.linkedRecords.addLink') }}
          </UButton>

          <template #content>
            <recordsRecordLinkSelector
              :model-value="linkedRecords"
              :exclude-ids="recordId ? [recordId] : []"
              @update:model-value="emit('update:linkedRecords', $event)"
              @close="showRecordSelector = false"
            />
          </template>
        </UPopover>
      </div>

      <LinkedRecordList
        v-if="linkedRecords.length > 0"
        :model-value="linkedRecords"
        :editable="true"
        :exclude-ids="recordId ? [recordId] : []"
        @update:model-value="emit('update:linkedRecords', $event)"
      />

      <div
        v-else
        class="text-center py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
      >
        <p class="text-xs text-gray-500">
          {{ t('records.linkedRecords.noLinks') }}
        </p>
      </div>
    </div>
  </div>
</template>
