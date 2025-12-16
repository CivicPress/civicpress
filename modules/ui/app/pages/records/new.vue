<script setup lang="ts">
import RecordForm from '~/components/RecordForm.vue';
import SystemFooter from '~/components/SystemFooter.vue';

const { t } = useI18n();
const route = useRoute();

// Reactive state
const saving = ref(false);
const error = ref('');

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
            {{ t('records.createNewRecord') }}
          </h1>
        </template>
        <template #description>
          {{ t('records.createNewRecordDesc') }}
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col h-full">
        <div class="flex-shrink-0 mb-6">
          <UBreadcrumb :items="breadcrumbItems" />
        </div>

        <!-- Access Control -->
        <UAlert
          v-if="!canCreateRecords"
          color="error"
          variant="soft"
          :title="t('records.accessDenied')"
          :description="t('records.noPermissionToCreate')"
          icon="i-lucide-alert-circle"
          class="mb-6"
        />

        <!-- Record Form -->
        <div v-else class="flex-1 min-h-0 -mx-6 -mb-6">
          <RecordForm
            :record-type="(route.query.type as string) || null"
            :is-editing="false"
            :saving="saving"
            :error="error"
          />
        </div>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
