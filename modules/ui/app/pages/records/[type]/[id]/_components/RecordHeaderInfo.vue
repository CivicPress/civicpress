<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import { useAuthStore } from '~/stores/auth';

interface Props {
  record: CivicRecord;
  statusDisplay: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatDate: (input: any) => string;
  getTypeIcon: (type: string) => string;
}

defineProps<Props>();

const { t } = useI18n();
const authStore = useAuthStore();
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 dark:border-gray-800 p-6 space-y-4"
  >
    <div
      class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600 dark:text-gray-400"
    >
      <span class="font-medium text-gray-800 dark:text-gray-100">
        Record ID:
        <code
          class="ml-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs tracking-tight"
          >{{ record.id }}</code
        >
      </span>
      <span class="inline-flex items-center gap-2">
        <UIcon
          :name="getTypeIcon(record.type)"
          class="w-4 h-4 text-gray-500"
        />
        <span class="uppercase tracking-wide">{{ record.type }}</span>
      </span>
      <span class="inline-flex items-center gap-2">
        <UIcon name="i-lucide-calendar" class="w-4 h-4 text-gray-500" />
        {{ formatDate(record.created_at) }}
      </span>
      <span v-if="record.author" class="inline-flex items-center gap-2">
        <UIcon name="i-lucide-user" class="w-4 h-4 text-gray-500" />
        {{ record.author }}
      </span>
      <span
        class="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200 dark:text-green-200 dark:ring-green-800"
      >
        <UIcon name="i-lucide-badge-check" class="w-4 h-4" />
        {{ statusDisplay }}
      </span>
      <UBadge
        v-if="
          authStore.hasPermission('records:edit') &&
          record.hasUnpublishedChanges
        "
        size="xs"
        color="error"
        variant="soft"
        class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-300"
      >
        <UIcon name="i-lucide-file-edit" class="w-3 h-3" />
        {{ t('records.unpublishedChanges') }}
      </UBadge>
    </div>

    <div
      v-if="record.metadata?.tags && record.metadata.tags.length > 0"
      class="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
    >
      <span class="font-medium">Tags:</span>
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
</template>
