<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import SystemFooter from '~/components/SystemFooter.vue';

const { t } = useI18n();
// Route parameters
const route = useRoute();
const type = route.params.type as string;

// Store
const recordsStore = useRecordsStore();

// Reactive state
const saving = ref(false);
const error = ref('');

// Toast notifications
const toast = useToast();

// Get record type display name
const { getRecordTypeLabel } = useRecordTypes();
const recordTypeLabel = computed(() => getRecordTypeLabel(type));

// Handle form submission
const handleSubmit = async (recordData: any) => {
  saving.value = true;
  error.value = '';

  try {
    // Create record via API
    const response = (await useNuxtApp().$civicApi('/api/v1/records', {
      method: 'POST',
      body: recordData,
    })) as any;

    if (response && response.success) {
      toast.add({
        title: t('records.recordCreated'),
        description: t('records.successfullyCreated', {
          title: recordData.title,
        }),
        color: 'primary',
      });

      // Navigate to the new record
      navigateTo(`/records/${recordData.type}/${response.data.id}`);
    } else {
      throw new Error('Failed to create record');
    }
  } catch (err: any) {
    const errorMessage = err.message || t('records.failedToCreateRecord');
    error.value = errorMessage;
    toast.add({
      title: t('common.error'),
      description: errorMessage,
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
};

// Handle delete (not applicable for new records)
const handleDelete = () => {
  // Not applicable for new records
};

// Check if user can create records
const authStore = useAuthStore();
const canCreateRecords = computed(() => {
  const userRole = authStore.currentUser?.role;
  return userRole === 'admin' || userRole === 'clerk';
});

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('records.allRecords'),
    to: '/records',
  },
  {
    label: recordTypeLabel.value,
    to: `/records/${type}`,
  },
  {
    label: t('records.newRecord'),
  },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('records.createNewTypeRecord', { type: recordTypeLabel }) }}
          </h1>
        </template>
        <template #description>
          {{
            t('records.createNewTypeRecordDesc', {
              type: recordTypeLabel.toLowerCase(),
            })
          }}
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Access Control -->
        <UAlert
          v-if="!canCreateRecords"
          color="error"
          variant="soft"
          :title="t('records.accessDenied')"
          :description="t('records.noPermissionToCreate')"
          icon="i-lucide-alert-circle"
        />

        <!-- Record Form -->
        <div v-else>
          <RecordForm
            :record-type="type"
            :saving="saving"
            :error="error"
            @submit="handleSubmit"
            @delete="handleDelete"
          />
        </div>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
