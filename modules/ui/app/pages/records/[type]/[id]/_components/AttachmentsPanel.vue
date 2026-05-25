<script setup lang="ts">
interface AttachedFile {
  id: string;
  path: string;
  original_name: string;
  description?: string;
  category?: string | { label: string };
}

interface Props {
  attachedFiles?: AttachedFile[];
}

defineProps<Props>();

defineEmits<{
  download: [fileId: string, fileName: string];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="attachedFiles && attachedFiles.length > 0"
      class="space-y-4"
    >
      <div
        v-for="file in attachedFiles"
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
              :title="t('records.downloadFile')"
              @click="$emit('download', file.id, file.original_name)"
            >
              {{ t('records.download') }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-8">
      <UIcon
        name="i-lucide-paperclip"
        class="w-12 h-12 text-gray-400 mx-auto mb-4"
      />
      <h4
        class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2"
      >
        {{ t('records.attachments.noFilesAttachedTitle') }}
      </h4>
      <p class="text-gray-600 dark:text-gray-400 mb-4">
        {{ t('records.attachments.noFilesAttachedDesc') }}
      </p>
    </div>
  </div>
</template>
