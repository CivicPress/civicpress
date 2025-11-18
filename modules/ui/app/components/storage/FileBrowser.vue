<template>
  <div class="file-browser">
    <!-- Search and Filters -->
    <div class="filters mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UInput
          v-model="searchQuery"
          :placeholder="t('settings.storage.searchFiles')"
          icon="i-lucide-search"
          @input="debouncedSearch"
          clearable
        />

        <USelectMenu
          v-model="selectedType"
          :items="fileTypeOptions"
          multiple
          :placeholder="t('settings.storage.allTypes')"
          icon="i-lucide-filter"
        />

        <USelectMenu
          v-model="sortBy"
          :items="sortOptions"
          :placeholder="t('settings.storage.sortBy')"
          icon="i-lucide-sort-asc"
        />
      </div>
    </div>

    <!-- File Grid/List -->
    <div class="file-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="flex flex-col items-center justify-center py-16">
          <div
            class="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-4"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-8 h-8 text-blue-600 animate-spin"
            />
          </div>
          <span class="text-gray-600 font-medium">{{ t('settings.storage.loadingFiles') }}</span>
          <span class="text-gray-400 text-sm mt-1"
            >{{ t('settings.storage.loadingFilesDescription') }}</span
          >
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredFiles.length === 0" class="empty-state">
        <div class="text-center py-16 px-6">
          <div
            class="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <UIcon
              name="i-lucide-folder-open"
              class="w-12 h-12 text-gray-400"
            />
          </div>
          <h3 class="text-xl font-semibold text-gray-900 mb-3">
            {{ searchQuery ? t('settings.storage.noFilesFound') : t('settings.storage.noFilesInFolder') }}
          </h3>
          <p class="text-gray-500 mb-6 max-w-md mx-auto">
            {{
              searchQuery
                ? t('settings.storage.tryAdjustingSearch')
                : t('settings.storage.folderEmpty')
            }}
          </p>
          <UButton
            v-if="!searchQuery && canUpload"
            @click="showUploadModal = true"
            color="primary"
            size="lg"
            class="hover:shadow-lg transition-shadow"
          >
            <UIcon name="i-lucide-upload" class="w-5 h-5 mr-2" />
            {{ t('settings.storage.uploadFiles') }}
          </UButton>
        </div>
      </div>

      <!-- File Grid -->
      <div v-else class="file-grid">
        <div
          v-for="file in paginatedFiles"
          :key="file.path"
          class="file-item group"
          :class="{ selected: selectedFiles.includes(file.path) }"
        >
          <!-- File Icon and Info -->
          <div class="file-main" @click="selectFile(file)">
            <div class="file-icon">
              <UIcon
                :name="getFileIcon(file.mime_type)"
                class="w-12 h-12"
                :class="getFileIconColor(file.mime_type)"
              />
            </div>

            <div class="file-info">
              <p class="file-name" :title="file.name">
                {{ file.name }}
              </p>
              <p class="file-size">
                {{ formatFileSize(file.size) }}
              </p>
              <p class="file-date">
                {{ formatDate(file.modified) }}
              </p>
            </div>
          </div>

          <!-- File Actions -->
          <div class="file-actions">
            <UButton
              size="sm"
              variant="ghost"
              @click="openPreview(file)"
              :disabled="!canPreview(file)"
            >
              <UIcon name="i-lucide-eye" class="w-4 h-4" />
            </UButton>

            <UButton size="sm" variant="ghost" @click="downloadFile(file)">
              <UIcon name="i-lucide-download" class="w-4 h-4" />
            </UButton>

            <UButton
              v-if="canDelete"
              size="sm"
              variant="ghost"
              color="error"
              @click="() => deleteFile(file)"
              :title="`Delete ${file.name}`"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
            </UButton>
          </div>

          <!-- Selection Checkbox -->
          <div class="file-selection">
            <UCheckbox
              :model-value="selectedFiles.includes(file.path)"
              @update:model-value="toggleFileSelection(file)"
            />
          </div>
        </div>
      </div>

      <!-- Bulk Actions -->
      <div v-if="selectedFiles.length > 0" class="bulk-actions mt-4 mb-4">
        <div
          class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-sm"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <UIcon
                name="i-lucide-check-circle"
                class="w-5 h-5 text-blue-600"
              />
              <span class="text-sm font-medium text-blue-700">
                {{ (t as any)('settings.storage.filesSelected', selectedFiles.length, { count: selectedFiles.length }) }}
              </span>
            </div>

            <div class="flex items-center space-x-2">
              <UButton
                size="sm"
                variant="outline"
                @click="downloadSelectedFiles"
                class="hover:bg-blue-100"
              >
                <UIcon name="i-lucide-download" class="w-4 h-4 mr-2" />
                {{ t('settings.storage.downloadSelected') }}
              </UButton>

              <UButton
                v-if="canDelete"
                size="sm"
                color="error"
                variant="outline"
                @click="deleteSelectedFiles"
                class="hover:bg-red-100"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4 mr-2" />
                {{ t('settings.storage.deleteSelected') }}
              </UButton>

              <UButton
                size="sm"
                variant="ghost"
                @click="clearSelection"
                class="hover:bg-gray-100"
              >
                {{ t('settings.storage.clearSelection') }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination mt-6">
        <UPagination
          v-model="currentPage"
          :total="totalFiles"
          :per-page="perPage"
          @change="loadFiles"
        />
      </div>
    </div>

    <!-- Upload Modal -->
    <UModal
      v-model:open="showUploadModal"
      :title="t('settings.storage.uploadFiles')"
      :description="t('settings.storage.uploadFilesDescription')"
    >
      <template #body>
        <FileUpload
          :folder="folderName"
          :allowed-types="allowedTypes"
          :max-size="maxSize"
          @upload-complete="handleUploadComplete"
          @upload-error="handleUploadError"
        />
      </template>
    </UModal>

    <!-- File Preview Modal -->
    <UModal
      v-model:open="showPreviewModal"
      :ui="{ content: 'w-full lg:max-w-[1330px]' }"
      :title="previewFile?.name || t('settings.storage.filePreview')"
      :description="t('settings.storage.previewingFile', { type: previewFile?.mime_type || t('settings.storage.file') })"
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
                  @click="copyToClipboard(previewFile.id)"
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
            @click="downloadFile(previewFile!)"
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
      v-model:open="showDeleteModal"
      :title="t('settings.storage.deleteFile')"
      :description="t('settings.storage.deleteFileDescription')"
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
          <UButton color="error" :loading="deleting" @click="confirmDeleteFile">
            {{ t('settings.storage.deleteFile') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Bulk Delete Confirmation Modal -->
    <UModal
      v-model:open="showBulkDeleteModal"
      :title="t('settings.storage.deleteMultipleFiles')"
      :description="t('settings.storage.deleteMultipleFilesDescription')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            {{ t('settings.storage.deleteMultipleFilesConfirm', { count: selectedFiles.length }) }}
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
          <UButton color="error" :loading="deleting" @click="confirmBulkDelete">
            {{ t('settings.storage.deleteFiles', { count: selectedFiles.length }) }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

import { useAuthStore } from '@/stores/auth';
import FileUpload from './FileUpload.vue';
import MediaPlayer from './MediaPlayer.vue';

// Props
interface Props {
  folder: string;
  allowedTypes?: string[];
  maxSize?: string;
}

const props = withDefaults(defineProps<Props>(), {
  allowedTypes: () => [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'pdf',
    'doc',
    'docx',
    'txt',
    'md',
    'mp4',
    'webm',
    'mp3',
    'wav',
  ],
  maxSize: '100MB',
});

// Composables
const toast = useToast();
const authStore = useAuthStore();
const config = useRuntimeConfig();
const { t } = useI18n();

// State
const loading = ref(false);
const files = ref<FileInfo[]>([]);
const searchQuery = ref('');
const selectedType = ref<{ label: string; id: string }[]>([]);
const sortBy = ref<{ label: string; id: string } | undefined>(undefined);
const currentPage = ref(1);
const perPage = ref(20);
const selectedFiles = ref<string[]>([]);
const showUploadModal = ref(false);
const showPreviewModal = ref(false);
const previewFile = ref<FileInfo | null>(null);
const showDeleteModal = ref(false);
const showBulkDeleteModal = ref(false);
const deleting = ref(false);
const fileToDelete = ref<FileInfo | null>(null);

// Computed
const folderName = computed(() => props.folder);

const fileTypeOptions = computed(() => [
  { label: t('settings.storage.fileTypes.images'), id: 'image' },
  { label: t('settings.storage.fileTypes.documents'), id: 'document' },
  { label: t('settings.storage.fileTypes.videos'), id: 'video' },
  { label: t('settings.storage.fileTypes.audio'), id: 'audio' },
  { label: t('settings.storage.fileTypes.other'), id: 'other' },
]);

const sortOptions = computed(() => [
  { label: t('settings.storage.sort.nameAsc'), id: 'name' },
  { label: t('settings.storage.sort.nameDesc'), id: 'name-desc' },
  { label: t('settings.storage.sort.dateDesc'), id: 'date-desc' },
  { label: t('settings.storage.sort.dateAsc'), id: 'date-asc' },
  { label: t('settings.storage.sort.sizeDesc'), id: 'size-desc' },
  { label: t('settings.storage.sort.sizeAsc'), id: 'size-asc' },
]);

const filteredFiles = computed(() => {
  let filtered = [...files.value];

  // Apply search filter
  if (searchQuery.value) {
    filtered = filtered.filter((file) =>
      file.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
  }

  // Apply type filter
  if (selectedType.value && selectedType.value.length > 0) {
    filtered = filtered.filter((file) => {
      const mimeType = file.mime_type.toLowerCase();
      // Check if file matches ANY of the selected types
      return selectedType.value.some((selectedItem) => {
        switch (selectedItem.id) {
          case 'image':
            return mimeType.startsWith('image/');
          case 'document':
            // Handle various document types
            return (
              mimeType.includes('pdf') ||
              mimeType.includes('word') ||
              mimeType.includes('document') ||
              mimeType.includes('text/') ||
              mimeType.includes('application/rtf') ||
              mimeType.includes('application/epub') ||
              mimeType.includes('application/vnd.openxmlformats') ||
              mimeType.includes('application/msword') ||
              mimeType.includes('application/vnd.ms-word') ||
              mimeType.includes('application/vnd.ms-excel') ||
              mimeType.includes('application/vnd.ms-powerpoint')
            );
          case 'video':
            return mimeType.startsWith('video/');
          case 'audio':
            return mimeType.startsWith('audio/');
          case 'other':
            return (
              !mimeType.startsWith('image/') &&
              !mimeType.startsWith('video/') &&
              !mimeType.startsWith('audio/') &&
              !mimeType.includes('pdf') &&
              !mimeType.includes('word') &&
              !mimeType.includes('document') &&
              !mimeType.includes('text/') &&
              !mimeType.includes('application/rtf') &&
              !mimeType.includes('application/epub') &&
              !mimeType.includes('application/vnd.openxmlformats') &&
              !mimeType.includes('application/msword') &&
              !mimeType.includes('application/vnd.ms-word') &&
              !mimeType.includes('application/vnd.ms-excel') &&
              !mimeType.includes('application/vnd.ms-powerpoint')
            );
          default:
            return false;
        }
      });
    });
  }

  // Apply sorting
  if (sortBy.value && sortBy.value.id) {
    filtered.sort((a, b) => {
      // Use the selected sort option
      const primarySort = sortBy.value!.id;

      switch (primarySort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'date-desc':
          return (
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
          );
        case 'date-asc':
          return (
            new Date(a.modified).getTime() - new Date(b.modified).getTime()
          );
        case 'size-desc':
          return b.size - a.size;
        case 'size-asc':
          return a.size - b.size;
        default:
          return 0;
      }
    });
  }

  return filtered;
});

const totalFiles = computed(() => filteredFiles.value.length);
const totalPages = computed(() => Math.ceil(totalFiles.value / perPage.value));

const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * perPage.value;
  const end = start + perPage.value;
  return filteredFiles.value.slice(start, end);
});

const canUpload = computed(() => {
  return authStore.hasPermission('storage:upload');
});

const canDelete = computed(() => {
  return authStore.hasPermission('storage:delete');
});

// Types
interface FileInfo {
  id: string; // UUID from storage system
  name: string; // original_name from API
  size: number;
  mime_type: string;
  path: string; // relative_path from API
  url: string;
  created: string;
  modified: string;
}

// Methods
const loadFiles = async () => {
  loading.value = true;

  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/storage/folders/${props.folder}/files`
    )) as any;

    if (response.success) {
      // Map API response to FileInfo interface
      files.value = response.data.files.map((apiFile: any) => ({
        id: apiFile.id,
        name: apiFile.original_name,
        size: apiFile.size,
        mime_type: apiFile.mime_type,
        path: apiFile.relative_path,
        url: apiFile.url || `/api/v1/storage/files/${apiFile.id}`,
        created: apiFile.created_at,
        modified: apiFile.updated_at,
      }));
    } else {
      throw new Error(response.error?.message || 'Failed to load files');
    }
  } catch (error) {
    toast.add({
      title: t('common.error'),
      description:
        error instanceof Error ? error.message : t('settings.storage.failedToLoadFiles'),
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
};

const refreshFiles = () => {
  loadFiles();
};

const debouncedSearch = () => {
  // Reset to first page when searching
  currentPage.value = 1;
};

const selectFile = (file: FileInfo) => {
  const index = selectedFiles.value.indexOf(file.path);
  if (index > -1) {
    selectedFiles.value.splice(index, 1);
  } else {
    selectedFiles.value.push(file.path);
  }
};

const toggleFileSelection = (file: FileInfo) => {
  selectFile(file);
};

const clearSelection = () => {
  selectedFiles.value = [];
};

const openPreview = (file: FileInfo) => {
  previewFile.value = file;
  showPreviewModal.value = true;
};

const downloadFile = async (file: FileInfo) => {
  try {
    // For file downloads, we need to use fetch directly to get the blob
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(
      `${config.public.civicApiUrl}/api/v1/storage/files/${file.id}`,
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
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.add({
      title: t('settings.storage.downloadStarted'),
      description: t('settings.storage.downloadStarted'),
      color: 'primary',
    });
  } catch (error) {
    toast.add({
      title: t('settings.storage.downloadFailed'),
      description: error instanceof Error ? error.message : t('settings.storage.downloadFailed'),
      color: 'error',
    });
  }
};

const openDeleteModal = (file: FileInfo) => {
  fileToDelete.value = file;
  showDeleteModal.value = true;
};

const confirmDeleteFile = async () => {
  if (!fileToDelete.value) return;

  deleting.value = true;
  try {
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/storage/files/${fileToDelete.value.id}`,
      {
        method: 'DELETE',
      }
    )) as any;

    if (response.success) {
      toast.add({
        title: t('common.success'),
        description: t('settings.storage.fileDeletedSuccessfully'),
        color: 'primary',
      });
      await loadFiles();
      showDeleteModal.value = false;
      fileToDelete.value = null;
    } else {
      throw new Error(response.error?.message || t('settings.storage.deleteFailed'));
    }
  } catch (error) {
    toast.add({
      title: t('settings.storage.deleteFailed'),
      description: error instanceof Error ? error.message : t('settings.storage.deleteFailed'),
      color: 'error',
    });
  } finally {
    deleting.value = false;
  }
};

const deleteFile = async (file: FileInfo) => {
  openDeleteModal(file);
};

const downloadSelectedFiles = () => {
  // For multiple files, we'd need to implement a zip download or individual downloads
  toast.add({
    title: t('settings.storage.downloading'),
    description: t('settings.storage.downloadingSelectedFiles'),
    color: 'primary',
  });
  selectedFiles.value.forEach((path) => {
    const file = files.value.find((f) => f.path === path);
    if (file) {
      downloadFile(file);
    }
  });
};

const openBulkDeleteModal = () => {
  if (selectedFiles.value.length === 0) return;
  showBulkDeleteModal.value = true;
};

const confirmBulkDelete = async () => {
  deleting.value = true;
  try {
    let deletedCount = 0;

    for (const path of selectedFiles.value) {
      const file = files.value.find((f) => f.path === path);
      if (file) {
        const response = (await useNuxtApp().$civicApi(
          `/api/v1/storage/files/${file.id}`,
          {
            method: 'DELETE',
          }
        )) as any;

        if (response.success) {
          deletedCount++;
        }
      }
    }

    toast.add({
      title: t('common.success'),
      description: t('settings.storage.filesDeletedSuccessfully', { count: deletedCount }),
      color: 'primary',
    });
    clearSelection();
    showBulkDeleteModal.value = false;
    await loadFiles();
  } catch (error) {
    toast.add({
      title: t('common.error'),
      description: t('settings.storage.someFilesCouldNotBeDeleted'),
      color: 'error',
    });
  } finally {
    deleting.value = false;
  }
};

const deleteSelectedFiles = async () => {
  openBulkDeleteModal();
};

const handleUploadComplete = (uploadedFiles: any[]) => {
  toast.add({
    title: t('settings.storage.uploadComplete'),
    description: t('settings.storage.filesUploadedSuccessfully', { count: uploadedFiles.length }),
    color: 'primary',
  });
  showUploadModal.value = false;
  loadFiles();
};

const handleUploadError = (error: string) => {
  toast.add({
    title: t('settings.storage.uploadError'),
    description: error,
    color: 'error',
  });
};

const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return 'i-lucide-image';
  if (mimeType.startsWith('video/')) return 'i-lucide-video';
  if (mimeType.startsWith('audio/')) return 'i-lucide-music';
  if (mimeType.includes('pdf')) return 'i-lucide-file-text';
  if (mimeType.includes('word') || mimeType.includes('document'))
    return 'i-lucide-file-text';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
    return 'i-lucide-file-spreadsheet';
  return 'i-lucide-file';
};

const getFileIconColor = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return 'text-blue-500';
  if (mimeType.startsWith('video/')) return 'text-purple-500';
  if (mimeType.startsWith('audio/')) return 'text-green-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('word') || mimeType.includes('document'))
    return 'text-blue-600';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
    return 'text-green-600';
  return 'text-gray-500';
};

const canPreview = (file: FileInfo): boolean => {
  const mimeType = file.mime_type.toLowerCase();
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType.includes('pdf')
  );
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString();
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({
      title: t('common.copied'),
      description: t('settings.storage.uuidCopiedToClipboard'),
      color: 'primary',
    });
  } catch (error) {
    toast.add({
      title: t('settings.storage.copyFailed'),
      description: t('settings.storage.failedToCopyUuid'),
      color: 'error',
    });
  }
};

const getAuthToken = (): string => {
  return authStore.token || '';
};

// Expose methods to parent
defineExpose({
  refreshFiles,
  loadFiles,
});

// Lifecycle
onMounted(() => {
  loadFiles();
});

// Watchers
watch(
  () => props.folder,
  () => {
    currentPage.value = 1;
    selectedFiles.value = [];
    loadFiles();
  }
);
</script>

<style scoped>
/* File Browser Layout */
.file-browser {
  width: 100%;
}

/* Filters Section */
.filters {
  background-color: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  padding: 1.5rem;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  margin-bottom: 1.5rem;
}

/* File Content Area */
.file-content {
  background-color: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem 0;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 4rem 1.5rem;
}

/* File Grid */
.file-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
}

@media (min-width: 640px) {
  .file-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .file-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .file-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* File Item */
.file-item {
  position: relative;
  background-color: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-item:hover {
  border-color: #d1d5db;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transform: scale(1.05);
}

.file-item.selected {
  border-color: #3b82f6;
  background-color: #eff6ff;
  box-shadow: 0 0 0 2px #dbeafe;
}

/* File Main Content */
.file-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.file-main > * + * {
  margin-top: 0.75rem;
}

/* File Icon */
.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 0.5rem;
  background-color: #f3f4f6;
}

/* File Info */
.file-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  width: 100%;
}

.file-info > * + * {
  margin-top: 0.25rem;
}

.file-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.file-size {
  font-size: 0.75rem;
  color: #6b7280;
}

.file-date {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* File Actions */
.file-actions {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.file-actions > * + * {
  margin-left: 0.25rem;
}

.file-item:hover .file-actions {
  opacity: 1;
}

/* File Selection */
.file-selection {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
}

/* Bulk Actions */
.bulk-actions {
  margin: 0 1.5rem 1.5rem 1.5rem;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

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

/* Responsive Design */
@media (max-width: 640px) {
  .file-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 1rem;
  }

  .file-item {
    padding: 0.75rem;
  }

  .file-icon {
    width: 3rem;
    height: 3rem;
  }

  .filters {
    padding: 1rem;
  }
}

@media (max-width: 768px) {
  .filters .grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.75rem;
  }
}
</style>
