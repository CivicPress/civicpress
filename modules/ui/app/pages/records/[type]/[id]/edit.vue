<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import RecordForm from '~/components/RecordForm.vue';
import FormSkeleton from '~/components/FormSkeleton.vue';

// Page metadata - require authentication for editing records
definePageMeta({
  middleware: ['require-auth'],
});

const { t } = useI18n();
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
const recordFormRef = ref<InstanceType<typeof RecordForm> | null>(null);
const hasSavedChanges = ref(false); // Track if changes have been saved (indicates draft editing)

// Toast notifications
const toast = useToast();

// Get record type display name
const { getRecordTypeLabel } = useRecordTypes();
const recordTypeLabel = computed(() => getRecordTypeLabel(type));

// Get type label helper
const { getTypeLabel, getStatusLabel, getTypeIcon, getStatusIcon } =
  useRecordUtils();

// Fetch record data
const fetchRecord = async () => {
  loading.value = true;
  error.value = '';

  try {
    // Add ?edit=true to get draft version if it exists (for authenticated users with edit permission)
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/records/${id}?edit=true`
    )) as any;

    if (response && response.success && response.data) {
      const apiRecord = response.data;

      // Transform API response to match CivicRecord interface
      // Note: Drafts return markdownBody, published records return content
      record.value = {
        id: apiRecord.id,
        title: apiRecord.title,
        type: apiRecord.type, // This should be the updated type from draft if it exists
        content: apiRecord.markdownBody || apiRecord.content || '',
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

      // If the record is a draft (has isDraft flag or markdownBody), mark as having saved changes
      // This means we're editing a draft, so breadcrumbs should show "All Drafts"
      if (apiRecord.isDraft || apiRecord.markdownBody) {
        hasSavedChanges.value = true;
      }
    } else {
      throw new Error(t('records.failedToLoadRecord'));
    }
  } catch (err: any) {
    const errorMessage = err.message || t('records.failedToLoadRecord');
    error.value = errorMessage;
    toast.add({
      title: t('common.error'),
      description: errorMessage,
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
};

// Handle form submission (new RecordForm handles this internally via draft/publish)
const handleSubmit = async (recordData: any) => {
  // The new RecordForm handles draft updates and publishing internally
  // This is kept for backward compatibility but may not be called
  console.log('Form submitted:', recordData);
};

// Handle record saved - update local record state to reflect changes (e.g., type changes)
const handleRecordSaved = (recordData: any) => {
  // Mark that changes have been saved (this indicates we're working with a draft)
  hasSavedChanges.value = true;

  if (record.value) {
    // Update the record with the latest data from the server
    record.value = {
      ...record.value,
      type: recordData.type,
      title: recordData.title,
      status: recordData.status,
      content:
        recordData.markdownBody || recordData.content || record.value.content,
      updated_at:
        recordData.updated_at ||
        recordData.last_draft_saved_at ||
        record.value.updated_at,
    };
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
        title: t('records.recordDeleted'),
        description: t('records.successfullyDeleted'),
        color: 'primary',
      });

      // Navigate to records list
      navigateTo(`/records/${type}`);
    } else {
      throw new Error(t('records.failedToDeleteRecord'));
    }
  } catch (err: any) {
    const errorMessage = err.message || t('records.failedToDeleteRecord');
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

// Check if user can edit records (permission-based instead of role-based)
const authStore = useAuthStore();
const canEditRecords = computed(() => {
  // Use permission-based access control (consistent with API endpoints)
  return authStore.isLoggedIn && authStore.hasPermission('records:edit');
});

const canDeleteRecords = computed(() => {
  // Use permission-based access control (consistent with API endpoints)
  return authStore.isLoggedIn && authStore.hasPermission('records:edit');
});

// Fetch record on mount
onMounted(() => {
  fetchRecord();
});

// Use the record's type if available, otherwise fall back to route param
const currentType = computed(() => record.value?.type || type);

const breadcrumbItems = computed(() => {
  const items = [
    {
      label: t('common.home'),
      to: '/',
    },
    {
      // Show "All Drafts" if changes have been saved, otherwise "All Records"
      label: hasSavedChanges.value
        ? t('navigation.records.drafts')
        : t('records.allRecords'),
      to: hasSavedChanges.value ? '/records/drafts' : '/records',
    },
  ];

  // Only include type breadcrumb if changes haven't been saved yet
  // After saving, we skip the type and go directly to the record
  if (!hasSavedChanges.value) {
    items.push({
      label: getTypeLabel(currentType.value),
      to: `/records/${currentType.value}`,
    });
  }

  // If changes have been saved (draft), don't link to record view page (it's not published)
  // Just show "Edit <record id>" without a link
  if (hasSavedChanges.value) {
    items.push({
      label: `${t('common.edit')} ${record.value?.id || id || ''}`,
      to: '', // No link - draft records aren't accessible via regular record view
    });
  } else {
    // For published records, show record ID as link, then Edit
    items.push(
      {
        label: record.value?.id || id || t('records.viewRecord'),
        to: `/records/${currentType.value}/${id}`,
      },
      {
        label: t('common.edit'),
        to: '', // Current page, no link needed
      }
    );
  }

  return items;
});
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{
              t('records.editRecord', {
                id: record?.id || id || t('records.viewRecord'),
              })
            }}
          </h1>
        </template>
        <template #description>
          {{ t('records.editRecordDesc') }}
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col h-full">
        <div class="flex-shrink-0 mb-6">
          <UBreadcrumb :items="breadcrumbItems" />
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <FormSkeleton />
        </div>

        <!-- Access Control -->
        <UAlert
          v-else-if="!canEditRecords"
          color="error"
          variant="soft"
          :title="t('records.accessDenied')"
          :description="t('records.noPermissionToEdit')"
          icon="i-lucide-alert-circle"
          class="mb-6"
        />

        <!-- Record Form -->
        <div v-else-if="record" class="flex-1 min-h-0 -mx-6 -mb-6">
          <RecordForm
            :record="record"
            :is-editing="true"
            :saving="saving"
            :error="error"
            :can-delete="canDeleteRecords"
            @delete="handleDelete"
            @saved="handleRecordSaved"
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
