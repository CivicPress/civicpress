<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">
          {{ t('geography.linkedRecords') }}
        </h3>
        <UBadge v-if="linkedRecords.length > 0" color="primary" variant="soft">
          {{ linkedRecords.length }}
        </UBadge>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="animate-pulse">
        <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div class="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      :title="error"
      icon="i-lucide-alert-circle"
    />

    <!-- Empty State -->
    <div v-else-if="linkedRecords.length === 0" class="text-center py-8">
      <UIcon
        name="i-lucide-file-text"
        class="w-12 h-12 text-gray-400 mx-auto mb-4"
      />
      <p class="text-gray-500 dark:text-gray-400">
        {{ t('geography.noRecordsLinked') }}
      </p>
    </div>

    <!-- Records List -->
    <div v-else class="space-y-3">
      <div
        v-for="record in linkedRecords"
        :key="record.id"
        class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <UIcon
              :name="getTypeIcon(record.type)"
              class="w-4 h-4 text-gray-500"
            />
            <h4 class="font-medium text-gray-900 dark:text-white truncate">
              {{ record.title }}
            </h4>
            <UBadge
              :color="getStatusColor(record.status) as any"
              variant="soft"
              size="xs"
            >
              {{ record.status }}
            </UBadge>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 truncate">
            {{ record.type }} • {{ formatDate(record.created_at) }}
          </p>
          <p
            v-if="record.description"
            class="text-xs text-gray-500 dark:text-gray-400 truncate mt-1"
          >
            {{ record.description }}
          </p>
        </div>
        <div class="flex items-center gap-2 ml-4">
          <UButton
            color="primary"
            variant="ghost"
            size="xs"
            @click="viewRecord(record)"
          >
            <UIcon name="i-lucide-external-link" class="w-4 h-4" />
            {{ t('common.view') }}
          </UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNuxtApp } from '#imports';

// Props
interface Props {
  geographyId: string;
}

const props = defineProps<Props>();

// Composables
const router = useRouter();
const { $civicApi } = useNuxtApp();
const { t } = useI18n();

// Reactive state
const linkedRecords = ref<any[]>([]);
const loading = ref(false);
const error = ref('');

// Utility functions
const getTypeIcon = (type: string) => {
  const icons: Record<string, string> = {
    meeting: 'i-lucide-users',
    document: 'i-lucide-file-text',
    decision: 'i-lucide-check-circle',
    project: 'i-lucide-folder',
    event: 'i-lucide-calendar',
    announcement: 'i-lucide-megaphone',
    policy: 'i-lucide-shield',
    report: 'i-lucide-bar-chart',
  };
  return icons[type] || 'i-lucide-file';
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'gray',
    published: 'green',
    archived: 'orange',
    pending: 'yellow',
    approved: 'green',
    rejected: 'red',
  };
  return colors[status] || 'gray';
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

// Fetch linked records
const fetchLinkedRecords = async () => {
  loading.value = true;
  error.value = '';

  try {
    const response = (await $civicApi(
      `/api/v1/geography/${props.geographyId}/linked-records`
    )) as any;

    if (response.success) {
      linkedRecords.value = response.data || [];
    } else {
      error.value = response.error || t('geography.failedToFetchLinkedRecords');
    }
  } catch (err) {
    console.error('Error fetching linked records:', err);
    error.value = t('geography.failedToFetchLinkedRecords');
  } finally {
    loading.value = false;
  }
};

// View record
const viewRecord = (record: any) => {
  router.push(`/records/${record.type}/${record.id}`);
};

// Fetch on mount
onMounted(() => {
  fetchLinkedRecords();
});
</script>
