<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import RecordForm from '~/components/RecordForm.vue';
import FormSkeleton from '~/components/FormSkeleton.vue';

// Route parameters
const route = useRoute();
const type = route.params.type as string;
const id = route.params.id as string;

// Store
const recordsStore = useRecordsStore();

// Reactive state
const record = ref<CivicRecord | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

// Toast notifications
const toast = useToast();

// Get record type display name
const { getRecordTypeLabel } = useRecordTypes();
const recordTypeLabel = computed(() => getRecordTypeLabel(type));

// Fetch record data
const fetchRecord = async () => {
  loading.value = true;
  error.value = '';

  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/records/${id}`
    )) as any;

    if (response && response.success && response.data) {
      const apiRecord = response.data;

      // Transform API response to match CivicRecord interface
      record.value = {
        id: apiRecord.id,
        title: apiRecord.title,
        type: apiRecord.type,
        content: apiRecord.content || '',
        status: apiRecord.status,
        path: apiRecord.path,
        author: apiRecord.author,
        created_at: apiRecord.created || apiRecord.created_at,
        updated_at: apiRecord.updated || apiRecord.updated_at,
        geography: apiRecord.geography,
        attachedFiles: apiRecord.attachedFiles || [],
        linkedRecords: apiRecord.linkedRecords || [],
        metadata: apiRecord.metadata || {},
      };
    } else {
      throw new Error('Failed to fetch record');
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to load record';
    error.value = errorMessage;
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
};

// Handle form submission
const handleSubmit = async (recordData: any) => {
  saving.value = true;
  error.value = '';

  try {
    // Update record via API
    const response = (await useNuxtApp().$civicApi(`/api/v1/records/${id}`, {
      method: 'PUT',
      body: recordData,
    })) as any;

    if (response && response.success) {
      toast.add({
        title: 'Record Updated',
        description: `Successfully updated "${recordData.title}"`,
        color: 'primary',
      });

      // Navigate back to the record
      navigateTo(`/records/${type}/${id}`);
    } else {
      throw new Error('Failed to update record');
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to update record';
    error.value = errorMessage;
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
};

// Handle delete
const handleDelete = async (recordId: string) => {
  saving.value = true;
  error.value = '';

  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/records/${recordId}`,
      {
        method: 'DELETE',
      }
    )) as any;

    if (response && response.success) {
      toast.add({
        title: 'Record Deleted',
        description: 'Record has been successfully deleted',
        color: 'primary',
      });

      // Navigate to records list
      navigateTo(`/records/${type}`);
    } else {
      throw new Error('Failed to delete record');
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to delete record';
    error.value = errorMessage;
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
};

// Check if user can edit records
const authStore = useAuthStore();
const canEditRecords = computed(() => {
  const userRole = authStore.currentUser?.role;
  return userRole === 'admin' || userRole === 'clerk';
});

const canDeleteRecords = computed(() => {
  const userRole = authStore.currentUser?.role;
  return userRole === 'admin' || userRole === 'clerk';
});

// Fetch record on mount
onMounted(() => {
  fetchRecord();
});

const breadcrumbItems = computed(() => [
  {
    label: 'Records',
    to: '/records',
  },
  {
    label: recordTypeLabel.value,
    to: `/records/${type}`,
  },
  {
    label: record.value?.title || 'Record',
    to: `/records/${type}/${id}`,
  },
  {
    label: 'Edit',
  },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            Edit {{ record?.title || 'Record' }}
          </h1>
        </template>
        <template #description>
          Edit the record information and content
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <FormSkeleton />
        </div>

        <!-- Access Control -->
        <UAlert
          v-else-if="!canEditRecords"
          color="error"
          variant="soft"
          title="Access Denied"
          description="You don't have permission to edit records."
          icon="i-lucide-alert-circle"
        />

        <!-- Record Form -->
        <div v-else-if="record">
          <RecordForm
            :record="record"
            :is-editing="true"
            :saving="saving"
            :error="error"
            :can-delete="canDeleteRecords"
            @submit="handleSubmit"
            @delete="handleDelete"
          />
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
          <UAlert
            color="error"
            variant="soft"
            :title="error"
            icon="i-lucide-alert-circle"
          />
        </div>

        <!-- No Record State -->
        <div v-else class="text-center py-12">
          <UAlert
            color="neutral"
            variant="soft"
            title="No Record Found"
            description="The record could not be loaded."
            icon="i-lucide-alert-circle"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
