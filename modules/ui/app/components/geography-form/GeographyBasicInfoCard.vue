<template>
  <UCard>
    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Left Column -->
        <div class="space-y-4">
          <UFormField
            :label="t('common.name')"
            name="name"
            :error="formErrors.name"
            required
          >
            <UInput
              :model-value="form.name"
              @update:model-value="(val: string) => (form.name = val)"
              :placeholder="t('geography.namePlaceholder')"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('common.description')"
            name="description"
            :error="formErrors.description"
            required
          >
            <UTextarea
              :model-value="form.description"
              @update:model-value="(val: string) => (form.description = val)"
              :placeholder="t('geography.descriptionPlaceholder')"
              :disabled="saving"
              :rows="3"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Right Column -->
        <div class="space-y-4">
          <UFormField
            :label="t('common.category')"
            name="category"
            :error="formErrors.category"
            required
          >
            <USelectMenu
              :model-value="form.category"
              @update:model-value="onCategoryUpdate"
              :items="categoryOptions"
              :placeholder="t('geography.selectCategory')"
              :disabled="saving"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('geography.srid')"
            name="srid"
            :error="formErrors.srid"
          >
            <UInput
              :model-value="form.srid"
              @update:model-value="onSridUpdate"
              type="number"
              :placeholder="t('geography.sridPlaceholder')"
              :disabled="saving"
              class="w-full"
            />
            <template #help>
              <p class="text-sm text-gray-600">
                {{ t('geography.sridHelp') }}
              </p>
            </template>
          </UFormField>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import type {
  GeographyCategory,
  GeographyFormData,
  GeographyFormErrors,
} from '~/types/geography';

interface SelectOption {
  label: string;
  value: string;
}

const props = defineProps({
  form: {
    type: Object as PropType<GeographyFormData>,
    required: true,
  },
  formErrors: {
    type: Object as PropType<GeographyFormErrors>,
    required: true,
  },
  saving: {
    type: Boolean,
    required: true,
  },
  categoryOptions: {
    type: Array as PropType<SelectOption[]>,
    required: true,
  },
});

const { t } = useI18n();

const onCategoryUpdate = (val: GeographyCategory) => {
  props.form.category = val;
};

const onSridUpdate = (val: string | number) => {
  props.form.srid = typeof val === 'number' ? val : Number(val);
};
</script>
