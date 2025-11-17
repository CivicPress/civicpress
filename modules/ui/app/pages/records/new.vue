<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import RecordForm from '~/components/RecordForm.vue';
import SystemFooter from '~/components/SystemFooter.vue';

// Store
const recordsStore = useRecordsStore();

// Reactive state
const saving = ref(false);
const error = ref('');
const recordFormRef = ref<InstanceType<typeof RecordForm> | null>(null);

// Toast notifications
const toast = useToast();

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
        title: 'Record Created',
        description: `Successfully created "${recordData.title}"`,
        color: 'primary',
      });

      // Navigate to the new record
      navigateTo(`/records/${recordData.type}/${response.data.id}`);
    } else {
      throw new Error('Failed to create record');
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to create record';
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

const breadcrumbItems = [
  {
    label: 'Home',
    to: '/',
  },
  {
    label: 'Records',
    to: '/records',
  },
  {
    label: 'New Record',
  },
];
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Create New Record</h1>
        </template>
        <template #description>
          Create a new record with the required information
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
          title="Access Denied"
          description="You don't have permission to create records."
          icon="i-lucide-alert-circle"
        />

        <!-- Record Form -->
        <div v-else class="space-y-6">
          <!-- Record Information Card -->
          <UCard v-if="recordFormRef">
            <div class="space-y-4">
              <!-- Title -->
              <UFormField
                label="Title"
                required
                :error="
                  recordFormRef.hasSubmitted && recordFormRef.formErrors.title
                    ? recordFormRef.formErrors.title
                    : undefined
                "
              >
                <UInput
                  v-model="recordFormRef.form.title"
                  placeholder="Enter record title"
                  :disabled="saving"
                  class="w-full"
                />
              </UFormField>

              <!-- Type and Status -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormField
                  label="Type"
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
                    placeholder="Select record type"
                    :disabled="saving"
                    class="w-full"
                  />
                </UFormField>

                <UFormField
                  label="Status"
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
                    placeholder="Select status"
                    :disabled="saving"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Description -->
              <UFormField
                label="Description"
                :error="
                  recordFormRef.hasSubmitted &&
                  recordFormRef.formErrors.description
                    ? recordFormRef.formErrors.description
                    : undefined
                "
              >
                <UTextarea
                  v-model="recordFormRef.form.description"
                  placeholder="Enter record description (optional)"
                  :disabled="saving"
                  :rows="3"
                  class="w-full"
                />
              </UFormField>

              <!-- Tags -->
              <UFormField
                label="Tags"
                :error="
                  recordFormRef.hasSubmitted && recordFormRef.formErrors.tags
                    ? recordFormRef.formErrors.tags
                    : undefined
                "
              >
                <UInput
                  v-model="recordFormRef.newTag"
                  placeholder="Add a tag and press Enter"
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
            :saving="saving"
            :error="error"
            :hide-basic-fields="true"
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
