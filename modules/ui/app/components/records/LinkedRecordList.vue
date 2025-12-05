<template>
  <div class="linked-record-list">
    <!-- Empty State -->
    <div v-if="linkedRecords.length === 0" class="text-center py-8">
      <UIcon
        name="i-lucide-link"
        class="w-12 h-12 text-gray-400 mx-auto mb-4"
      />
      <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        {{ t('records.linkedRecords.noRecordsLinkedTitle') }}
      </h4>
      <p class="text-gray-600 dark:text-gray-400 mb-4">
        {{ t('records.linkedRecords.noRecordsLinkedDesc') }}
      </p>
    </div>

    <!-- Linked Records List -->
    <div v-else class="space-y-3">
      <div
        v-for="(linkedRecord, index) in linkedRecords"
        :key="`${linkedRecord.id}-${index}`"
        class="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-white dark:bg-gray-800"
      >
        <!-- Top: Title and Actions -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ linkedRecord.id }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <p class="text-xs text-gray-500 font-mono truncate">
                {{ linkedRecord.id }}
              </p>
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex-shrink-0"
              >
                {{ linkedRecord.type }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0 -mt-2 -mr-2">
            <UButton
              icon="i-lucide-external-link"
              variant="ghost"
              size="xs"
              @click="openInNewTab(linkedRecord)"
              :disabled="!editable"
            />
            <UButton
              v-if="editable"
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              color="error"
              @click="removeLink(index)"
            />
          </div>
        </div>

        <!-- Bottom: Content (Full Width) -->
        <div class="space-y-2">
          <UFormField v-if="editable" :label="t('common.category')" size="xs">
            <USelectMenu
              :model-value="linkedRecord.category as any"
              :items="getLinkCategoryOptions()"
              :placeholder="t('records.attachments.selectCategory')"
              @update:model-value="(value) => updateLinkCategory(index, value)"
              :disabled="!editable"
              size="xs"
              class="w-full"
            />
          </UFormField>
          <div v-else-if="linkedRecord.category" class="text-xs">
            <span class="font-medium text-gray-700 dark:text-gray-300"
              >{{ t('common.category') }}:</span
            >
            <span class="ml-1 text-gray-600 dark:text-gray-400">{{
              linkedRecord.category
            }}</span>
          </div>

          <UFormField
            v-if="editable"
            :label="t('common.description')"
            size="xs"
          >
            <UInput
              :model-value="linkedRecord.description || ''"
              :placeholder="t('records.attachments.optionalDescription')"
              @update:model-value="
                (value) => updateLinkDescription(index, value)
              "
              :disabled="!editable"
              size="xs"
              class="w-full"
            />
          </UFormField>
          <div v-else-if="linkedRecord.description" class="text-xs">
            <span class="font-medium text-gray-700 dark:text-gray-300"
              >{{ t('common.description') }}:</span
            >
            <span class="ml-1 text-gray-600 dark:text-gray-400">{{
              linkedRecord.description
            }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import RecordLinkSelector from './RecordLinkSelector.vue';

// Composables
const { t } = useI18n();

interface LinkedRecord {
  id: string;
  type: string;
  description: string;
  path?: string;
  category?: string;
}

// Composables
const { getLinkCategoryOptions, getLinkCategoryLabel, fetchLinkCategories } =
  useLinkCategories();

interface Props {
  modelValue: LinkedRecord[];
  editable?: boolean;
  excludeIds?: string[];
}

interface Emits {
  (e: 'update:modelValue', value: LinkedRecord[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  excludeIds: () => [],
});

const emit = defineEmits<Emits>();

// State
const tempLinkedRecords = ref<LinkedRecord[]>([]);

// Computed
const linkedRecords = computed(() => props.modelValue);

// Methods
const closeSelector = () => {
  tempLinkedRecords.value = [];
};

const updateLinkDescription = (index: number, newDescription: string) => {
  const updatedRecords = [...linkedRecords.value];
  const record = updatedRecords[index];
  if (record) {
    updatedRecords[index] = {
      id: record.id,
      type: record.type,
      description: newDescription,
      path: record.path,
      category: record.category,
    };
    emit('update:modelValue', updatedRecords);
  }
};

const updateLinkCategory = (index: number, newCategory: any) => {
  const updatedRecords = [...linkedRecords.value];
  const record = updatedRecords[index];
  if (record) {
    // Handle both string and SelectMenuItem types
    const categoryValue =
      typeof newCategory === 'string' ? newCategory : newCategory?.value || '';
    updatedRecords[index] = {
      id: record.id,
      type: record.type,
      description: record.description,
      path: record.path,
      category: categoryValue,
    };
    emit('update:modelValue', updatedRecords);
  }
};

const removeLink = (index: number) => {
  const updatedRecords = linkedRecords.value.filter((_, i) => i !== index);
  emit('update:modelValue', updatedRecords);
};

const openInNewTab = (linkedRecord: LinkedRecord) => {
  window.open(`/records/${linkedRecord.type}/${linkedRecord.id}`, '_blank');
};

// Lifecycle
onMounted(async () => {
  await fetchLinkCategories();
});

// Watch for changes in temp linked records
watch(
  tempLinkedRecords,
  (newValue) => {
    emit('update:modelValue', newValue);
  },
  { deep: true }
);
</script>
