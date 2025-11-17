<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Create Geography File</h1>
        </template>
        <template #description>
          Add new geographic data to the system
        </template>
        <template #right>
          <UButton color="neutral" variant="ghost" @click="router.back()">
            <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
            Back
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
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="geographyFormRef?.saving"
            :disabled="!geographyFormRef?.isFormValid"
            @click="geographyFormRef?.handleSubmit"
          >
            Create Geography File
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

// Form reference
const geographyFormRef = ref<InstanceType<typeof GeographyForm> | null>(null);

// Breadcrumbs
const breadcrumbItems = [
  { label: 'Home', to: '/' },
  { label: 'Geography', to: '/geography' },
  { label: 'Create Geography File' },
];

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
