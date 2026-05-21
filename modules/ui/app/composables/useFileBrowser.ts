import type { Ref } from 'vue';
import { extractErrorMessage, type ApiResponse } from '~/utils/api-response';

/**
 * File metadata as displayed by the FileBrowser component family. Mirrors the
 * inline interface in the original FileBrowser.vue prior to Phase 2d
 * decomposition (ui-008).
 */
export interface FileInfo {
  id: string; // UUID from storage system
  name: string; // original_name from API
  size: number;
  mime_type: string;
  path: string; // relative_path from API
  url: string;
  created: string;
  modified: string;
}

interface FileBrowserProps {
  folder: string;
  allowedTypes?: string[];
  maxSize?: string;
}

export interface UseFileBrowserDeps {
  props: FileBrowserProps;
  // State refs owned by the SFC.
  loading: Ref<boolean>;
  files: Ref<FileInfo[]>;
  selectedFiles: Ref<string[]>;
  previewFile: Ref<FileInfo | null>;
  fileToDelete: Ref<FileInfo | null>;
  showUploadModal: Ref<boolean>;
  showPreviewModal: Ref<boolean>;
  showDeleteModal: Ref<boolean>;
  showBulkDeleteModal: Ref<boolean>;
  deleting: Ref<boolean>;
  currentPage: Ref<number>;
}

/**
 * Bundles FileBrowser action handlers (loadFiles, downloadFile, delete /
 * bulk delete, preview, upload result handlers) and pure formatting / icon
 * helpers. Extracted from FileBrowser.vue in Phase 2d (ui-008 decomposition).
 * Behaviour is preserved byte-for-byte; closures over component-local state
 * are replaced with `deps.*` references.
 */
export function useFileBrowser(deps: UseFileBrowserDeps) {
  const {
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
  } = deps;

  const toast = useToast();
  const authStore = useAuthStore();
  const { t } = useI18n();

  // Methods
  const loadFiles = async () => {
    loading.value = true;

    try {
      const response = (await useNuxtApp().$civicApi(
        `/api/v1/storage/folders/${props.folder}/files`
      )) as ApiResponse;

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
        throw new Error(extractErrorMessage(response) || 'Failed to load files');
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
      )) as ApiResponse;

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
        throw new Error(extractErrorMessage(response) || t('settings.storage.deleteFailed'));
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
          )) as ApiResponse;

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

  return {
    loadFiles,
    refreshFiles,
    debouncedSearch,
    selectFile,
    toggleFileSelection,
    clearSelection,
    openPreview,
    downloadFile,
    openDeleteModal,
    confirmDeleteFile,
    deleteFile,
    downloadSelectedFiles,
    openBulkDeleteModal,
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
    getAuthToken,
  };
}
