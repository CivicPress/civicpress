<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import RecordForm from '~/components/RecordForm.vue';
import SystemFooter from '~/components/SystemFooter.vue';
import FormSkeleton from '~/components/FormSkeleton.vue';

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
        title: t('records.recordUpdated'),
        description: t('records.successfullyUpdated', {
          title: recordData.title,
        }),
        color: 'primary',
      });

      // Navigate back to the record
      navigateTo(`/records/${type}/${id}`);
    } else {
      throw new Error(t('records.failedToUpdateRecord'));
    }
  } catch (err: any) {
    const errorMessage = err.message || t('records.failedToUpdateRecord');
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
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('records.allRecords'),
    to: '/records',
  },
  {
    label: getTypeLabel(type),
    to: `/records/${type}`,
  },
  {
    label: record.value?.id || id || t('records.viewRecord'),
    to: `/records/${type}/${id}`,
  },
  {
    label: t('common.edit'),
  },
]);
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
          :title="t('records.accessDenied')"
          :description="t('records.noPermissionToEdit')"
          icon="i-lucide-alert-circle"
        />

        <!-- Record Form -->
        <div v-else-if="record" class="space-y-6">
          <!-- Record Information Card -->
          <UCard v-if="recordFormRef">
            <div class="space-y-4">
              <!-- Title -->
              <UFormField
                :label="t('common.title')"
                required
                :error="
                  recordFormRef.hasSubmitted && recordFormRef.formErrors.title
                    ? recordFormRef.formErrors.title
                    : undefined
                "
              >
                <UInput
                  v-model="recordFormRef.form.title"
                  :placeholder="t('records.enterTitle')"
                  :disabled="saving"
                  class="w-full"
                />
              </UFormField>

              <!-- Type and Status -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormField
                  :label="t('common.type')"
                  required
                  :error="
                    recordFormRef.hasSubmitted && recordFormRef.formErrors.type
                      ? recordFormRef.formErrors.type
                      : undefined
                  "
                >
                  <USelectMenu
                    v-model="recordFormRef.selectedRecordType"
                    :items="recordFormRef.recordTypeOptionsComputed"
                    :placeholder="t('records.selectType')"
                    :disabled="saving"
                    class="w-full"
                  />
                </UFormField>

                <UFormField
                  :label="t('common.status')"
                  required
                  :error="
                    recordFormRef.hasSubmitted &&
                    recordFormRef.formErrors.status
                      ? recordFormRef.formErrors.status
                      : undefined
                  "
                >
                  <USelectMenu
                    v-model="recordFormRef.selectedRecordStatus"
                    :items="recordFormRef.recordStatusOptionsComputed"
                    :placeholder="t('records.selectStatus')"
                    :disabled="saving"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Description -->
              <UFormField
                :label="t('common.description')"
                :error="
                  recordFormRef.hasSubmitted &&
                  recordFormRef.formErrors.description
                    ? recordFormRef.formErrors.description
                    : undefined
                "
              >
                <UTextarea
                  v-model="recordFormRef.form.description"
                  :placeholder="t('records.enterRecordDescription')"
                  :disabled="saving"
                  :rows="3"
                  class="w-full"
                />
              </UFormField>

              <!-- Tags -->
              <UFormField
                :label="t('common.tags')"
                :error="
                  recordFormRef.hasSubmitted && recordFormRef.formErrors.tags
                    ? recordFormRef.formErrors.tags
                    : undefined
                "
              >
                <UInput
                  v-model="recordFormRef.newTag"
                  :placeholder="t('records.addTagPlaceholder')"
                  :disabled="saving"
                  @keyup.enter="recordFormRef.handleTagEnter"
                  class="w-full"
                />
                <div
                  v-if="recordFormRef.form.tags.length > 0"
                  class="flex flex-wrap gap-2 mt-2"
                >
                  <UBadge
                    v-for="tag in recordFormRef.form.tags"
                    :key="tag"
                    color="primary"
                    variant="soft"
                    size="sm"
                  >
                    {{ tag }}
                    <UButton
                      icon="i-lucide-x"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click="recordFormRef.removeTag(tag)"
                    />
                  </UBadge>
                </div>
              </UFormField>
            </div>
          </UCard>

          <RecordForm
            ref="recordFormRef"
            :record="record"
            :is-editing="true"
            :saving="saving"
            :error="error"
            :can-delete="canDeleteRecords"
            :hide-basic-fields="true"
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

        <!-- Footer -->
        <SystemFooter v-if="record || error" />
      </div>
    </template>
  </UDashboardPanel>
</template>
