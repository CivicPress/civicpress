<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Edit Geography File</h1>
        </template>
        <template #description> Update existing geographic data </template>
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

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-12">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-gray-400"
          />
          <span class="ml-3 text-gray-600">Loading geography file...</span>
        </div>

        <!-- Error State -->
        <UAlert v-else-if="error" :title="error" color="error" variant="soft">
          <template #actions>
            <UButton @click="router.push('/geography')">
              Back to Geography Files
            </UButton>
          </template>
        </UAlert>

        <!-- Edit Form -->
        <GeographyForm
          v-else
          ref="geographyFormRef"
          mode="edit"
          :geography-id="route.params.id as string"
          @success="handleSuccess"
          @cancel="handleCancel"
        />

        <!-- Form Actions -->
        <div
          v-if="!loading && !error"
          class="flex items-center justify-between gap-4 pt-6 border-t border-gray-200 dark:border-gray-800"
        >
          <!-- Delete Button (left side) -->
          <UButton
            v-if="canDeleteGeography"
            color="error"
            variant="outline"
            :disabled="geographyFormRef?.saving"
            @click="showDeleteModal = true"
          >
            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
            Delete
          </UButton>
          <div v-else></div>

          <!-- Save/Cancel Buttons (right side) -->
          <div class="flex items-center gap-4">
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
              Update Geography File
            </UButton>
          </div>
        </div>

        <!-- Footer -->
        <SystemFooter v-if="!loading && !error" />
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete Confirmation Modal -->
  <UModal
    v-model:open="showDeleteModal"
    title="Delete Geography File"
    description="This action cannot be undone."
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-gray-600 dark:text-gray-400">
          Are you sure you want to delete this geography file? This action
          cannot be undone.
        </p>
        <div class="flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            @click="showDeleteModal = false"
          >
            Cancel
          </UButton>
          <UButton color="error" :loading="deleting" @click="deleteFile">
            Delete
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import type { GeographyFile } from '~/types/geography';
import GeographyForm from '~/components/GeographyForm.vue';
import SystemFooter from '~/components/SystemFooter.vue';

// Composables
const router = useRouter();
const route = useRoute();

// State
const loading = ref(false);
const error = ref<string | null>(null);
const showDeleteModal = ref(false);
const deleting = ref(false);
const geographyFormRef = ref<InstanceType<typeof GeographyForm> | null>(null);

// Breadcrumbs
const breadcrumbItems = computed(() => [
  { label: 'Home', to: '/' },
  { label: 'Geography', to: '/geography' },
  { label: 'Edit Geography File' },
]);

// Computed properties
const canDeleteGeography = computed(() => {
  // Add auth store import if needed
  return true; // For now, allow all users to delete
});

// Event handlers
const handleSuccess = (geographyFile: GeographyFile) => {
  // Navigate to the geography file view after successful update
  router.push(`/geography/${geographyFile.id}`);
};

const handleCancel = () => {
  // Navigate back to geography file view
  router.push(`/geography/${route.params.id}`);
};

const deleteFile = async () => {
  try {
    deleting.value = true;

    const response = (await useNuxtApp().$civicApi(
      `/api/v1/geography/${route.params.id}`,
      {
        method: 'DELETE',
      }
    )) as any;

    if (response.success) {
      // Redirect to geography list after successful deletion
      router.push('/geography');
    } else {
      error.value = response.error || 'Failed to delete geography file';
    }
  } catch (err) {
    console.error('Error deleting geography file:', err);
    error.value = 'Failed to delete geography file';
  } finally {
    deleting.value = false;
    showDeleteModal.value = false;
  }
};
</script>
