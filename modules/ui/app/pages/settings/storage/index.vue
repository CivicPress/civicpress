<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-lg font-semibold">File Storage</h1>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Page Header -->
        <div class="page-header">
          <p class="text-gray-600">
            Manage and organize your files across different storage folders
          </p>
        </div>

        <!-- Storage Overview + Stats (top band) -->
        <div v-if="!selectedFolder" class="mb-8 grid gap-6 lg:grid-cols-5">
          <!-- Folder cards -->
          <div class="lg:col-span-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
              <UCard v-for="folder in storageFolders" :key="folder.name" :class="{ 'cursor-pointer': folder.enabled }"
                class="text-center" @click="folder.enabled ? selectFolder(folder.name) : null">
                <div class="mb-3 flex justify-center">
                  <UIcon :name="getFolderIcon(folder.name)" class="w-10 h-10"
                    :class="getFolderIconColor(folder.name)" />
                </div>

                <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {{ folder.label }}
                </h3>

                <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {{ folder.description }}
                </p>

                <div class="text-xs text-gray-500 dark:text-gray-500 space-y-1 mb-3">
                  <div class="flex justify-between">
                    <span>Files</span>
                    <span>{{ folder.fileCount || 0 }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Size</span>
                    <span>{{ folder.totalSize || '0 B' }}</span>
                  </div>
                </div>

                <UButton v-if="folder.enabled" size="sm" variant="outline" class="w-full">
                  Browse files
                </UButton>
                <UButton v-else size="sm" variant="ghost" disabled class="w-full">
                  Coming soon
                </UButton>
              </UCard>
            </div>
          </div>

          <!-- Storage overview card -->
          <UCard class="lg:col-span-1 h-full">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Storage overview
            </h3>

            <div class="space-y-4 text-sm">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-hard-drive" class="w-4 h-4 text-blue-500" />
                  <span>Total files</span>
                </div>
                <span class="font-medium text-gray-900 dark:text-gray-100">
                  {{ totalFiles }}
                </span>
              </div>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-database" class="w-4 h-4 text-blue-500" />
                  <span>Total size</span>
                </div>
                <span class="font-medium text-gray-900 dark:text-gray-100">
                  {{ totalSize }}
                </span>
              </div>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-folder" class="w-4 h-4 text-blue-500" />
                  <span>Active folders</span>
                </div>
                <span class="font-medium text-gray-900 dark:text-gray-100">
                  {{ activeFolders }}
                </span>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Quick Upload Section -->
        <div v-if="!selectedFolder" class="quick-upload mt-8">
          <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">
              Quick Upload
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 class="font-medium text-gray-700 mb-2">Public Files</h4>
                <p class="text-sm text-gray-600 mb-3">
                  Upload files that will be accessible to everyone
                </p>
                <FileUpload folder="public" :allowed-types="[
                    'jpg',
                    'jpeg',
                    'png',
                    'gif',
                    'pdf',
                    'txt',
                    'md',
                    'doc',
                    'docx',
                    'rtf',
                    'epub',
                    'xls',
                    'xlsx',
                    'ppt',
                    'pptx',
                  ]" max-size="10MB" @upload-complete="handleUploadComplete" @upload-error="handleUploadError" />
              </div>

              <div>
                <h4 class="font-medium text-gray-700 mb-2">
                  Session Materials
                </h4>
                <p class="text-sm text-gray-600 mb-3">
                  Upload meeting recordings and session documents
                </p>
                <FileUpload folder="sessions" :allowed-types="['mp4', 'webm', 'mp3', 'wav', 'pdf', 'md']"
                  max-size="100MB" @upload-complete="handleUploadComplete" @upload-error="handleUploadError" />
              </div>
            </div>
          </div>
        </div>

        <!-- Selected Folder Browser -->
        <div v-if="selectedFolder" class="mt-8">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {{ getFolderLabel(selectedFolder) }}
              </h2>
              <p class="text-gray-600 dark:text-gray-400">
                {{ getFolderDescription(selectedFolder) }}
              </p>
            </div>

            <div class="flex items-center space-x-3">
              <UButton variant="ghost" @click="selectedFolder = null">
                <UIcon name="i-lucide-arrow-left" class="w-4 h-4 mr-2" />
                Back to Overview
              </UButton>

              <UButton
                @click="refreshFolderFiles"
                :loading="refreshing"
                variant="outline"
                size="sm"
              >
                <UIcon name="i-lucide-refresh-cw" class="w-4 h-4 mr-2" />
                Refresh
              </UButton>

              <UButton
                v-if="canUpload"
                @click="showUploadModal = true"
                color="primary"
                size="sm"
              >
                <UIcon name="i-lucide-upload" class="w-4 h-4 mr-2" />
                Upload Files
              </UButton>
            </div>
          </div>

          <FileBrowser
            ref="fileBrowserRef"
            :folder="selectedFolder"
            :allowed-types="getFolderAllowedTypes(selectedFolder)"
            :max-size="getFolderMaxSize(selectedFolder)"
          />
        </div>

      </div>

      <!-- Upload Modal -->
      <UModal v-model:open="showUploadModal" title="Upload Files" description="Upload files to this storage folder">
        <template #body>
          <FileUpload :folder="selectedFolder || 'public'" :allowed-types="
              selectedFolder
                ? getFolderAllowedTypes(selectedFolder)
                : ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'md']
            " :max-size="
              selectedFolder ? getFolderMaxSize(selectedFolder) : '10MB'
            " @upload-complete="handleUploadComplete" @upload-error="handleUploadError" />
        </template>
      </UModal>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SystemFooter from '~/components/SystemFooter.vue';
import { useAuthStore } from '@/stores/auth';
import FileBrowser from '~/components/storage/FileBrowser.vue';
import FileUpload from '~/components/storage/FileUpload.vue';

// Composables
const toast = useToast();
const authStore = useAuthStore();

// State
const selectedFolder = ref<string | null>(null);
const fileBrowserRef = ref<InstanceType<typeof FileBrowser> | null>(null);
const storageStats = ref({
  totalFiles: 0,
  totalSize: '0 B',
  folderStats: {} as Record<string, { fileCount: number; totalSize: string }>,
});
const refreshing = ref(false);
const showUploadModal = ref(false);

// Computed
const storageFolders = computed(() => [
  {
    name: 'public',
    label: 'Public Files',
    description: 'Files accessible to everyone',
    icon: 'i-lucide-globe',
    enabled: true,
    fileCount: storageStats.value.folderStats.public?.fileCount || 0,
    totalSize: storageStats.value.folderStats.public?.totalSize || '0 B',
  },
  {
    name: 'sessions',
    label: 'Session Materials',
    description: 'Meeting recordings and documents',
    icon: 'i-lucide-video',
    enabled: true,
    fileCount: storageStats.value.folderStats.sessions?.fileCount || 0,
    totalSize: storageStats.value.folderStats.sessions?.totalSize || '0 B',
  },
  {
    name: 'permits',
    label: 'Permit Documents',
    description: 'Application materials and permits',
    icon: 'i-lucide-file-text',
    enabled: true,
    fileCount: storageStats.value.folderStats.permits?.fileCount || 0,
    totalSize: storageStats.value.folderStats.permits?.totalSize || '0 B',
  },
  {
    name: 'private',
    label: 'Private Files',
    description: 'Restricted access documents',
    icon: 'i-lucide-lock',
    enabled: authStore.hasPermission('storage:admin'),
    fileCount: storageStats.value.folderStats.private?.fileCount || 0,
    totalSize: storageStats.value.folderStats.private?.totalSize || '0 B',
  },
]);

const totalFiles = computed(() => storageStats.value.totalFiles);
const totalSize = computed(() => storageStats.value.totalSize);
const activeFolders = computed(
  () => storageFolders.value.filter((f) => f.enabled).length
);

const breadcrumbItems = [
  { label: 'Home', to: '/' },
  { label: 'Settings', to: '/settings' },
  { label: 'File Storage', to: '/settings/storage' },
];

// Methods
const selectFolder = (folderName: string) => {
  selectedFolder.value = folderName;
};

const getFolderLabel = (folderName: string): string => {
  const folder = storageFolders.value.find((f) => f.name === folderName);
  return folder?.label || folderName;
};

const getFolderDescription = (folderName: string): string => {
  const folder = storageFolders.value.find((f) => f.name === folderName);
  return folder?.description || '';
};

const getFolderAllowedTypes = (folderName: string): string[] => {
  const typeMap: Record<string, string[]> = {
    public: [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'pdf',
      'txt',
      'md',
      'doc',
      'docx',
      'rtf',
      'epub',
    ],
    sessions: [
      'mp4',
      'webm',
      'mp3',
      'wav',
      'pdf',
      'md',
      'doc',
      'docx',
      'ppt',
      'pptx',
    ],
    permits: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'],
    private: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'],
  };
  return typeMap[folderName] || [];
};

const getFolderMaxSize = (folderName: string): string => {
  const sizeMap: Record<string, string> = {
    public: '10MB',
    sessions: '100MB',
    permits: '5MB',
    private: '25MB',
  };
  return sizeMap[folderName] || '10MB';
};

const getFolderIcon = (folderName: string): string => {
  const iconMap: Record<string, string> = {
    public: 'i-lucide-globe',
    sessions: 'i-lucide-video',
    permits: 'i-lucide-file-text',
    private: 'i-lucide-lock',
  };
  return iconMap[folderName] || 'i-lucide-folder';
};

const getFolderIconColor = (folderName: string): string => {
  return 'text-blue-500';
};

const canUpload = computed(() => {
  return authStore.hasPermission('storage:upload');
});

const refreshFolderFiles = async () => {
  if (!selectedFolder.value) return;

  refreshing.value = true;
  try {
    // Refresh the FileBrowser component's file list
    if (
      fileBrowserRef.value &&
      typeof fileBrowserRef.value.refreshFiles === 'function'
    ) {
      await fileBrowserRef.value.refreshFiles();
    }

    // Also refresh storage stats
    await loadStorageStats();

    toast.add({
      title: 'Success',
      description: 'Storage information refreshed',
      color: 'primary',
    });
  } catch (error) {
    toast.add({
      title: 'Error',
      description: 'Failed to refresh storage information',
      color: 'error',
    });
  } finally {
    refreshing.value = false;
  }
};

const handleUploadComplete = (uploadedFiles: any[]) => {
  toast.add({
    title: 'Upload Complete',
    description: `${uploadedFiles.length} files uploaded successfully`,
    color: 'primary',
  });
  showUploadModal.value = false;
  // Refresh storage stats to show updated file counts
  loadStorageStats();
};

const handleUploadError = (error: string) => {
  toast.add({
    title: 'Upload Failed',
    description: error,
    color: 'error',
  });
};

const loadStorageStats = async () => {
  try {
    // Load stats for each folder
    for (const folder of storageFolders.value) {
      if (folder.enabled) {
        const response = (await useNuxtApp().$civicApi(
          `/api/v1/storage/folders/${folder.name}/files`
        )) as any;

        if (response.success) {
          const files = response.data.files;
          const totalSize = files.reduce(
            (sum: number, file: any) => sum + file.size,
            0
          );

          storageStats.value.folderStats[folder.name] = {
            fileCount: files.length,
            totalSize: formatFileSize(totalSize),
          };
        }
      }
    }

    // Calculate totals
    storageStats.value.totalFiles = Object.values(
      storageStats.value.folderStats
    ).reduce((sum, stats) => sum + stats.fileCount, 0);

    const totalSizeBytes = Object.values(storageStats.value.folderStats).reduce(
      (sum, stats) => sum + parseFileSize(stats.totalSize || '0 B'),
      0
    );

    storageStats.value.totalSize = formatFileSize(totalSizeBytes);
  } catch (error) {
    console.error('Failed to load storage stats:', error);
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const parseFileSize = (sizeStr: string): number => {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match || !match[1] || !match[2]) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * (units[unit] || 1);
};

// Lifecycle
onMounted(() => {
  loadStorageStats();
});
</script>

<style scoped>
.page-header {
  /* @apply text-center; */
}


</style>
