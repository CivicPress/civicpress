<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">
            {{ t('geography.colorIconConfiguration') }}
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{ t('geography.customizeFeaturesAppearance') }}
          </p>
        </div>
      </div>
    </template>
    <div class="space-y-6">
      <!-- Preset Selection -->
      <div
        class="space-y-3 border-b border-gray-200 dark:border-gray-800 pb-4"
      >
        <h4 class="text-md font-medium">{{ t('geography.applyPreset') }}</h4>
        <div class="flex items-center gap-3">
          <USelectMenu
            :model-value="selectedPreset"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            @update:model-value="(val: any) => $emit('update:selected-preset', val)"
            :items="presetOptions"
            :placeholder="t('geography.selectPreset')"
            value-key="key"
            option-label="name"
            option-description="description"
            class="flex-1"
            @change="$emit('preset-selected')"
          />
          <UButton
            v-if="selectedPreset"
            size="sm"
            color="primary"
            variant="outline"
            @click="$emit('apply-preset')"
          >
            {{ t('geography.apply') }}
          </UButton>
        </div>
      </div>
      <!-- Color Mapping Section -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h4 class="text-md font-medium">
            {{ t('geography.colorMapping') }}
          </h4>
          <UButton
            v-if="form.color_mapping"
            size="xs"
            color="error"
            variant="ghost"
            @click="form.color_mapping = undefined"
          >
            {{ t('geography.clear') }}
          </UButton>
        </div>

        <div v-if="!form.color_mapping" class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('geography.assignColorsToFeatures') }}
          </p>
          <UButton
            size="sm"
            color="primary"
            variant="outline"
            @click="$emit('initialize-color-mapping')"
          >
            <UIcon name="i-lucide-palette" class="w-4 h-4" />
            {{ t('geography.configureColors') }}
          </UButton>
        </div>

        <div v-else class="space-y-4">
          <UFormField
            :label="t('geography.propertyName')"
            name="color_property"
          >
            <UInput
              v-model="form.color_mapping.property"
              :placeholder="t('geography.propertyNameExample')"
              @input="$emit('update-color-mapping')"
            />
            <template #help>
              <p class="text-sm text-gray-600">
                {{ t('geography.colorMappingHelp') }}
              </p>
            </template>
          </UFormField>

          <div v-if="colorPropertyValues.length > 0" class="space-y-2">
            <label class="text-sm font-medium">{{
              t('geography.colorAssignments')
            }}</label>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="value in colorPropertyValues"
                :key="value"
                class="flex items-center gap-2"
              >
                <span
                  class="text-sm text-gray-700 dark:text-gray-300 flex-1"
                  >{{ value }}</span
                >
                <input
                  v-model="form.color_mapping.colors[value]"
                  type="color"
                  class="w-12 h-8 rounded border border-gray-300 cursor-pointer"
                  @change="$emit('update-color-mapping')"
                />
                <UInput
                  v-model="form.color_mapping.colors[value]"
                  type="text"
                  placeholder="#3b82f6"
                  class="w-24 text-xs"
                  @input="$emit('update-color-mapping')"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Icon Mapping Section (Phase 1 - Basic) -->
      <div
        class="space-y-4 border-t border-gray-200 dark:border-gray-800 pt-4"
      >
        <div class="flex items-center justify-between">
          <h4 class="text-md font-medium">
            {{ t('geography.iconMapping') }}
          </h4>
          <UButton
            v-if="form.icon_mapping"
            size="xs"
            color="error"
            variant="ghost"
            @click="form.icon_mapping = undefined"
          >
            {{ t('geography.clear') }}
          </UButton>
        </div>

        <div v-if="!form.icon_mapping" class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('geography.assignIconsToFeatures') }}
          </p>
          <UButton
            size="sm"
            color="primary"
            variant="outline"
            @click="$emit('initialize-icon-mapping')"
          >
            <UIcon name="i-lucide-image" class="w-4 h-4" />
            {{ t('geography.configureIcons') }}
          </UButton>
        </div>

        <div v-else class="space-y-4">
          <UFormField
            :label="t('geography.propertyName')"
            name="icon_property"
          >
            <UInput
              v-model="form.icon_mapping.property"
              :placeholder="t('geography.propertyNameExample')"
              @input="$emit('update-icon-mapping')"
            />
            <template #help>
              <p class="text-sm text-gray-600">
                {{ t('geography.iconMappingHelp') }}
              </p>
            </template>
          </UFormField>

          <UFormField :label="t('geography.applyToGeometryTypes')">
            <USelectMenu
              v-model="form.icon_mapping.apply_to"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              :items="geometryTypeOptions as any"
              multiple
              :placeholder="t('geography.selectGeometryTypes')"
            />
            <template #help>
              <p class="text-sm text-gray-600">
                {{ t('geography.iconGeometryTypesHelp') }}
              </p>
            </template>
          </UFormField>

          <div v-if="iconPropertyValues.length > 0" class="space-y-2">
            <label class="text-sm font-medium">{{
              t('geography.iconAssignments')
            }}</label>
            <div class="space-y-3">
              <div
                v-for="value in iconPropertyValues"
                :key="value"
                class="flex items-center gap-2"
              >
                <span class="text-sm text-gray-700 dark:text-gray-300 w-32">{{
                  value
                }}</span>
                <UInput
                  :model-value="form.icon_mapping?.icons?.[value]?.url || ''"
                  @update:model-value="
                    (val: string) => {
                      if (!form.icon_mapping) {
                        form.icon_mapping = { icons: {}, type: 'property' };
                      }
                      if (!form.icon_mapping.icons[value]) {
                        form.icon_mapping.icons[value] = { url: '' };
                      }
                      form.icon_mapping.icons[value].url = val;
                      $emit('update-icon-mapping');
                    }
                  "
                  type="text"
                  :placeholder="t('geography.iconUrlPlaceholder')"
                  class="flex-1 text-xs"
                />
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
import type { GeographyFormData } from '~/types/geography';

interface SelectOption {
  label: string;
  value: string;
}

interface PresetOption {
  key: string | null;
  label: string;
  name: string;
  description: string;
}

defineProps({
  form: {
    type: Object as PropType<GeographyFormData>,
    required: true,
  },
  selectedPreset: {
    type: String as PropType<string | null>,
    default: null,
  },
  presetOptions: {
    type: Array as PropType<PresetOption[]>,
    required: true,
  },
  geometryTypeOptions: {
    type: Array as PropType<SelectOption[]>,
    required: true,
  },
  colorPropertyValues: {
    type: Array as PropType<string[]>,
    required: true,
  },
  iconPropertyValues: {
    type: Array as PropType<string[]>,
    required: true,
  },
});

defineEmits<{
  'update:selected-preset': [value: string | null];
  'preset-selected': [];
  'apply-preset': [];
  'initialize-color-mapping': [];
  'update-color-mapping': [];
  'initialize-icon-mapping': [];
  'update-icon-mapping': [];
}>();

const { t } = useI18n();
</script>
