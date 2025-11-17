<template>
  <div class="record-link-selector w-96 max-h-96 overflow-hidden flex flex-col">
    <!-- Header -->
    <div
      class="border-b border-gray-200 dark:border-gray-800 p-4 flex-shrink-0"
    >
      <div class="space-y-3">
        <h3 class="font-medium text-gray-900 dark:text-white">Link Records</h3>

        <!-- Search -->
        <UInput
          v-model="searchQuery"
          placeholder="Search records..."
          icon="i-lucide-search"
          @input="searchRecords"
          class="w-full"
        />
      </div>
    </div>

    <!-- Record List -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading State -->
      <div v-if="loading" class="p-6 text-center">
        <UIcon
          name="i-lucide-loader-2"
          class="w-6 h-6 animate-spin mx-auto mb-2"
        />
        <p class="text-sm text-gray-500">Loading records...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="records.length === 0" class="p-6 text-center">
        <UIcon
          name="i-lucide-file-text"
          class="w-8 h-8 text-gray-400 mx-auto mb-2"
        />
        <p class="text-sm text-gray-500">No records found</p>
      </div>

      <!-- Record List -->
      <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
        <div
          v-for="record in records"
          :key="record.id"
          class="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center space-x-3"
          :class="{
            'bg-blue-50 dark:bg-blue-900/20': isRecordSelected(record.id),
          }"
          @click="toggleRecordSelection(record)"
        >
          <!-- Record Icon -->
          <div class="flex-shrink-0">
            <UIcon name="i-lucide-file-text" class="w-5 h-5 text-gray-400" />
          </div>

          <!-- Record Info -->
          <div class="flex-1 min-w-0">
            <p
              class="text-sm font-medium text-gray-900 dark:text-white truncate"
            >
              {{ record.title }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ record.type }} • {{ formatDate(record.created_at) }}
            </p>
          </div>

          <!-- Selection Indicator -->
          <div v-if="isRecordSelected(record.id)" class="flex-shrink-0">
            <UIcon name="i-lucide-check" class="w-4 h-4 text-blue-600" />
          </div>
        </div>
      </div>
    </div>

    <!-- Footer with Actions -->
    <div
      class="border-t border-gray-200 dark:border-gray-800 p-4 flex-shrink-0"
    >
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-500">
          {{ selectedRecords.length }} selected
        </span>
        <div class="flex space-x-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            @click="clearSelection"
          >
            Clear
          </UButton>
          <UButton
            color="primary"
            size="sm"
            @click="confirmSelection"
            :disabled="selectedRecords.length === 0"
          >
            Add Links
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';

interface LinkedRecord {
  id: string;
  type: string;
  description: string;
  path?: string;
  category?: string;
}

interface Props {
  modelValue: LinkedRecord[];
  excludeIds?: string[];
}

interface Emits {
  (e: 'update:modelValue', value: LinkedRecord[]): void;
  (e: 'close'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Store
const recordsStore = useRecordsStore();
const { getLinkCategoryOptions, fetchLinkCategories } = useLinkCategories();

// State
const searchQuery = ref('');
const selectedRecords = ref<CivicRecord[]>([]);

// Computed
const isRecordSelected = (recordId: string) => {
  return selectedRecords.value.some((record) => record.id === recordId);
};

const records = computed(() => {
  // Filter out excluded records
  return recordsStore.records.filter(
    (record) => !props.excludeIds?.includes(record.id)
  );
});

const loading = computed(() => recordsStore.loading);

// Methods
const searchRecords = async () => {
  if (!searchQuery.value.trim()) {
    // Load initial records when search is empty
    await recordsStore.loadInitialRecords();
    return;
  }

  await recordsStore.searchRecords(searchQuery.value);
};

const toggleRecordSelection = (record: CivicRecord) => {
  const index = selectedRecords.value.findIndex((r) => r.id === record.id);
  if (index > -1) {
    selectedRecords.value.splice(index, 1);
  } else {
    selectedRecords.value.push(record);
  }
};

const clearSelection = () => {
  selectedRecords.value = [];
};

const confirmSelection = () => {
  const defaultCategory = getLinkCategoryOptions()[0]?.value || 'related';
  const newLinkedRecords: LinkedRecord[] = selectedRecords.value.map(
    (record) => ({
      id: record.id,
      type: record.type,
      description: ``,
      path: `/records/${record.type}/${record.id}`,
      category: defaultCategory,
    })
  );

  const updatedLinks = [...props.modelValue, ...newLinkedRecords];
  emit('update:modelValue', updatedLinks);
  emit('close');
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

// Initialize with recent records and categories
onMounted(async () => {
  await Promise.all([recordsStore.loadInitialRecords(), fetchLinkCategories()]);
});
</script>
