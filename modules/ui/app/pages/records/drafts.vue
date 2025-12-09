<script setup lang="ts">
import SystemFooter from '~/components/SystemFooter.vue';
import { useRecordsStore } from '~/stores/records';
import { useAuthStore } from '~/stores/auth';

// Page metadata - require authentication
definePageMeta({
  middleware: ['require-auth'],
});

const { t } = useI18n();
const authStore = useAuthStore();
const $civicApi = useNuxtApp().$civicApi;

// Record utilities
const {
  formatDate,
  formatRelativeTime,
  getTypeLabel,
  getTypeIcon,
  getStatusLabel,
  getStatusColor,
} = useRecordUtils();

// Reactive state
const drafts = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// Fetch all drafts from record_drafts table
const fetchDrafts = async () => {
  loading.value = true;
  error.value = null;

  try {
    // Fetch only from drafts endpoint - all drafts, unpublished changes, and internal docs are in record_drafts table
    const response = (await $civicApi('/api/v1/records/drafts')) as any;

    if (response?.success && response?.data?.drafts) {
      // All drafts are in record_drafts table - no need to combine multiple sources
      drafts.value = response.data.drafts;

      // Sort by updated_at descending
      drafts.value.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.last_draft_saved_at || 0);
        const dateB = new Date(b.updated_at || b.last_draft_saved_at || 0);
        return dateB.getTime() - dateA.getTime();
      });
    } else {
      throw new Error('Failed to load drafts');
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to load drafts';
    console.error('Error fetching drafts:', err);
  } finally {
    loading.value = false;
  }
};

// Navigate to edit page
const editDraft = (draft: any) => {
  navigateTo(`/records/${draft.type}/${draft.id}/edit`);
};

// Delete draft
const deleteDraft = async (draft: any) => {
  if (!confirm(`Are you sure you want to delete "${draft.title}"?`)) {
    return;
  }

  try {
    // Delete draft via API (we'll need to add this endpoint)
    // For now, we'll just remove it from the list
    await $civicApi(`/api/v1/records/${draft.id}/draft`, {
      method: 'DELETE',
    });

    // Remove from list
    drafts.value = drafts.value.filter((d) => d.id !== draft.id);
  } catch (err: any) {
    console.error('Error deleting draft:', err);
    // Show error toast
    const toast = useToast();
    toast.add({
      title: 'Delete failed',
      description: err.message || 'Failed to delete draft',
      color: 'error',
    });
  }
};

// Fetch drafts on mount
onMounted(() => {
  fetchDrafts();
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
    label: t('records.drafts.title', 'Drafts'),
  },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('records.drafts.title', 'Drafts') }}
          </h1>
        </template>
        <template #description>
          {{
            t(
              'records.drafts.description',
              'View all drafts and unpublished changes'
            )
          }}
        </template>
        <template #right>
          <HeaderActions
            v-if="
              authStore.isLoggedIn && authStore.hasPermission('records:create')
            "
            :actions="[
              {
                label: t('records.createRecord'),
                icon: 'i-lucide-plus',
                to: '/records/new',
                color: 'primary',
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
        <div v-if="loading" class="space-y-4">
          <div class="text-center py-12">
            <UIcon
              name="i-lucide-loader-2"
              class="w-8 h-8 animate-spin text-gray-500 mx-auto mb-4"
            />
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('records.drafts.loading', 'Loading drafts...') }}
            </p>
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

        <!-- Drafts List -->
        <div v-else-if="drafts.length > 0" class="space-y-4">
          <div
            v-for="draft in drafts"
            :key="draft.id"
            class="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:shadow-md transition-all cursor-pointer"
            @click="editDraft(draft)"
          >
            <div class="flex items-start justify-between gap-4">
              <!-- Left: Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-2">
                  <h3
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{
                      draft.title ||
                      t('records.drafts.untitled', 'Untitled Draft')
                    }}
                  </h3>
                  <!-- Optional: Show badge for internal documents -->
                  <UBadge
                    v-if="draft.workflowState === 'internal_only'"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    {{ t('records.drafts.badge.internal', 'Internal') }}
                  </UBadge>
                </div>

                <div
                  class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3"
                >
                  <div class="flex items-center gap-1">
                    <UIcon :name="getTypeIcon(draft.type)" class="w-4 h-4" />
                    <span>{{ getTypeLabel(draft.type) }}</span>
                  </div>
                  <span>•</span>
                  <span v-if="draft.last_draft_saved_at || draft.updated_at">
                    {{
                      (() => {
                        const dateStr =
                          draft.last_draft_saved_at || draft.updated_at;
                        const label = draft.last_draft_saved_at
                          ? 'Last saved'
                          : 'Updated';

                        // Normalize date string (convert SQLite format to ISO with UTC indicator)
                        const normalizedDateStr = (() => {
                          if (!dateStr) return '';
                          // If already has timezone indicator, ensure it's in ISO format
                          if (
                            dateStr.includes('Z') ||
                            dateStr.includes('+') ||
                            dateStr.includes('T')
                          ) {
                            return dateStr
                              .replace(' ', 'T')
                              .replace(/(\d{2}:\d{2}:\d{2})(?!Z|[+-])/, '$1Z');
                          }
                          // Convert SQLite format "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ"
                          return dateStr.replace(' ', 'T') + 'Z';
                        })();

                        const dateObj = new Date(normalizedDateStr);

                        // Validate date
                        if (isNaN(dateObj.getTime())) {
                          return '';
                        }

                        // Calculate time difference
                        const diffInSeconds = Math.floor(
                          (Date.now() - dateObj.getTime()) / 1000
                        );

                        // Format time (e.g., "2:30 PM")
                        const timeStr = dateObj.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        });

                        // If date is in the future (likely a timezone/parsing issue), show formatted date with time
                        if (diffInSeconds < 0) {
                          return `${label} ${formatDate(dateStr, { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                        }

                        // For recent dates, show relative time with actual time
                        const relativeTime = formatRelativeTime(dateStr);
                        return `${label} ${relativeTime} at ${timeStr}`;
                      })()
                    }}
                  </span>
                </div>

                <!-- Preview snippet -->
                <p
                  v-if="draft.markdownBody || draft.content"
                  class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-2"
                >
                  {{
                    (draft.markdownBody || draft.content || '').substring(
                      0,
                      150
                    )
                  }}
                  {{
                    (draft.markdownBody || draft.content || '').length > 150
                      ? '...'
                      : ''
                  }}
                </p>
              </div>

              <!-- Right: Actions -->
              <div class="flex items-center gap-2 flex-shrink-0">
                <UButton
                  icon="i-lucide-edit"
                  variant="ghost"
                  size="sm"
                  @click.stop="editDraft(draft)"
                  aria-label="Edit draft"
                >
                  Edit
                </UButton>
                <UDropdownMenu
                  :items="[
                    [
                      {
                        label: 'Delete',
                        icon: 'i-lucide-trash-2',
                        click: () => deleteDraft(draft),
                      },
                    ],
                  ]"
                  :content="{ align: 'end', collisionPadding: 8 }"
                >
                  <UButton
                    icon="i-lucide-more-vertical"
                    variant="ghost"
                    size="sm"
                    @click.stop
                    aria-label="More options"
                  />
                </UDropdownMenu>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-16">
          <div class="max-w-md mx-auto">
            <UIcon
              name="i-lucide-file-text"
              class="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4"
            />
            <h3
              class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2"
            >
              {{ t('records.drafts.empty.title', 'No drafts yet') }}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {{
                t(
                  'records.drafts.empty.description',
                  'When you save a record as a draft or it has an unpublished workflow state, it will appear here. You can continue editing drafts before publishing them.'
                )
              }}
            </p>
            <UButton
              v-if="
                authStore.isLoggedIn &&
                authStore.hasPermission('records:create')
              "
              to="/records/new"
              color="primary"
              icon="i-lucide-plus"
            >
              Create New Record
            </UButton>
          </div>
        </div>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
