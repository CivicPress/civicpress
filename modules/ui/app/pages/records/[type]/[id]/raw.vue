<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';

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
        title: 'Copied!',
        description: 'Raw content copied to clipboard',
        color: 'primary',
      });
    } catch (error) {
      console.error('Copy failed:', error);
      toast.add({
        title: 'Copy Failed',
        description:
          'Please select the content and copy manually (Ctrl+C / Cmd+C)',
        color: 'error',
      });
    }
  }
};

// Navigation menu items for copy button
const navigationItems = computed(() => [
  [
    {
      label: 'Copy',
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
    label: 'Records',
    to: '/records',
  },
  {
    label: recordTypeLabel.value,
    to: `/records/${type}`,
  },
  {
    label: record.value?.id || 'Record',
    to: `/records/${type}/${id}`,
  },
  {
    label: 'Raw Content',
  },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ record?.id || 'Record' }}
          </h1>
        </template>
        <template #description>
          {{ record?.title || 'View raw markdown and frontmatter' }}
        </template>
        <template #right>
          <HeaderActions
            :actions="[
              {
                label: 'Back to Record',
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
              <p class="text-gray-600">Loading record...</p>
            </div>
          </div>
        </div>

        <!-- Access Control -->
        <UAlert
          v-else-if="!canViewRecords"
          color="error"
          variant="soft"
          title="Access Denied"
          description="You don't have permission to view records."
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
            title="No Record Found"
            description="The record could not be loaded."
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
                Record ID:
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
                Updated {{ new Date(record.updated_at).toLocaleString() }}
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
              <span class="font-medium">Tags:</span>
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
            <div class="border-b px-6 py-4">
              <h2 class="text-lg font-semibold">Raw Markdown Content</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                This is the complete markdown file including frontmatter and
                content
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
              No content available for this record.
            </div>
          </div>

          <!-- File Information -->
          <div class="rounded-lg border border-gray-200 dark:border-gray-800">
            <div
              class="border-b border-gray-200 dark:border-gray-800 px-6 py-4"
            >
              <h2 class="text-lg font-semibold">File Information</h2>
            </div>
            <div class="p-6 text-sm text-gray-600 dark:text-gray-400">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <span class="inline-flex items-center gap-2">
                  <UIcon name="i-lucide-file-text" class="w-4 h-4" />
                  File Path:
                  <code
                    class="ml-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs"
                  >
                    {{ record.path }}
                  </code>
                </span>
                <span class="inline-flex items-center gap-2">
                  <UIcon name="i-lucide-hash" class="w-4 h-4" />
                  Record ID:
                  <code
                    class="ml-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs"
                  >
                    {{ record.id }}
                  </code>
                </span>
              </div>
            </div>
          </div>

          <div
            class="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-800 pt-4 text-center"
          >
            <span>Stored as Markdown/YAML</span>
            <span>·</span>
            <span>Git-backed</span>
            <span>·</span>
            <span>
              Last sync
              <time :datetime="record.updated_at || record.created_at">
                {{ formatDate(record.updated_at || record.created_at || '') }}
              </time>
            </span>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
