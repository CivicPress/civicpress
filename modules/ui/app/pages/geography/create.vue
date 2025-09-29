<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-lg font-semibold">Create Geography File</h1>
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
          mode="create"
          @success="handleSuccess"
          @cancel="handleCancel"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { GeographyFile } from '@civicpress/core';

// Composables
const router = useRouter();

// Breadcrumbs
const breadcrumbItems = [
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
