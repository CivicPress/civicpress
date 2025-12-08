<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRecordStatuses } from '~/composables/useRecordStatuses';
import { useRecordUtils } from '~/composables/useRecordUtils';

const { t } = useI18n();

interface Props {
  title: string;
  status: string;
  isDraft?: boolean;
  isEditing?: boolean;
  autosaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved?: Date | null;
  disabled?: boolean;
  allowedTransitions?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  isDraft: false,
  isEditing: false,
  autosaveStatus: 'idle',
  disabled: false,
  allowedTransitions: () => [],
});

const emit = defineEmits<{
  'update:title': [value: string];
  'update:status': [value: string];
  'save-changes': [];
  'save-draft': [];
  publish: [status?: string];
  unpublish: [];
  archive: [];
  delete: [];
  'view-history': [];
  duplicate: [];
  export: [];
}>();

const { getRecordStatusLabel, recordStatusOptions } = useRecordStatuses();
const { getStatusConfig } = useRecordUtils();

// Modal states
const showPublishModal = ref(false);
const showUnpublishModal = ref(false);
const showArchiveModal = ref(false);
const showDeleteModal = ref(false);
const selectedPublishStatus = ref<string | null>(null);

const statusConfig = computed(() => {
  return getStatusConfig(props.status);
});

// Get available status transitions
const availableTransitions = computed(() => {
  const options = recordStatusOptions();
  return options.filter((option: any) =>
    props.allowedTransitions.includes(option.value)
  );
});

// Check if status is published (not draft)
const isPublished = computed(() => {
  const publishedStatuses = ['published', 'active', 'approved'];
  return publishedStatuses.includes(props.status.toLowerCase());
});

// Check if status is archived
const isArchived = computed(() => {
  return props.status.toLowerCase() === 'archived';
});

// Build dropdown menu items (grouped by sections)
const dropdownItems = computed(() => {
  const sections: any[][] = [];
  const firstSection: any[] = [];

  // Show "Save and Publish" option in dropdown
  // Publishing should always be available if user is editing (not dependent on workflow transitions)
  if (props.isEditing && !isArchived.value) {
    firstSection.push({
      label: t('records.editor.saveAndPublish'),
      icon: 'i-lucide-send',
      onClick: () => {
        selectedPublishStatus.value = props.status;
        showPublishModal.value = true;
      },
    });
  }

  if (firstSection.length > 0) {
    sections.push(firstSection);
  }

  // Status transitions section
  const transitionsSection: any[] = [];

  // Status transitions based on current state
  if (isPublished.value) {
    // For published records: Unpublish option
    if (props.allowedTransitions.includes('draft')) {
      transitionsSection.push({
        label: t('records.editor.unpublishToDraft'),
        icon: 'i-lucide-undo',
        onClick: () => {
          showUnpublishModal.value = true;
        },
      });
    }
  }
  // Note: Publish option is now in firstSection, not here

  // Archive option (if not already archived and allowed)
  if (!isArchived.value && props.allowedTransitions.includes('archived')) {
    transitionsSection.push({
      label: t('records.editor.archiveRecord'),
      icon: 'i-lucide-archive',
      onClick: () => {
        showArchiveModal.value = true;
      },
    });
  }

  // Other status transitions
  const otherTransitions = availableTransitions.value.filter((option: any) => {
    const status = option.value.toLowerCase();
    // Exclude draft (handled by unpublish), published/active/approved (handled by publish), archived (handled separately)
    return !['draft', 'published', 'active', 'approved', 'archived'].includes(
      status
    );
  });

  otherTransitions.forEach((option: any) => {
    transitionsSection.push({
      label: t('records.editor.changeStatusTo', { status: option.label }),
      icon: option.icon || 'i-lucide-circle',
      onClick: () => {
        selectedPublishStatus.value = option.value;
        showPublishModal.value = true;
      },
    });
  });

  if (transitionsSection.length > 0) {
    sections.push(transitionsSection);
  }

  return sections;
});

// More menu items (grouped by sections)
const moreMenuItems = computed(() => {
  const sections: any[][] = [];

  if (props.isEditing) {
    const toolsSection: any[] = [];

    toolsSection.push({
      label: t('records.editor.viewHistory'),
      icon: 'i-lucide-history',
      onClick: () => emit('view-history'),
    });

    toolsSection.push({
      label: t('records.editor.duplicateRecord'),
      icon: 'i-lucide-copy',
      onClick: () => emit('duplicate'),
    });

    toolsSection.push({
      label: t('records.editor.exportAsMarkdown'),
      icon: 'i-lucide-download',
      onClick: () => emit('export'),
    });

    sections.push(toolsSection);

    // Delete section (separate)
    sections.push([
      {
        label: t('common.delete'),
        icon: 'i-lucide-trash-2',
        onClick: () => {
          showDeleteModal.value = true;
        },
      },
    ]);
  }

  return sections;
});

const handlePublish = () => {
  selectedPublishStatus.value = props.status;
  showPublishModal.value = true;
};

const confirmPublish = () => {
  emit('publish', selectedPublishStatus.value || undefined);
  showPublishModal.value = false;
  selectedPublishStatus.value = null;
};

const confirmUnpublish = () => {
  emit('unpublish');
  showUnpublishModal.value = false;
};

const confirmArchive = () => {
  emit('archive');
  showArchiveModal.value = false;
};

const confirmDelete = () => {
  emit('delete');
  showDeleteModal.value = false;
};

const autosaveIndicator = computed(() => {
  switch (props.autosaveStatus) {
    case 'saving':
      return {
        icon: 'i-lucide-loader-2',
        text: t('records.editor.saving'),
        color: 'primary',
      };
    case 'saved':
      return {
        icon: 'i-lucide-check',
        text: props.lastSaved
          ? `${t('records.editor.saved')} ${formatTime(props.lastSaved)}`
          : t('records.editor.saved'),
        color: 'success',
      };
    case 'error':
      return {
        icon: 'i-lucide-alert-circle',
        text: t('records.editor.saveFailed'),
        color: 'error',
      };
    default:
      return {
        icon: 'i-lucide-circle',
        text: t('records.editor.notSaved'),
        color: 'gray',
      };
  }
});

const formatTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) return t('records.editor.justNow');
  if (minutes === 1) return t('records.editor.oneMinuteAgo');
  if (minutes < 60)
    return (t as any)('records.editor.minutesAgo', minutes, { count: minutes });
  return date.toLocaleTimeString();
};
</script>

<template>
  <div
    class="editor-header bg-white dark:bg-gray-900 px-8 border-b border-gray-200 dark:border-gray-800 w-full"
  >
    <div class="flex items-center gap-6 w-full py-4">
      <!-- Left: Title Input (Full width) -->
      <div class="flex-1 min-w-0">
        <UInput
          :model-value="title"
          @update:model-value="emit('update:title', $event)"
          :disabled="disabled"
          :placeholder="t('records.recordTitle')"
          class="w-full text-2xl font-medium !border-0 border-b border-gray-300 dark:border-gray-700 !rounded-none !px-0 py-3 focus:ring-0 focus:border-primary-500 dark:focus:border-primary-400 !bg-transparent placeholder-gray-400 dark:placeholder-gray-500 !shadow-none"
          :aria-label="t('records.recordTitle')"
        />
      </div>

      <!-- Right: Status + Actions Group -->
      <div class="flex items-center gap-2.5 flex-shrink-0">
        <!-- Autosave Indicator (Small, muted) -->
        <div
          class="hidden md:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
        >
          <UIcon
            :name="autosaveIndicator.icon"
            class="w-3.5 h-3.5 flex-shrink-0"
            :class="{
              'animate-spin': autosaveStatus === 'saving',
              'text-green-500 dark:text-green-400': autosaveStatus === 'saved',
              'text-red-500 dark:text-red-400': autosaveStatus === 'error',
              'text-gray-400': autosaveStatus === 'idle',
            }"
            aria-hidden="true"
          />
          <span class="truncate max-w-[100px]">{{
            autosaveIndicator.text
          }}</span>
        </div>

        <!-- Save Split Button -->
        <div class="flex items-center gap-0">
          <UButton
            color="primary"
            size="sm"
            :disabled="disabled || autosaveStatus === 'saving'"
            @click="emit('save-changes')"
            class="rounded-r-none"
          >
            {{ t('common.save') }}
          </UButton>

          <UDropdownMenu
            :items="dropdownItems"
            :content="{ align: 'end', collisionPadding: 8 }"
          >
            <UButton
              color="primary"
              size="sm"
              icon="i-lucide-chevron-down"
              :disabled="disabled"
              class="rounded-l-none border-l border-primary-600 dark:border-primary-500"
              :aria-label="t('records.editor.saveOptions')"
            />
          </UDropdownMenu>
        </div>

        <!-- More Menu -->
        <UDropdownMenu
          v-if="isEditing && moreMenuItems.length > 0"
          :items="moreMenuItems"
          :content="{ align: 'end', collisionPadding: 8 }"
        >
          <UButton
            icon="i-lucide-more-vertical"
            variant="ghost"
            size="sm"
            :disabled="disabled"
            :aria-label="t('common.actions')"
          />
        </UDropdownMenu>
      </div>
    </div>

    <!-- Publish Confirmation Modal -->
    <UModal
      v-model:open="showPublishModal"
      :title="t('records.editor.publishRecord')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            {{ t('records.editor.publishDescription') }}
          </p>
          <div
            class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
          >
            <div class="flex items-start space-x-3">
              <UIcon
                name="i-lucide-alert-triangle"
                class="w-5 h-5 text-yellow-600 mt-0.5"
              />
              <div class="text-sm text-yellow-700 dark:text-yellow-300">
                <p class="font-medium">{{ t('records.editor.warning') }}</p>
                <ul class="mt-1 space-y-1">
                  <li>• {{ t('records.editor.willBeCommittedToGit') }}</li>
                  <li>• {{ t('records.editor.changesPubliclyVisible') }}</li>
                  <li>• {{ t('records.editor.cannotBeUndone') }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end space-x-3">
          <UButton color="neutral" variant="outline" @click="close">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" @click="confirmPublish">
            {{ t('records.editor.publish') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Unpublish Confirmation Modal -->
    <UModal
      v-model:open="showUnpublishModal"
      :title="t('records.editor.unpublishRecord')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            {{ t('records.editor.unpublishDescription') }}
          </p>
          <div
            class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
          >
            <div class="flex items-start space-x-3">
              <UIcon
                name="i-lucide-alert-triangle"
                class="w-5 h-5 text-yellow-600 mt-0.5"
              />
              <div class="text-sm text-yellow-700 dark:text-yellow-300">
                <p class="font-medium">{{ t('records.editor.warning') }}</p>
                <ul class="mt-1 space-y-1">
                  <li>• {{ t('records.editor.willRevertToDraft') }}</li>
                  <li>• {{ t('records.editor.willNoLongerBePublic') }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end space-x-3">
          <UButton color="neutral" variant="outline" @click="close">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" @click="confirmUnpublish">
            {{ t('records.editor.unpublishToDraft') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Archive Confirmation Modal -->
    <UModal
      v-model:open="showArchiveModal"
      :title="t('records.editor.archiveRecord')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            {{ t('records.editor.archiveDescription') }}
          </p>
          <div
            class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
          >
            <div class="flex items-start space-x-3">
              <UIcon
                name="i-lucide-alert-triangle"
                class="w-5 h-5 text-yellow-600 mt-0.5"
              />
              <div class="text-sm text-yellow-700 dark:text-yellow-300">
                <p class="font-medium">{{ t('records.editor.warning') }}</p>
                <ul class="mt-1 space-y-1">
                  <li>• {{ t('records.editor.willBeArchived') }}</li>
                  <li>• {{ t('records.editor.willBeReadOnly') }}</li>
                  <li>• {{ t('records.editor.willNotBePublic') }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end space-x-3">
          <UButton color="neutral" variant="outline" @click="close">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" @click="confirmArchive">
            {{ t('records.editor.archiveRecord') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal
      v-model:open="showDeleteModal"
      :title="t('records.editor.deleteRecord')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            {{ t('records.editor.deleteDescription') }}
          </p>
          <div
            class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
          >
            <div class="flex items-start space-x-3">
              <UIcon
                name="i-lucide-alert-triangle"
                class="w-5 h-5 text-red-600 mt-0.5"
              />
              <div class="text-sm text-red-700 dark:text-red-300">
                <p class="font-medium">{{ t('records.editor.warning') }}</p>
                <ul class="mt-1 space-y-1">
                  <li>• {{ t('records.editor.cannotBeUndone') }}</li>
                  <li>• {{ t('records.editor.allDataWillBeLost') }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end space-x-3">
          <UButton color="neutral" variant="outline" @click="close">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="error" @click="confirmDelete">
            {{ t('common.delete') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.editor-header {
  /* Clean, minimal header */
  background-color: rgb(255, 255, 255);
}

.dark .editor-header {
  background-color: rgb(17, 24, 39);
}
</style>
