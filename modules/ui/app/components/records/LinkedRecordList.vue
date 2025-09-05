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
        class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3"
      >
        <!-- Record Info -->
        <div class="flex items-center space-x-3">
          <!-- Record Icon -->
          <div class="flex-shrink-0">
            <UIcon name="i-lucide-file-text" class="w-8 h-8 text-gray-400" />
          </div>

          <!-- Record Details -->
          <div class="flex-1 min-w-0">
            <p
              class="text-sm font-medium text-gray-900 dark:text-white truncate"
            >
              {{ linkedRecord.id }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Type: {{ linkedRecord.type }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Path: {{ linkedRecord.path }}
            </p>
          </div>

          <!-- Open in new tab link -->
          <div class="flex-shrink-0">
            <UButton
              color="primary"
              variant="ghost"
              size="xs"
              @click="openInNewTab(linkedRecord)"
            >
              <UIcon name="i-lucide-external-link" class="w-3 h-3" />
            </UButton>
          </div>

          <!-- Remove Link -->
          <div v-if="editable" class="flex-shrink-0">
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              @click="removeLink(index)"
            >
              <UIcon name="i-lucide-trash-2" class="w-3 h-3" />
            </UButton>
          </div>
        </div>

        <!-- Structured Form Fields -->
        <div v-if="editable" class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <UFormField label="Category">
            <USelectMenu
              :model-value="linkedRecord.category"
              :items="getLinkCategoryOptions()"
              placeholder="Select category"
              @update:model-value="(value) => updateLinkCategory(index, value)"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Description">
            <UInput
              :model-value="linkedRecord.description || ''"
              placeholder="Optional description"
              @update:model-value="
                (value) => updateLinkDescription(index, value)
              "
              class="w-full"
            />
          </UFormField>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div v-if="linkedRecord.category" class="text-xs">
            <span class="font-medium">Category:</span>
          </div>
          <div v-if="linkedRecord.description" class="text-xs">
            <span class="font-medium">Description:</span>
            {{ linkedRecord.description }}
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
