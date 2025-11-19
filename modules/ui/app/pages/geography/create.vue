<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('geography.createGeography') }}
          </h1>
        </template>
        <template #description>
          {{ t('geography.addNewGeographicData') }}
        </template>
        <template #right>
          <UButton color="neutral" variant="ghost" @click="router.back()">
            <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
            {{ t('geography.back') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <GeographyForm
          ref="geographyFormRef"
          mode="create"
          @success="handleSuccess"
          @cancel="handleCancel"
        />

        <!-- Form Actions -->
        <div
          class="flex justify-end gap-4 pt-6 border-t border-gray-200 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="ghost"
            @click="handleCancel"
            :disabled="geographyFormRef?.saving"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            color="primary"
            :loading="geographyFormRef?.saving"
            :disabled="!geographyFormRef?.isFormValid"
            @click="geographyFormRef?.handleSubmit"
          >
            {{ t('geography.createGeographyFile') }}
          </UButton>
        </div>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { GeographyFile } from '~/types/geography';
import GeographyForm from '~/components/GeographyForm.vue';
import SystemFooter from '~/components/SystemFooter.vue';

// Composables
const router = useRouter();
const { t } = useI18n();

// Form reference
const geographyFormRef = ref<InstanceType<typeof GeographyForm> | null>(null);

// Breadcrumbs
const breadcrumbItems = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('geography.title'), to: '/geography' },
  { label: t('geography.createGeography') },
]);

// Event handlers
const handleSuccess = (geographyFile: GeographyFile) => {
  // Navigate to the geography list after successful creation
  router.push('/geography');
};

const handleCancel = () => {
  // Navigate back to geography list
  router.push('/geography');
};
</script>
