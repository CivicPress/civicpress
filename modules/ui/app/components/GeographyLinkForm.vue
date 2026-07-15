<template>
  <div class="space-y-4">
    <!-- Current Links -->
    <div v-if="linkedFiles.length > 0" class="space-y-3">
      <div
        v-for="(link, index) in linkedFiles"
        :key="link.id"
        class="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-white dark:bg-gray-800"
      >
        <!-- Top: Title and Actions -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ link.name }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <p class="text-xs text-gray-500 font-mono truncate">
                {{ link.id }}
              </p>
              <span
                v-if="link.category"
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex-shrink-0"
              >
                {{ link.category }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0 -mt-2 -mr-2">
            <UButton
              icon="i-lucide-external-link"
              variant="ghost"
              size="xs"
              @click="() => handlePreview(link)"
              :disabled="disabled"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              color="error"
              @click="removeLink(index)"
              :disabled="disabled"
            />
          </div>
        </div>

        <!-- Bottom: Content (Full Width) -->
        <div class="space-y-2">
          <UFormField :label="t('common.description')" size="xs">
            <UInput
              :model-value="link.description || ''"
              @update:model-value="
                (val) => {
                  const updated = { ...link, description: val };
                  updateLink(index, updated);
                }
              "
              :disabled="disabled"
              size="xs"
              :placeholder="t('records.attachments.optionalDescription')"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
    >
      <UIcon name="i-lucide-map" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
      <p class="text-sm text-gray-500">
        {{ t('records.geography.noLinkedGeographyFiles') }}
      </p>
    </div>

    <!-- Preview Modal -->
    <UModal
      v-model:open="showPreview"
      :title="previewFile?.name || t('records.geography.filePreview')"
    >
      <template #body>
        <div v-if="previewFile" class="space-y-4">
          <div class="flex items-center gap-2">
            <UBadge
              :color="getCategoryColor(previewFile.category || '')"
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
            v-if="previewGeographyData"
            class="h-96 rounded-lg overflow-hidden border"
          >
            <GeographyMap
              :geography-data="previewGeographyData"
              :bounds="previewFile.bounds"
              :interactive="true"
              height="100%"
            />
          </div>

          <div
            class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800"
          >
            <UButton
              color="neutral"
              variant="ghost"
              @click="showPreview = false"
            >
              {{ t('common.close') }}
            </UButton>
            <UButton color="primary" @click="selectPreviewFile">
              {{ t('records.geography.selectThisFile') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { GeographyFile } from '~/types/geography';
import GeographyMap from './GeographyMap.vue';

// Composables
const { t } = useI18n();

// Props
interface LinkStats {
  featureCount?: number;
}

interface GeographyLink {
  id: string;
  name: string;
  description?: string;
  type?: string;
  category?: string;
  created_at?: string;
  stats?: LinkStats;
}

interface Props {
  modelValue: GeographyLink[];
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: GeographyLink[]];
}>();

// State
const showPreview = ref(false);
const previewFile = ref<GeographyFile | null>(null);
const selectedIds = ref<string[]>([]);

// Debug: watch selectedIds changes
watch(
  selectedIds,
  () => {
    // Watch for selectedIds changes
  },
  { deep: true }
);

// Computed
const linkedFiles = computed(() => props.modelValue);

// Preview file may have a non-standard `geographyData` field attached by the
// upstream loader; expose it via a typed accessor instead of casting in template.
const previewGeographyData = computed(() => {
  const f = previewFile.value as (GeographyFile & { geographyData?: unknown }) | null;
  return f?.geographyData;
});

// Methods
type UiBadgeColor = 'error' | 'primary' | 'neutral';
const getCategoryColor = (category: string): UiBadgeColor => {
  const colors: Record<string, UiBadgeColor> = {
    Reference: 'primary',
    Financial: 'primary',
    Legal: 'primary',
    Planning: 'primary',
    Environmental: 'primary',
    Infrastructure: 'neutral',
  };
  return colors[category] || 'neutral';
};

const updateLink = (index: number, link: GeographyLink) => {
  const updatedLinks = [...props.modelValue];
  updatedLinks[index] = { ...link };
  emit('update:modelValue', updatedLinks);
};

const removeLink = (index: number) => {
  const updatedLinks = props.modelValue.filter((_, i) => i !== index);
  emit('update:modelValue', updatedLinks);
};

const handlePreview = (file: GeographyFile | GeographyLink) => {
  // previewFile is typed as GeographyFile; the link shape doesn't include
  // all fields but only the ones the preview pane uses, so the cast is safe.
  previewFile.value = file as GeographyFile;
  showPreview.value = true;
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
