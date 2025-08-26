<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';

// Route parameters
const route = useRoute();
const router = useRouter();
const type = route.params.type as string;
const id = route.params.id as string;

// Store
const recordsStore = useRecordsStore();

// Reactive state
const record = ref<CivicRecord | null>(null);
const loading = ref(false);
const error = ref('');

// Composables
const { $api } = useNuxtApp();
const { renderMarkdown } = useMarkdown();
const { formatDate, getStatusColor, getTypeIcon, getTypeLabel } =
  useRecordUtils();

// Fetch record data
const fetchRecord = async () => {
  loading.value = true;
  error.value = '';

  try {
    console.log('Fetching record:', id);

    // Direct API call for now to test
    const { $civicApi } = useNuxtApp();
    const response = (await $civicApi(`/api/v1/records/${id}`)) as any;

    console.log('API response:', response);

    if (response && response.success && response.data) {
      const apiRecord = response.data;

      // Extract content body from full markdown (remove YAML frontmatter)
      let contentBody = apiRecord.content || '';
      if (contentBody) {
        // Remove YAML frontmatter if present
        const frontmatterMatch = contentBody.match(
          /^---\s*\n([\s\S]*?)\n---\s*\n/
        );
        if (frontmatterMatch) {
          // Extract only the content after the frontmatter
          contentBody = contentBody
            .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
            .trim();
        }
      }

      // Transform API response to match CivicRecord interface
      record.value = {
        id: apiRecord.id,
        title: apiRecord.title,
        type: apiRecord.type,
        content: contentBody, // Use only the content body, not the full markdown
        status: apiRecord.status,
        path: apiRecord.path,
        author: apiRecord.author,
        created_at: apiRecord.created || apiRecord.created_at,
        updated_at: apiRecord.updated || apiRecord.updated_at,
        metadata: apiRecord.metadata || {},
      };

      console.log('Record loaded:', record.value);
    } else {
      throw new Error('Failed to fetch record');
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to load record';
    console.error('Error fetching record:', err);
  } finally {
    loading.value = false;
  }
};

// Navigate back to records list
const goBack = () => {
  // Check if we can go back in browser history
  if (window.history.length > 1) {
    // Use router.back() to preserve the previous page state (filters, pagination, etc.)
    router.back();
  } else {
    // Fall back to navigating to the records list page
    router.push('/records');
  }
};

// Check if user can edit records
const authStore = useAuthStore();
const canEditRecords = computed(() => {
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
    label: getTypeLabel(type),
    to: `/records/${type}`,
  },
  {
    label: record.value?.title || 'Record',
  },
]);

// Handle status changed
const handleStatusChanged = (payload: { newStatus: string; record?: any }) => {
  if (record.value) {
    record.value.status = payload.newStatus;
  }
  useToast().add({
    title: 'Status Updated',
    description: `Record status changed to ${payload.newStatus}`,
    color: 'primary',
  });
};
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-lg font-semibold">
            {{ record?.title || 'Record' }}
          </h1>
        </template>
        <template #description>
          View the details of {{ record?.title || 'this record' }}
        </template>
        <template #right>
          <HeaderActions
            :actions="[
              {
                label: 'View Raw',
                icon: 'i-lucide-code',
                to: `/records/${type}/${id}/raw`,
                color: 'neutral',
                disabled: loading || !record,
              },
              {
                label: 'Edit Record',
                icon: 'i-lucide-edit',
                to: `/records/${type}/${id}/edit`,
                color: 'primary',
                show: canEditRecords,
                disabled: loading || !record,
              },
            ]"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4"
          />
          <p class="text-gray-600">Loading record...</p>
        </div>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        :title="error"
        icon="i-lucide-alert-circle"
        class="mb-4"
      >
        <template #footer>
          <UButton color="error" variant="soft" @click="fetchRecord">
            Try Again
          </UButton>
        </template>
      </UAlert>

      <!-- Record Content -->
      <div v-else-if="record" class="space-y-6">
        <!-- Record Header -->
        <div class="rounded-lg border p-6">
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <UIcon
                  :name="getTypeIcon(record.type)"
                  class="text-gray-500 text-xl"
                />
                <UBadge
                  :color="getStatusColor(record.status) as any"
                  variant="soft"
                >
                  {{ record.status }}
                </UBadge>
                <UBadge color="neutral" variant="soft">
                  {{ record.type }}
                </UBadge>
              </div>
              <h1 class="text-2xl font-bold mb-2">
                {{ record.title }}
              </h1>
              <p class="text-gray-600 dark:text-gray-400">
                Record ID:
                <code
                  class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm"
                  >{{ record.id }}</code
                >
              </p>
            </div>
          </div>

          <!-- Metadata -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div class="space-y-2">
              <div
                class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <UIcon name="i-lucide-calendar" class="w-4 h-4" />
                <span>Created: {{ formatDate(record.created_at) }}</span>
              </div>
              <div
                v-if="record.author"
                class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <UIcon name="i-lucide-user" class="w-4 h-4" />
                <span>Author: {{ record.author }}</span>
              </div>
            </div>
            <div class="space-y-2">
              <div
                v-if="record.metadata?.updated"
                class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <UIcon name="i-lucide-edit" class="w-4 h-4" />
                <span>Updated: {{ formatDate(record.metadata.updated) }}</span>
              </div>
              <div
                v-if="record.metadata?.updated"
                class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <UIcon name="i-lucide-edit" class="w-4 h-4" />
                <span>Updated: {{ formatDate(record.metadata.updated) }}</span>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div
            v-if="record.metadata?.tags && record.metadata.tags.length > 0"
            class="pt-4 border-t mt-4"
          >
            <div
              class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2"
            >
              <UIcon name="i-lucide-tags" class="w-4 h-4" />
              <span>Tags:</span>
            </div>
            <div class="flex flex-wrap gap-2">
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

        <!-- Record Content -->
        <div class="rounded-lg border">
          <div class="border-b px-6 py-4">
            <h2 class="text-lg font-semibold">Content</h2>
          </div>
          <div class="p-6">
            <div v-if="record.content" class="markdown-content">
              <!-- Render markdown content -->
              <div
                class="prose prose-sm max-w-none prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline"
                v-html="renderMarkdown(record.content)"
              />
            </div>
            <div v-else class="text-gray-500 dark:text-gray-400 italic">
              No content available for this record.
            </div>
          </div>
        </div>

        <!-- Additional Metadata -->
        <div
          v-if="record.metadata && Object.keys(record.metadata).length > 0"
          class="rounded-lg border"
        >
          <div class="border-b px-6 py-4">
            <h2 class="text-lg font-semibold">Additional Information</h2>
          </div>
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-for="(value, key) in record.metadata"
                :key="key"
                class="space-y-1"
              >
                <dt
                  class="text-sm font-medium text-gray-500 dark:text-gray-400 capitalize"
                >
                  {{ key }}
                </dt>
                <dd class="text-sm">
                  <span v-if="typeof value === 'string'">{{ value }}</span>
                  <span
                    v-else
                    class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                  >
                    {{ JSON.stringify(value) }}
                  </span>
                </dd>
              </div>
            </div>
          </div>
        </div>

        <!-- Status Transitions -->
        <StatusTransitionControls
          v-if="record"
          :record-id="record.id"
          :current-status="record.status"
          @changed="handleStatusChanged"
        />
      </div>

      <!-- No Record Found -->
      <div v-else class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-file-x"
            class="w-12 h-12 text-gray-400 mx-auto mb-4"
          />
          <h3 class="text-lg font-medium mb-2">Record Not Found</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            The record you're looking for doesn't exist or has been removed.
          </p>
          <UButton color="primary" variant="soft" @click="goBack">
            Back to Records
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
