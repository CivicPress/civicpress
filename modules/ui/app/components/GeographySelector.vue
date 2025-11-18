<template>
  <div
    class="geography-selector-popover w-96 max-h-96 overflow-hidden flex flex-col"
    @click.stop
  >
    <!-- Header -->
    <div
      class="border-b border-gray-200 dark:border-gray-800 p-4 flex-shrink-0"
    >
      <div class="space-y-3">
        <h3 class="font-medium text-gray-900 dark:text-white">
          {{ t('records.geography.selectGeographyFiles') }}
        </h3>

        <!-- Search and Filter -->
        <div class="space-y-2">
          <UInput
            v-model="searchQuery"
            :placeholder="t('records.geography.searchPlaceholder')"
            icon="i-lucide-search"
            class="w-full"
          />
          <USelectMenu
            v-model="selectedCategory"
            :options="categoryOptions"
            :placeholder="t('records.geography.allCategories')"
            class="w-full"
          />
        </div>
      </div>
    </div>

    <!-- Geography Files List -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading State -->
      <div v-if="loading" class="p-6 text-center">
        <UIcon
          name="i-lucide-loader-2"
          class="w-6 h-6 animate-spin mx-auto mb-2"
        />
        <p class="text-sm text-gray-500">
          {{ t('records.geography.loading') }}
        </p>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        :title="error"
        color="error"
        variant="soft"
        class="m-4"
      />

      <!-- Geography Files List -->
      <div
        v-else-if="filteredFiles.length > 0"
        class="divide-y divide-gray-200 dark:divide-gray-700"
      >
        <div
          v-for="file in filteredFiles"
          :key="file.id"
          class="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center space-x-3"
          :class="{ 'bg-blue-50 dark:bg-blue-900/20': isSelected(file.id) }"
          @click.stop="toggleSelection(file)"
        >
          <!-- File Icon -->
          <div class="flex-shrink-0">
            <UIcon name="i-lucide-map" class="w-5 h-5 text-gray-400" />
          </div>

          <!-- File Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <p
                class="text-sm font-medium text-gray-900 dark:text-white truncate"
              >
                {{ file.name }}
              </p>
              <UBadge
                :color="getCategoryColor(file.category) as any"
                variant="soft"
                size="xs"
              >
                {{ file.category }}
              </UBadge>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ file.type.toUpperCase() }} • {{ formatDate(file.created_at) }}
            </p>
            <p
              v-if="file.description"
              class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1"
            >
              {{ file.description }}
            </p>
          </div>

          <!-- Selection Indicator -->
          <div v-if="isSelected(file.id)" class="flex-shrink-0">
            <UIcon name="i-lucide-check" class="w-4 h-4 text-blue-600" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="p-6 text-center">
        <UIcon name="i-lucide-map" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p class="text-sm text-gray-500">
          {{
            searchQuery
              ? t('records.geography.noFilesFound')
              : t('records.geography.noFilesAvailable')
          }}
        </p>
        <UButton
          v-if="!searchQuery"
          color="primary"
          variant="outline"
          size="sm"
          class="mt-3"
          @click="$emit('create-new')"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          {{ t('records.geography.createGeographyFile') }}
        </UButton>
      </div>
    </div>

    <!-- Footer with Actions -->
    <div
      class="border-t border-gray-200 dark:border-gray-800 p-4 flex-shrink-0"
    >
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-500">
          {{
            (t as any)('common.selected', selectedFiles.length, {
              count: selectedFiles.length,
            })
          }}
        </span>
        <div class="flex space-x-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            @click="clearSelection"
          >
            {{ t('common.clear') }}
          </UButton>
          <UButton
            color="primary"
            size="sm"
            @click.stop="confirmSelection"
            :disabled="selectedFiles.length === 0"
          >
            {{ t('common.link') }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import type { GeographyFile, GeographyCategory } from '~/types/geography';

// Props
// Note: For v-model:selected-ids, Vue converts kebab-case to camelCase
// So the prop is 'selectedIds' but the event is 'update:selected-ids'
interface Props {
  selectedIds?: string[];
  multiple?: boolean;
  showPreview?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectedIds: () => [] as string[],
  multiple: true,
  showPreview: true,
});

// Emits
const emit = defineEmits<{
  'update:selected-ids': [ids: string[]];
  'selection-change': [files: GeographyFile[]];
  preview: [file: GeographyFile];
  'create-new': [];
}>();

// State
const loading = ref(false);
const error = ref<string | null>(null);
const geographyFiles = ref<GeographyFile[]>([]);
const searchQuery = ref('');
const selectedCategory = ref<string | null>(null);

// Computed
const { t } = useI18n();

const categoryOptions = computed(() => {
  const categories = new Set(
    geographyFiles.value.map((file: GeographyFile) => file.category)
  );
  return [
    { label: t('records.geography.allCategories'), value: null },
    ...Array.from(categories).map((category: GeographyCategory) => ({
      label: category,
      value: category,
    })),
  ];
});

const filteredFiles = computed(() => {
  let filtered = geographyFiles.value;

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      (file: GeographyFile) =>
        file.name.toLowerCase().includes(query) ||
        file.description?.toLowerCase().includes(query) ||
        file.category.toLowerCase().includes(query)
    );
  }

  // Filter by category
  if (selectedCategory.value) {
    filtered = filtered.filter(
      (file: GeographyFile) => file.category === selectedCategory.value
    );
  }

  return filtered;
});

const selectedFiles = computed(() => {
  return geographyFiles.value.filter((file: GeographyFile) =>
    props.selectedIds.includes(file.id)
  );
});

// Methods
const isSelected = (fileId: string) => {
  const ids = props.selectedIds || [];
  const result = ids.includes(fileId);
  return result;
};

const toggleSelection = (file: GeographyFile) => {
  if (props.multiple) {
    const currentIds = props.selectedIds || [];
    const newIds = isSelected(file.id)
      ? currentIds.filter((id) => id !== file.id)
      : [...currentIds, file.id];

    emit('update:selected-ids', newIds);
  } else {
    const newIds = isSelected(file.id) ? [] : [file.id];
    emit('update:selected-ids', newIds);
  }
};

const removeSelection = (fileId: string) => {
  const newIds = props.selectedIds.filter((id) => id !== fileId);
  emit('update:selected-ids', newIds);
};

const previewFile = (file: GeographyFile) => {
  emit('preview', file);
};

const confirmSelection = () => {
  emit('selection-change', selectedFiles.value);
};

const clearSelection = () => {
  emit('update:selected-ids', []);
};

const getCategoryColor = (category: string) => {
  const colors = {
    Reference: 'blue',
    Financial: 'green',
    Legal: 'purple',
    Planning: 'orange',
    Environmental: 'emerald',
    Infrastructure: 'gray',
  };
  return colors[category as keyof typeof colors] || 'neutral';
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

// Load geography files
const loadGeographyFiles = async () => {
  try {
    loading.value = true;
    error.value = null;

    const response = (await useNuxtApp().$civicApi('/api/v1/geography')) as any;

    if (response.success && response.data?.files) {
      geographyFiles.value = response.data.files;
    } else {
      error.value = t('records.geography.failedToLoad');
    }
  } catch (err) {
    console.error('Error loading geography files:', err);
    error.value = t('records.geography.failedToLoad');
  } finally {
    loading.value = false;
  }
};

// Watch for changes in selectedIds prop
watch(
  () => props.selectedIds,
  (newIds) => {
    // Watch for prop changes
  },
  { deep: true, immediate: true }
);

// Load data on mount
onMounted(() => {
  loadGeographyFiles();
});
</script>
