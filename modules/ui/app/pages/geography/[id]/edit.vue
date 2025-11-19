<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('geography.editGeography') }}
          </h1>
        </template>
        <template #description>
          {{ t('geography.updateExistingGeographicData') }}
        </template>
        <template #right>
          <UButton color="neutral" variant="ghost" @click="router.back()">
            <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
            {{ t('common.back') }}
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
          <span class="ml-3 text-gray-600">{{
            t('geography.loadingGeographyFile')
          }}</span>
        </div>

        <!-- Error State -->
        <UAlert v-else-if="error" :title="error" color="error" variant="soft">
          <template #actions>
            <UButton @click="router.push('/geography')">
              {{ t('geography.backToGeographyFiles') }}
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
            {{ t('common.delete') }}
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
              {{ t('common.cancel') }}
            </UButton>
            <UButton
              color="primary"
              :loading="geographyFormRef?.saving"
              :disabled="!geographyFormRef?.isFormValid"
              @click="geographyFormRef?.handleSubmit"
            >
              {{ t('geography.updateGeographyFile') }}
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
    :title="t('geography.deleteGeographyFile')"
    :description="t('geography.deleteCannotBeUndone')"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('common.confirmDelete') }}
        </p>
        <div class="flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            @click="showDeleteModal = false"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="error" :loading="deleting" @click="deleteFile">
            {{ t('common.delete') }}
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
const { t } = useI18n();

// State
const loading = ref(false);
const error = ref<string | null>(null);
const showDeleteModal = ref(false);
const deleting = ref(false);
const geographyFormRef = ref<InstanceType<typeof GeographyForm> | null>(null);

// Breadcrumbs
const breadcrumbItems = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('geography.title'), to: '/geography' },
  { label: t('geography.editGeography') },
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
      error.value = response.error || t('geography.failedToDelete');
    }
  } catch (err) {
    console.error('Error deleting geography file:', err);
    error.value = t('geography.failedToDelete');
  } finally {
    deleting.value = false;
    showDeleteModal.value = false;
  }
};
</script>
