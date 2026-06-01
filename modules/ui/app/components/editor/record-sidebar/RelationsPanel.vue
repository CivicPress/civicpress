<script setup lang="ts">
import EditorRelations from '~/components/editor/EditorRelations.vue';
import GeographyLinkForm from '~/components/GeographyLinkForm.vue';
import GeographySelector from '~/components/GeographySelector.vue';

interface LinkedRecord {
  id: string;
  type: string;
  description: string;
}

interface LinkedGeographyFile {
  id: string;
  name: string;
  description?: string;
}

interface Props {
  recordId?: string;
  linkedRecords: LinkedRecord[];
  linkedGeographyFiles: LinkedGeographyFile[];
  selectedGeographyIds: string[];
  showGeographySelector: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  'update:linkedRecords': [value: LinkedRecord[]];
  'update:linkedGeographyFiles': [value: LinkedGeographyFile[]];
  'update:selectedGeographyIds': [value: string[]];
  'update:showGeographySelector': [value: boolean];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'geography-selection': [files: any[]];
}>();

const { t } = useI18n();

const showGeographySelectorProxy = computed({
  get: () => props.showGeographySelector,
  set: (value) => emit('update:showGeographySelector', value),
});

const selectedGeographyIdsProxy = computed({
  get: () => props.selectedGeographyIds,
  set: (value) => emit('update:selectedGeographyIds', value),
});
</script>

<template>
  <div class="space-y-4">
    <!-- Linked Records -->
    <div>
      <label
        class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block"
      >
        {{
          linkedRecords.length <= 1
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
          linkedGeographyFiles.length <= 1
            ? t('records.linkedGeographySingular')
            : t('records.linkedGeography')
        }}
      </label>
      <div class="space-y-2">
        <div class="flex items-center justify-end">
          <UPopover v-model:open="showGeographySelectorProxy">
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
                v-model:selected-ids="selectedGeographyIdsProxy"
                :multiple="true"
                @selection-change="emit('geography-selection', $event)"
              />
            </template>
          </UPopover>
        </div>

        <GeographyLinkForm
          v-if="linkedGeographyFiles.length > 0"
          :model-value="linkedGeographyFiles"
          :disabled="disabled"
          @update:model-value="emit('update:linkedGeographyFiles', $event)"
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
</template>
