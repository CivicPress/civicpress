<template>
  <UCard>
    <div class="space-y-4">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <!-- Text Input Area (Left) -->
        <div class="space-y-4">
          <UFormField
            :label="t('geography.fileType')"
            name="type"
            :error="formErrors.type"
            required
          >
            <USelectMenu
              :model-value="form.type"
              @update:model-value="(val: string | SelectOption | null | undefined) => (form.type = val as typeof form.type)"
              :items="typeOptions"
              :placeholder="t('geography.selectFileType')"
              :disabled="saving"
              value-key="value"
              @change="$emit('type-change')"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('geography.geographyContent')"
            name="content"
            :error="formErrors.content"
            required
          >
            <UTextarea
              :model-value="form.content"
              @update:model-value="(val: string) => (form.content = val)"
              :placeholder="t('geography.contentPlaceholder')"
              :disabled="saving"
              :rows="12"
              class="font-mono text-sm w-full"
              @input="$emit('content-change')"
            />
            <template #help>
              <p class="text-sm text-gray-600">
                {{
                  t('geography.contentHelp', {
                    type: formTypeLabel.toUpperCase(),
                  })
                }}
              </p>
            </template>
          </UFormField>

          <!-- Action Buttons -->
          <div class="flex gap-2">
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              @click="$emit('clear-content')"
              :disabled="saving || !form.content"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              {{ t('geography.clear') }}
            </UButton>
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              @click="$emit('copy-to-clipboard')"
              :disabled="saving || !form.content"
            >
              <UIcon name="i-lucide-copy" class="w-4 h-4" />
              {{ t('common.copy') }}
            </UButton>
          </div>
        </div>

        <!-- Live Preview (Right) -->
        <div class="flex flex-col space-y-4">
          <h4 class="text-md font-medium text-gray-900 dark:text-white">
            {{ t('geography.livePreview') }}
          </h4>

          <!-- Map Preview -->
          <div
            class="border rounded-lg flex-1 bg-gray-50 dark:bg-gray-800 min-h-[400px]"
          >
            <div
              v-if="preview.isLoading"
              class="flex items-center justify-center h-full"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="w-6 h-6 animate-spin text-gray-400"
              />
              <span class="ml-2 text-gray-600">{{
                t('geography.parsingContent')
              }}</span>
            </div>

            <div
              v-else-if="preview.error"
              class="flex items-center justify-center h-full"
            >
              <div class="text-center">
                <UIcon
                  name="i-lucide-alert-circle"
                  class="w-8 h-8 text-red-500 mx-auto mb-2"
                />
                <p class="text-sm text-red-600">{{ preview.error }}</p>
              </div>
            </div>

            <div v-else-if="preview.parsed" class="h-full">
              <GeographyMap
                :geography-data="preview.parsed.content"
                :bounds="preview.parsed.bounds"
                :interactive="true"
                height="100%"
                :color-mapping="form.color_mapping"
                :icon-mapping="form.icon_mapping"
              />
            </div>

            <div v-else class="flex items-center justify-center h-full">
              <div class="text-center">
                <UIcon
                  name="i-lucide-map"
                  class="w-8 h-8 text-gray-400 mx-auto mb-2"
                />
                <p class="text-sm text-gray-500">
                  {{ t('geography.enterContentForPreview') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Validation Results -->
          <div
            v-if="(preview?.validation?.errors?.length ?? 0) > 0"
            class="space-y-2"
          >
            <h5 class="text-sm font-medium text-red-600">
              {{ t('geography.validationErrors') }}:
            </h5>
            <ul class="text-sm text-red-600 space-y-1">
              <li
                v-for="error in preview.validation.errors"
                :key="error"
                class="flex items-start"
              >
                <UIcon
                  name="i-lucide-x-circle"
                  class="w-4 h-4 mt-0.5 mr-2 flex-shrink-0"
                />
                {{ error }}
              </li>
            </ul>
          </div>

          <div
            v-if="preview.validation.warnings.length > 0"
            class="space-y-2"
          >
            <h5 class="text-sm font-medium text-yellow-600">
              {{ t('geography.warnings') }}:
            </h5>
            <ul class="text-sm text-yellow-600 space-y-1">
              <li
                v-for="warning in preview.validation.warnings"
                :key="warning"
                class="flex items-start"
              >
                <UIcon
                  name="i-lucide-alert-triangle"
                  class="w-4 h-4 mt-0.5 mr-2 flex-shrink-0"
                />
                {{ warning }}
              </li>
            </ul>
          </div>

          <!-- Parsed Data Summary -->
          <div v-if="preview.parsed" class="space-y-2">
            <h5 class="text-sm font-medium text-gray-900 dark:text-white">
              {{ t('geography.dataSummary') }}:
            </h5>
            <div class="text-sm text-gray-600 space-y-1">
              <div class="flex justify-between">
                <span>{{ t('geography.features') }}:</span>
                <span class="font-medium">{{
                  preview.parsed.featureCount
                }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ t('geography.geometryTypesLabel') }}:</span>
                <span class="font-medium">{{
                  preview.parsed.geometryTypes.join(', ')
                }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ t('geography.srid') }}:</span>
                <span class="font-medium">{{ preview.parsed.srid }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ t('geography.bounds') }}:</span>
                <span class="font-medium text-xs">{{
                  formatBounds(preview.parsed.bounds)
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import GeographyMap from '~/components/GeographyMap.vue';
import type {
  GeographyFormData,
  GeographyFormErrors,
  GeographyPreviewData,
} from '~/types/geography';

interface SelectOption {
  label: string;
  value: string;
}

const form = defineModel<GeographyFormData>('form', { required: true });

defineProps({
  formErrors: {
    type: Object as PropType<GeographyFormErrors>,
    required: true,
  },
  preview: {
    type: Object as PropType<GeographyPreviewData>,
    required: true,
  },
  saving: {
    type: Boolean,
    required: true,
  },
  typeOptions: {
    type: Array as PropType<SelectOption[]>,
    required: true,
  },
  formatBounds: {
    type: Function as PropType<
      (bounds: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
      }) => string
    >,
    required: true,
  },
});

defineEmits<{
  'type-change': [];
  'content-change': [];
  'clear-content': [];
  'copy-to-clipboard': [];
}>();

const { t } = useI18n();

// Display label for the help text — `form.type` may be a plain string
// or a SelectOption-shaped object emitted by USelectMenu.
const formTypeLabel = computed(() => {
  const ft = form.value.type as string | { value?: string } | null | undefined;
  if (typeof ft === 'string') return ft;
  return ft?.value || 'geojson';
});
</script>
