<template>
  <div>
    <!-- Upload Modal -->
    <UModal
      :open="showUploadModal"
      :title="t('settings.storage.uploadFiles')"
      :description="t('settings.storage.uploadFilesDescription')"
      @update:open="$emit('update:show-upload-modal', $event)"
    >
      <template #body>
        <FileUpload
          :folder="folderName"
          :allowed-types="allowedTypes"
          :max-size="maxSize"
          @upload-complete="$emit('upload-complete', $event)"
          @upload-error="$emit('upload-error', $event)"
        />
      </template>
    </UModal>

    <!-- File Preview Modal -->
    <UModal
      :open="showPreviewModal"
      :ui="{ content: 'w-full lg:max-w-[1330px]' }"
      :title="previewFile?.name || t('settings.storage.filePreview')"
      :description="t('settings.storage.previewingFile', { type: previewFile?.mime_type || t('settings.storage.file') })"
      @update:open="$emit('update:show-preview-modal', $event)"
    >
      <template #body>
        <div v-if="previewFile" class="file-preview p-6">
          <div class="bg-gray-50 rounded-lg p-4 mb-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span class="font-medium text-gray-700">{{ t('settings.storage.size') }}:</span>
                <p class="text-gray-600">
                  {{ formatFileSize(previewFile.size) }}
                </p>
              </div>
              <div>
                <span class="font-medium text-gray-700">{{ t('common.type') }}:</span>
                <p class="text-gray-700">{{ previewFile.mime_type }}</p>
              </div>
              <div>
                <span class="font-medium text-gray-700">{{ t('settings.storage.created') }}:</span>
                <p class="text-gray-600">
                  {{ formatDate(previewFile.created) }}
                </p>
              </div>
              <div>
                <span class="font-medium text-gray-700">{{ t('settings.storage.modified') }}:</span>
                <p class="text-gray-600">
                  {{ formatDate(previewFile.modified) }}
                </p>
              </div>
            </div>
            <div v-if="previewFile.id" class="mt-4 pt-4 border-t border-gray-200">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-700">UUID:</span>
                <code class="text-xs text-gray-600 bg-white px-2 py-1 rounded border border-gray-300 font-mono break-all">
                  {{ previewFile.id }}
                </code>
                <UButton
                  size="xs"
                  variant="ghost"
                  @click="$emit('copy-clipboard', previewFile.id)"
                  class="ml-auto"
                >
                  <UIcon name="i-lucide-copy" class="w-3 h-3" />
                </UButton>
              </div>
            </div>
          </div>

          <MediaPlayer :file="previewFile" :folder="folderName" />
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end space-x-3">
          <UButton
            variant="outline"
            @click="previewFile && $emit('download-file', previewFile)"
            :disabled="!previewFile"
          >
            <UIcon name="i-lucide-download" class="w-4 h-4 mr-2" />
            {{ t('common.download') }}
          </UButton>
          <UButton @click="close">{{ t('common.close') }}</UButton>
        </div>
      </template>
    </UModal>

    <!-- Single File Delete Confirmation Modal -->
    <UModal
      :open="showDeleteModal"
      :title="t('settings.storage.deleteFile')"
      :description="t('settings.storage.deleteFileDescription')"
      @update:open="$emit('update:show-delete-modal', $event)"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            {{ t('settings.storage.deleteFileConfirm', { name: fileToDelete?.name }) }}
          </p>

          <div
            class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
          >
            <div class="flex items-start space-x-3">
              <UIcon
                name="i-lucide-alert-circle"
                class="w-5 h-5 text-red-600 mt-0.5"
              />
              <div class="text-sm text-red-700 dark:text-red-300">
                <p class="font-medium">{{ t('settings.storage.warning') }}:</p>
                <ul class="mt-1 space-y-1">
                  <li>• {{ t('settings.storage.filePermanentlyDeleted') }}</li>
                  <li>• {{ t('settings.storage.allAssociatedDataLost') }}</li>
                  <li>• {{ t('settings.storage.actionCannotBeReversed') }}</li>
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
          <UButton color="error" :loading="deleting" @click="$emit('confirm-delete')">
            {{ t('settings.storage.deleteFile') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Bulk Delete Confirmation Modal -->
    <UModal
      :open="showBulkDeleteModal"
      :title="t('settings.storage.deleteMultipleFiles')"
      :description="t('settings.storage.deleteMultipleFilesDescription')"
      @update:open="$emit('update:show-bulk-delete-modal', $event)"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            {{ t('settings.storage.deleteMultipleFilesConfirm', { count: selectedFilesCount }) }}
          </p>

          <div
            class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
          >
            <div class="flex items-start space-x-3">
              <UIcon
                name="i-lucide-alert-circle"
                class="w-5 h-5 text-red-600 mt-0.5"
              />
              <div class="text-sm text-red-700 dark:text-red-300">
                <p class="font-medium">{{ t('settings.storage.warning') }}:</p>
                <ul class="mt-1 space-y-1">
                  <li>• {{ t('settings.storage.allSelectedFilesDeleted') }}</li>
                  <li>• {{ t('settings.storage.allAssociatedDataLost') }}</li>
                  <li>• {{ t('settings.storage.actionCannotBeReversed') }}</li>
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
          <UButton color="error" :loading="deleting" @click="$emit('confirm-bulk-delete')">
            {{ t('settings.storage.deleteFiles', { count: selectedFilesCount }) }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import FileUpload from '../FileUpload.vue';
import MediaPlayer from '../MediaPlayer.vue';
import type { FileInfo } from '~/composables/useFileBrowser';

interface Props {
  showUploadModal: boolean;
  showPreviewModal: boolean;
  showDeleteModal: boolean;
  showBulkDeleteModal: boolean;
  previewFile: FileInfo | null;
  fileToDelete: FileInfo | null;
  deleting: boolean;
  selectedFilesCount: number;
  folderName: string;
  allowedTypes: string[];
  maxSize: string;
  formatFileSize: (bytes: number) => string;
  formatDate: (dateString: string) => string;
}

defineProps<Props>();

defineEmits<{
  'update:show-upload-modal': [value: boolean];
  'update:show-preview-modal': [value: boolean];
  'update:show-delete-modal': [value: boolean];
  'update:show-bulk-delete-modal': [value: boolean];
  'upload-complete': [files: any[]];
  'upload-error': [error: string];
  'copy-clipboard': [text: string];
  'download-file': [file: FileInfo];
  'confirm-delete': [];
  'confirm-bulk-delete': [];
}>();

const { t } = useI18n();
</script>

<style scoped>
/* File Preview */
.file-preview {
  min-height: 24rem;
}

/* Modal Enhancements */
:deep(.u-modal) {
  z-index: 50;
}

:deep(.u-card) {
  max-width: 72rem;
  margin: 0 auto;
}

:deep(.u-modal-content) {
  max-height: 90vh;
  overflow-y: auto;
}
</style>
