<template>
  <div class="space-y-4">
    <!-- Current Links -->
    <div v-if="linkedFiles.length > 0" class="space-y-3">
      <div class="flex items-center justify-end mb-4">
        <UPopover
          :popper="{ placement: 'bottom-end' }"
          :close-on-click-outside="true"
        >
          <UButton color="primary" variant="outline" icon="i-lucide-plus">
            Add Geography Files
          </UButton>

          <template #content>
            <GeographySelector
              :selected-ids="selectedIds"
              :multiple="true"
              @update:selected-ids="
                (ids) => {
                  selectedIds = ids;
                  console.log('Manual update:', ids);
                }
              "
              @selection-change="handleSelectionConfirm"
              @preview="handlePreview"
              @create-new="handleCreateNew"
            />
          </template>
        </UPopover>
      </div>
      <div
        v-for="(link, index) in linkedFiles"
        :key="link.id"
        class="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <h4 class="font-medium text-gray-900 dark:text-gray-100">
                {{ link.name }}
              </h4>
              <UBadge color="primary" variant="soft">
                {{ link.category }}
              </UBadge>
            </div>

            <!-- Description Input -->
            <UInput
              v-model="link.description"
              placeholder="Add a description for this geography file..."
              class="mb-2"
              @input="updateLink(index, link)"
            />

            <!-- File Info -->
            <div
              class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500"
            >
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-file" class="w-3 h-3" />
                {{ link.type?.toUpperCase() || 'UNKNOWN' }}
              </span>
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-calendar" class="w-3 h-3" />
                {{
                  link.created_at ? formatDate(link.created_at) : 'Unknown date'
                }}
              </span>
              <span v-if="link.stats" class="flex items-center gap-1">
                <UIcon name="i-lucide-map-pin" class="w-3 h-3" />
                {{ link.stats.featureCount }} features
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 ml-4">
            <!-- Preview Button -->
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              @click="previewFile(link)"
            >
              <UIcon name="i-lucide-eye" class="w-4 h-4" />
            </UButton>

            <!-- Remove Button -->
            <UButton
              size="sm"
              color="error"
              variant="ghost"
              @click="removeLink(index)"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
    >
      <UIcon name="i-lucide-map" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        No geography files linked
      </h4>
      <p class="text-gray-600 dark:text-gray-400">
        Link geography files to provide spatial context for this record.
      </p>
    </div>

    <!-- Preview Modal -->
    <UModal
      v-model:open="showPreview"
      :title="previewFile?.name || 'Geography File Preview'"
    >
      <template #body>
        <div v-if="previewFile" class="space-y-4">
          <div class="flex items-center gap-2">
            <UBadge
              :color="getCategoryColor(previewFile.category)"
              variant="soft"
            >
              {{ previewFile.category }}
            </UBadge>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ previewFile.type.toUpperCase() }}
            </span>
          </div>

          <p
            v-if="previewFile.description"
            class="text-gray-700 dark:text-gray-300"
          >
            {{ previewFile.description }}
          </p>

          <div
            v-if="previewFile.geographyData"
            class="h-96 rounded-lg overflow-hidden border"
          >
            <GeographyMap
              :geography-data="previewFile.geographyData"
              :bounds="previewFile.bounds"
              :interactive="true"
              height="100%"
            />
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showPreview = false"
            >
              Close
            </UButton>
            <UButton color="primary" @click="selectPreviewFile">
              Select This File
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { GeographyFile } from '@civicpress/core';
import GeographySelector from './GeographySelector.vue';
import GeographyMap from './GeographyMap.vue';

// Props
interface Props {
  modelValue: Array<{
    id: string;
    name: string;
    description?: string;
    type?: string;
    category?: string;
    created_at?: string;
    stats?: any;
  }>;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  'update:modelValue': [
    value: Array<{
      id: string;
      name: string;
      description?: string;
      type?: string;
      category?: string;
      created_at?: string;
      stats?: any;
    }>,
  ];
}>();

// State
const showPreview = ref(false);
const previewFile = ref<GeographyFile | null>(null);
const selectedIds = ref<string[]>([]);

// Debug: watch selectedIds changes
watch(
  selectedIds,
  (newIds) => {
    console.log('GeographyLinkForm: selectedIds changed to:', newIds);
  },
  { deep: true }
);

// Computed
const linkedFiles = computed(() => props.modelValue);

// Methods
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

const updateLink = (index: number, link: any) => {
  const updatedLinks = [...props.modelValue];
  updatedLinks[index] = { ...link };
  emit('update:modelValue', updatedLinks);
};

const removeLink = (index: number) => {
  const updatedLinks = props.modelValue.filter((_, i) => i !== index);
  emit('update:modelValue', updatedLinks);
};

// Note: v-model:selected-ids automatically handles the binding
// We don't need a separate handler for update:selected-ids

const handleSelectionConfirm = (files: GeographyFile[]) => {
  // Add selected files that aren't already linked
  const newLinks = files
    .filter((file) => !props.modelValue.some((link) => link.id === file.id))
    .map((file) => ({
      id: file.id,
      name: file.name,
      description: file.description || '',
      type: file.type,
      category: file.category,
      created_at: file.created_at,
      stats: file.stats,
    }));

  if (newLinks.length > 0) {
    const updatedLinks = [...props.modelValue, ...newLinks];
    emit('update:modelValue', updatedLinks);
  }

  // Clear selection after adding
  selectedIds.value = [];
};

const handlePreview = (file: GeographyFile) => {
  previewFile.value = file;
  showPreview.value = true;
};

const handleCreateNew = () => {
  // Emit event to parent to handle creating new geography file
  // This would typically navigate to the geography creation page
  // For now, we'll navigate to the geography creation page
  useRouter().push('/geography/create');
};

const selectPreviewFile = () => {
  if (previewFile.value) {
    const newLink = {
      id: previewFile.value.id,
      name: previewFile.value.name,
      description: previewFile.value.description || '',
    };

    // Check if already linked
    const isAlreadyLinked = props.modelValue.some(
      (link) => link.id === newLink.id
    );
    if (!isAlreadyLinked) {
      const updatedLinks = [...props.modelValue, newLink];
      emit('update:modelValue', updatedLinks);
    }

    showPreview.value = false;
    previewFile.value = null;
  }
};

// Watch for changes in modelValue to update selectedIds
watch(
  () => props.modelValue,
  (newValue) => {
    selectedIds.value = newValue.map((link) => link.id);
  },
  { immediate: true }
);
</script>
