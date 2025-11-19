<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import SystemFooter from '~/components/SystemFooter.vue';

// Route parameters
const route = useRoute();
const type = route.params.type as string;
const id = route.params.id as string;

// Store
const recordsStore = useRecordsStore();

// Reactive state
const record = ref<CivicRecord | null>(null);
const loading = ref(false);
const error = ref('');

// Toast notifications
const toast = useToast();
const { t } = useI18n();

// Get record type display name
const { getRecordTypeLabel } = useRecordTypes();
const { getStatusLabel, getTypeIcon, formatDate } = useRecordUtils();
const recordTypeLabel = computed(() => getRecordTypeLabel(type));

// Copy to clipboard function
const copyToClipboard = async () => {
  if (record.value?.content) {
    try {
      await navigator.clipboard.writeText(record.value.content);
      toast.add({
        title: t('records.raw.copied'),
        description: t('records.raw.copiedToClipboard'),
        color: 'primary',
      });
    } catch (error) {
      console.error('Copy failed:', error);
      toast.add({
        title: t('records.raw.copyFailed'),
        description: t('records.raw.copyFailedDesc'),
        color: 'error',
      });
    }
  }
};

// Navigation menu items for copy button
const navigationItems = computed(() => [
  [
    {
      label: t('records.raw.copy'),
      icon: 'i-lucide-copy',
      click: copyToClipboard,
    },
  ],
]);

// Fetch record data
const fetchRecord = async () => {
  loading.value = true;
  error.value = '';

  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/records/${id}/raw`
    )) as any;

    if (response && response.success && response.data) {
      const apiRecord = response.data;

      // Transform API response to match CivicRecord interface
      record.value = {
        id: apiRecord.id,
        title: apiRecord.title,
        type: apiRecord.type,
        content: apiRecord.content || '', // This now contains the complete file including frontmatter
        status: apiRecord.status,
        path: apiRecord.path,
        author: apiRecord.author,
        created_at: apiRecord.created || apiRecord.created_at,
        updated_at: apiRecord.updated || apiRecord.updated_at,
        metadata: apiRecord.metadata || {},
      };
    } else {
      throw new Error(t('records.raw.failedToFetch'));
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

// Check if user can view records (allow guests to view raw records)
const authStore = useAuthStore();
const canViewRecords = computed(() => {
  const userRole = authStore.currentUser?.role;
  // Allow all users including guests to view raw records
  return true;
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
    label: t('common.records'),
    to: '/records',
  },
  {
    label: recordTypeLabel.value,
    to: `/records/${type}`,
  },
  {
    label: record.value?.id || t('records.record'),
    to: `/records/${type}/${id}`,
  },
  {
    label: t('records.raw.title'),
  },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ record?.id || t('records.record') }}
          </h1>
        </template>
        <template #description>
          {{ record?.title || t('records.raw.description') }}
        </template>
        <template #right>
          <HeaderActions
            :actions="[
              {
                label: t('records.raw.backToRecord'),
                icon: 'i-lucide-arrow-left',
                to: `/records/${type}/${id}`,
                color: 'neutral',
                variant: 'outline',
                disabled: loading || !record,
              },
            ]"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <div class="flex justify-center items-center h-64">
            <div class="text-center">
              <UIcon
                name="i-lucide-loader-2"
                class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4"
              />
              <p class="text-gray-600">{{ t('records.raw.loading') }}</p>
            </div>
          </div>
        </div>

        <!-- Access Control -->
        <UAlert
          v-else-if="!canViewRecords"
          color="error"
          variant="soft"
          :title="t('records.accessDenied')"
          :description="t('records.noPermissionToView')"
          icon="i-lucide-alert-circle"
        />

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
        <div v-else-if="!record" class="text-center py-12">
          <UAlert
            color="neutral"
            variant="soft"
            :title="t('records.raw.noRecordFound')"
            :description="t('records.raw.noRecordFoundDesc')"
            icon="i-lucide-alert-circle"
          />
        </div>

        <!-- Raw Content Display -->
        <div v-else class="space-y-6">
          <!-- Record Info -->
          <div
            class="rounded-lg border border-gray-200 dark:border-gray-800 p-6 space-y-3"
          >
            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-400"
            >
              <span class="font-medium text-gray-800 dark:text-gray-100">
                {{ t('records.raw.recordId') }}:
                <code
                  class="ml-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs tracking-tight"
                >
                  {{ record.id }}
                </code>
              </span>
              <span class="inline-flex items-center gap-2">
                <UIcon
                  :name="getTypeIcon(record.type)"
                  class="w-4 h-4 text-gray-500"
                />
                {{ getRecordTypeLabel(record.type) }}
              </span>
              <span class="inline-flex items-center gap-2">
                <UIcon name="i-lucide-calendar" class="w-4 h-4 text-gray-500" />
                {{ new Date(record.created_at).toLocaleString() }}
              </span>
              <span
                v-if="record.updated_at"
                class="inline-flex items-center gap-2"
              >
                <UIcon name="i-lucide-edit" class="w-4 h-4 text-gray-500" />
                {{ t('records.raw.updated') }}
                {{ new Date(record.updated_at).toLocaleString() }}
              </span>
              <span v-if="record.author" class="inline-flex items-center gap-2">
                <UIcon name="i-lucide-user" class="w-4 h-4 text-gray-500" />
                {{ record.author }}
              </span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200 dark:text-green-200 dark:ring-green-800"
              >
                <UIcon
                  name="i-lucide-badge-check"
                  class="w-4 h-4 text-current"
                />
                {{ getStatusLabel(record.status) }}
              </span>
            </div>

            <div
              v-if="record.metadata?.tags && record.metadata.tags.length > 0"
              class="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
            >
              <span class="font-medium">{{ t('records.raw.tags') }}:</span>
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="tag in record.metadata.tags"
                  :key="tag"
                  color="primary"
                  variant="soft"
                  size="sm"
                >
                  {{ tag }}
                </UBadge>
              </div>
            </div>
          </div>

          <!-- Raw Markdown Content -->
          <div
            class="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            <div
              class="border-b border-gray-200 dark:border-gray-800 px-6 py-4"
            >
              <h2 class="text-lg font-semibold">
                {{ t('records.raw.markdownContent') }}
              </h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ t('records.raw.markdownContentDesc') }}
              </p>
            </div>
            <div v-if="record.content" class="relative bg-gray-900">
              <!-- Navigation Menu with Copy Button -->
              <UNavigationMenu
                highlight
                highlight-color="primary"
                orientation="horizontal"
                :items="navigationItems"
                class="absolute top-4 right-4 z-10 w-auto"
              />

              <!-- Code block with syntax highlighting -->
              <pre
                class="text-sm overflow-x-auto p-6 text-gray-100 font-mono whitespace-pre-wrap break-words"
              ><code>{{ record.content }}</code></pre>
            </div>
            <div v-else class="p-6 text-gray-500 dark:text-gray-400 italic">
              {{ t('records.noContentAvailable') }}
            </div>
          </div>

          <!-- File Information -->
          <div class="rounded-lg border border-gray-200 dark:border-gray-800">
            <div
              class="border-b border-gray-200 dark:border-gray-800 px-6 py-4"
            >
              <h2 class="text-lg font-semibold">
                {{ t('records.raw.fileInformation') }}
              </h2>
            </div>
            <div class="p-6 text-sm text-gray-600 dark:text-gray-400">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <span class="inline-flex items-center gap-2">
                  <UIcon name="i-lucide-file-text" class="w-4 h-4" />
                  {{ t('records.raw.filePath') }}:
                  <code
                    class="ml-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs"
                  >
                    {{ record.path }}
                  </code>
                </span>
                <span class="inline-flex items-center gap-2">
                  <UIcon name="i-lucide-hash" class="w-4 h-4" />
                  {{ t('records.raw.recordId') }}:
                  <code
                    class="ml-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs"
                  >
                    {{ record.id }}
                  </code>
                </span>
              </div>
            </div>
          </div>

          <SystemFooter v-if="record" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
