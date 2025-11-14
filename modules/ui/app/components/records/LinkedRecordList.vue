<template>
  <div class="linked-record-list">
    <!-- Empty State -->
    <div v-if="linkedRecords.length === 0" class="text-center py-8">
      <UIcon
        name="i-lucide-link"
        class="w-12 h-12 text-gray-400 mx-auto mb-4"
      />
      <p class="text-gray-500 dark:text-gray-400">No records linked yet</p>
    </div>

    <!-- Linked Records List -->
    <div v-else class="space-y-3">
      <div
        v-for="(linkedRecord, index) in linkedRecords"
        :key="`${linkedRecord.id}-${index}`"
        class="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-700"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <!-- Record Name and Type -->
            <div class="flex items-center gap-2 mb-2">
              <p
                class="text-sm font-medium text-gray-900 dark:text-white truncate"
              >
                {{ linkedRecord.id }}
              </p>
              <span
                class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
              >
                {{ linkedRecord.type }}
              </span>
            </div>

            <!-- Record Details -->
            <div class="space-y-1">
              <p class="text-xs text-gray-500 font-mono">
                ID: {{ linkedRecord.id }}
              </p>
              <p v-if="linkedRecord.path" class="text-xs text-gray-500">
                Path: {{ linkedRecord.path }}
              </p>
            </div>

            <!-- Category and Description -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <UFormField v-if="editable" label="Category">
                <USelectMenu
                  :model-value="linkedRecord.category"
                  :items="getLinkCategoryOptions()"
                  placeholder="Select category"
                  @update:model-value="
                    (value) => updateLinkCategory(index, value)
                  "
                  class="w-full"
                />
              </UFormField>
              <div v-else-if="linkedRecord.category" class="text-xs">
                <span class="font-medium text-gray-700 dark:text-gray-300"
                  >Category:</span
                >
                <span class="ml-1 text-gray-600 dark:text-gray-400">{{
                  linkedRecord.category
                }}</span>
              </div>

              <UFormField v-if="editable" label="Description">
                <UInput
                  :model-value="linkedRecord.description || ''"
                  placeholder="Optional description"
                  @update:model-value="
                    (value) => updateLinkDescription(index, value)
                  "
                  class="w-full"
                />
              </UFormField>
              <div v-else-if="linkedRecord.description" class="text-xs">
                <span class="font-medium text-gray-700 dark:text-gray-300"
                  >Description:</span
                >
                <span class="ml-1 text-gray-600 dark:text-gray-400">{{
                  linkedRecord.description
                }}</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 ml-4">
            <UButton
              icon="i-lucide-external-link"
              color="primary"
              variant="ghost"
              size="xs"
              @click="openInNewTab(linkedRecord)"
              title="Open in new tab"
            />
            <UButton
              v-if="editable"
              icon="i-lucide-x"
              color="error"
              variant="ghost"
              size="xs"
              @click="removeLink(index)"
              title="Remove link"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import RecordLinkSelector from './RecordLinkSelector.vue';

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
