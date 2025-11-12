<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import LinkedRecordList from '~/components/records/LinkedRecordList.vue';
import GeographyLinkDisplay from '~/components/GeographyLinkDisplay.vue';

// Route parameters
const route = useRoute();
const router = useRouter();
const type = route.params.type as string;
const id = route.params.id as string;

// Reactive state
const record = ref<CivicRecord | null>(null);
const loading = ref(false);
const error = ref('');

// Composables
const { $api } = useNuxtApp();
const { renderMarkdown } = useMarkdown();

const markdownContainer = ref<HTMLElement | null>(null);

const rewriteLinks = (
  root: Document | DocumentFragment | Element,
  currentRecordPath: string
) => {
  const anchors = root.querySelectorAll('a[href]');
  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';

    if (isExternalLink(href)) {
      return;
    }

    const resolved = resolveRecordLink(href, currentRecordPath);
    if (!resolved) {
      return;
    }

    anchor.setAttribute('href', resolved);
    anchor.setAttribute('data-record-link', 'true');
  });
};

const isExternalLink = (href: string) => {
  return /^(https?:|mailto:|tel:)/i.test(href);
};

const resolveRecordLink = (
  href: string,
  currentRecordPath: string
): string | null => {
  if (!href.endsWith('.md')) {
    return null;
  }

  let normalizedCurrent = currentRecordPath.replace(/\\/g, '/');
  if (!normalizedCurrent.startsWith('records/')) {
    normalizedCurrent = `records/${normalizedCurrent.replace(/^\/+/, '')}`;
  }
  const currentDir = normalizedCurrent.includes('/')
    ? normalizedCurrent.substring(0, normalizedCurrent.lastIndexOf('/'))
    : normalizedCurrent;

  let combinedPath: string;
  if (href.startsWith('.')) {
    combinedPath = normalizeRelativePath(`${currentDir}/${href}`);
  } else if (href.includes('/')) {
    combinedPath = normalizeRelativePath(
      href.startsWith('records/') ? href : `${currentDir}/${href}`
    );
  } else {
    combinedPath = normalizeRelativePath(`${currentDir}/${href}`);
  }

  if (!combinedPath.startsWith('records/')) {
    return null;
  }

  const pathParts = combinedPath.split('/');
  if (pathParts.length < 3) {
    return null;
  }

  const type = pathParts[1];
  const filename = pathParts[pathParts.length - 1];
  if (!filename) {
    return null;
  }
  const recordId = filename.replace(/\.md$/i, '');

  if (!type || !recordId) {
    return null;
  }

  return `/records/${type}/${recordId}`;
};

const normalizeRelativePath = (path: string): string => {
  const segments = path.split('/');
  const stack: string[] = [];

  segments.forEach((segment) => {
    if (segment === '..') {
      stack.pop();
    } else if (segment !== '.' && segment !== '') {
      stack.push(segment);
    }
  });

  return stack.join('/');
};

const applyLinkTransformations = () => {
  if (!process.client) {
    return;
  }

  if (!record.value?.path) {
    return;
  }

  const container = markdownContainer.value;
  if (!container) {
    return;
  }

  rewriteLinks(container, record.value.path);
};

const renderedContent = computed(() => {
  if (!record.value?.content) {
    return '';
  }

  return renderMarkdown(record.value.content, {
    preserveLineBreaks: true,
  });
});

watch(
  () => renderedContent.value,
  () => {
    if (!process.client) {
      return;
    }
    nextTick(() => applyLinkTransformations());
  }
);

watch(
  () => record.value?.path,
  () => {
    if (!process.client) {
      return;
    }
    nextTick(() => applyLinkTransformations());
  }
);

onMounted(() => {
  if (!process.client) {
    return;
  }
  nextTick(() => applyLinkTransformations());
});

const handleContentClick = (event: MouseEvent) => {
  if (!process.client) {
    return;
  }

  const target = event.target as Element | null;
  if (!target) {
    return;
  }

  const link = target.closest(
    'a[data-record-link="true"]'
  ) as HTMLAnchorElement | null;

  if (!link) {
    return;
  }

  const href = link.getAttribute('href');
  if (!href) {
    return;
  }

  event.preventDefault();
  router.push(href);
};
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
        linkedGeographyFiles: apiRecord.linkedGeographyFiles || [],
        metadata: apiRecord.metadata || {},
        attachedFiles: apiRecord.attachedFiles || [],
        linkedRecords: apiRecord.linkedRecords || [],
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
    record.value.status = payload.newStatus as CivicRecord['status'];
  }
  useToast().add({
    title: 'Status Updated',
    description: `Record status changed to ${payload.newStatus}`,
    color: 'primary',
  });
};

const detailAccordionItems = computed(() => {
  const currentRecord = record.value;

  return [
    {
      label: 'Linked Records',
      value: 'linked-records',
      iconName: 'i-lucide-link-2',
      description: currentRecord?.linkedRecords?.length
        ? `${currentRecord.linkedRecords.length} linked`
        : 'No linked records',
    },
    {
      label: 'File Attachments',
      value: 'attachments',
      iconName: 'i-lucide-paperclip',
      description: currentRecord?.attachedFiles?.length
        ? `${currentRecord.attachedFiles.length} files`
        : 'No attachments',
    },
    {
      label: 'Linked Geography',
      value: 'linked-geography',
      iconName: 'i-lucide-map-pin',
      description: currentRecord?.linkedGeographyFiles?.length
        ? `${currentRecord.linkedGeographyFiles.length} items`
        : 'No linked geography',
    },
    {
      label: 'Additional Information',
      value: 'additional-info',
      iconName: 'i-lucide-info',
      description:
        currentRecord?.metadata &&
        Object.keys(currentRecord.metadata).length > 0
          ? `${Object.keys(currentRecord.metadata).length} fields`
          : 'No additional metadata',
    },
  ];
});

// Handle file download
const downloadFile = async (fileId: string, fileName: string) => {
  if (!process.client) return;

  try {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(
      `${config.public.civicApiUrl}/api/v1/storage/files/${fileId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get the blob data
    const blob = await response.blob();

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
    useToast().add({
      title: 'Download Failed',
      description: 'Failed to download the file. Please try again.',
      color: 'error',
    });
  }
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
            <div
              v-if="record.content"
              class="markdown-content"
              @click="handleContentClick"
            >
              <!-- Render markdown content -->
              <div
                ref="markdownContainer"
                class="prose prose-sm max-w-none prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline"
                v-html="renderedContent"
              />
            </div>
            <div v-else class="text-gray-500 dark:text-gray-400 italic">
              No content available for this record.
            </div>
          </div>
        </div>

        <UAccordion
          :items="detailAccordionItems"
          class="rounded-lg border"
          :ui="{
            item: 'border-b last:border-b-0',
            trigger: 'px-6 py-4 flex items-center gap-3 text-sm font-medium',
            content: 'px-6 pb-6 pt-0',
          }"
        >
          <template #default="{ item }">
            <div class="flex items-center gap-3">
              <UIcon :name="item.iconName" class="text-gray-500" />
              <div class="flex flex-col text-left">
                <span>{{ item.label }}</span>
                <span class="text-xs text-gray-500">
                  {{ item.description }}
                </span>
              </div>
            </div>
          </template>

          <template #content="{ item }">
            <div v-if="item.value === 'linked-records'">
              <LinkedRecordList
                v-if="record.linkedRecords && record.linkedRecords.length > 0"
                :model-value="record.linkedRecords"
                :editable="false"
              />
              <div v-else class="text-gray-500 dark:text-gray-400 italic">
                No records linked to this record.
              </div>
            </div>

            <div v-else-if="item.value === 'attachments'" class="space-y-4">
              <div
                v-if="record.attachedFiles && record.attachedFiles.length > 0"
                class="space-y-4"
              >
                <div
                  v-for="file in record.attachedFiles"
                  :key="file.id"
                  class="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-3 mb-2">
                        <h3
                          class="text-sm font-medium text-gray-900 dark:text-white"
                        >
                          {{ file.original_name }}
                        </h3>
                        <span
                          v-if="file.category"
                          class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        >
                          {{
                            typeof file.category === 'object'
                              ? file.category.label
                              : file.category
                          }}
                        </span>
                      </div>
                      <div
                        class="space-y-1 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <div class="flex items-center gap-2">
                          <UIcon name="i-lucide-link" class="w-4 h-4" />
                          <span class="font-mono text-xs">{{ file.id }}</span>
                        </div>
                        <div class="flex items-center gap-2">
                          <UIcon name="i-lucide-folder" class="w-4 h-4" />
                          <span>{{ file.path }}</span>
                        </div>
                        <div
                          v-if="file.description"
                          class="flex items-center gap-2"
                        >
                          <UIcon name="i-lucide-file-text" class="w-4 h-4" />
                          <span>{{ file.description }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="ml-4">
                      <UButton
                        icon="i-lucide-download"
                        color="primary"
                        variant="outline"
                        size="sm"
                        @click="downloadFile(file.id, file.original_name)"
                        title="Download file"
                      >
                        Download
                      </UButton>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="text-gray-500 dark:text-gray-400 italic">
                No files attached to this record.
              </div>
            </div>

            <div v-else-if="item.value === 'linked-geography'">
              <GeographyLinkDisplay
                :linked-geography-files="record.linkedGeographyFiles || []"
              />
            </div>

            <div v-else-if="item.value === 'additional-info'">
              <div
                v-if="
                  record.metadata && Object.keys(record.metadata).length > 0
                "
                class="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
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
                    <template
                      v-if="
                        key === 'attendees' &&
                        Array.isArray(value) &&
                        value.length
                      "
                    >
                      <ul class="space-y-2">
                        <li
                          v-for="(attendee, attendeeIndex) in value"
                          :key="attendeeIndex"
                          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                        >
                          <span class="font-medium">
                            {{ attendee.name || 'Unknown Attendee' }}
                          </span>
                          <span
                            v-if="attendee.role"
                            class="text-gray-500 dark:text-gray-400"
                          >
                            {{ attendee.role }}
                          </span>
                          <UBadge
                            v-if="attendee.status"
                            color="neutral"
                            variant="soft"
                            size="xs"
                          >
                            {{ attendee.status }}
                          </UBadge>
                        </li>
                      </ul>
                    </template>
                    <span v-else-if="typeof value === 'string'">{{
                      value
                    }}</span>
                    <span
                      v-else
                      class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                    >
                      {{ JSON.stringify(value) }}
                    </span>
                  </dd>
                </div>
              </div>
              <div class="text-gray-500 dark:text-gray-400 italic" v-else>
                No additional metadata available for this record.
              </div>
            </div>
          </template>
        </UAccordion>

        <!-- Status Transitions -->
        <StatusTransitionControls
          v-if="record"
          :record-id="record.id"
          :current-status="record.status"
          :user-can-change-status="authStore.hasPermission('records:status')"
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

<style scoped>
:deep(.markdown-empty-line) {
  display: block;
  height: 0.75rem;
  margin: 0;
  content: '';
}

:deep(.markdown-content p) {
  margin: 0;
  line-height: 1.4rem;
}
</style>
