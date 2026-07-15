<template>
  <div class="file-browser">
    <!-- Search and Filters -->
    <FileBrowserToolbar
      v-model:search-query="searchQuery"
      v-model:selected-type="selectedType"
      v-model:sort-by="sortBy"
      :file-type-options="fileTypeOptions"
      :sort-options="sortOptions"
      @search-input="debouncedSearch"
    />

    <!-- File List / Grid / Bulk Actions / Pagination -->
    <FileBrowserList
      v-model:current-page="currentPage"
      :loading="loading"
      :filtered-files="filteredFiles"
      :paginated-files="paginatedFiles"
      :selected-files="selectedFiles"
      :search-query="searchQuery"
      :can-upload="canUpload"
      :can-delete="canDelete"
      :total-files="totalFiles"
      :total-pages="totalPages"
      :per-page="perPage"
      :get-file-icon="getFileIcon"
      :get-file-icon-color="getFileIconColor"
      :format-file-size="formatFileSize"
      :format-date="formatDate"
      :can-preview="canPreview"
      @open-upload="showUploadModal = true"
      @select-file="selectFile"
      @open-preview="openPreview"
      @download-file="downloadFile"
      @delete-file="deleteFile"
      @toggle-selection="toggleFileSelection"
      @download-selected="downloadSelectedFiles"
      @delete-selected="deleteSelectedFiles"
      @clear-selection="clearSelection"
      @page-change="loadFiles"
    />

    <!-- Modals (Upload / Preview / Delete / Bulk Delete) -->
    <FileBrowserModals
      v-model:show-upload-modal="showUploadModal"
      v-model:show-preview-modal="showPreviewModal"
      v-model:show-delete-modal="showDeleteModal"
      v-model:show-bulk-delete-modal="showBulkDeleteModal"
      :preview-file="previewFile"
      :file-to-delete="fileToDelete"
      :deleting="deleting"
      :selected-files-count="selectedFiles.length"
      :folder-name="folderName"
      :allowed-types="allowedTypes"
      :max-size="maxSize"
      :format-file-size="formatFileSize"
      :format-date="formatDate"
      @upload-complete="handleUploadComplete"
      @upload-error="handleUploadError"
      @copy-clipboard="copyToClipboard"
      @download-file="downloadFile"
      @confirm-delete="confirmDeleteFile"
      @confirm-bulk-delete="confirmBulkDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

import FileBrowserToolbar from './file-browser/FileBrowserToolbar.vue';
import FileBrowserList from './file-browser/FileBrowserList.vue';
import FileBrowserModals from './file-browser/FileBrowserModals.vue';
import { useAuthStore } from '@/stores/auth';
import { useFileBrowser, type FileInfo } from '~/composables/useFileBrowser';

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
const authStore = useAuthStore();
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

// Action handlers + formatters (extracted to composable in Phase 2d for ui-008)
const {
  loadFiles,
  refreshFiles,
  debouncedSearch,
  selectFile,
  toggleFileSelection,
  clearSelection,
  openPreview,
  downloadFile,
  confirmDeleteFile,
  deleteFile,
  downloadSelectedFiles,
  confirmBulkDelete,
  deleteSelectedFiles,
  handleUploadComplete,
  handleUploadError,
  getFileIcon,
  getFileIconColor,
  canPreview,
  formatFileSize,
  formatDate,
  copyToClipboard,
} = useFileBrowser({
  props,
  loading,
  files,
  selectedFiles,
  previewFile,
  fileToDelete,
  showUploadModal,
  showPreviewModal,
  showDeleteModal,
  showBulkDeleteModal,
  deleting,
  currentPage,
});

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
</style>
