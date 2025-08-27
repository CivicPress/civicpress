<template>
  <div class="storage-page">
    <div class="container mx-auto px-4 py-8">
      <!-- Page Header -->
      <div class="page-header mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">File Storage</h1>
        <p class="text-gray-600">
          Manage and organize your files across different storage folders
        </p>
      </div>

      <!-- Storage Overview -->
      <div class="storage-overview mb-8">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div
            v-for="folder in storageFolders"
            :key="folder.name"
            class="storage-folder-card"
            :class="{ 'cursor-pointer': folder.enabled }"
            @click="folder.enabled ? selectFolder(folder.name) : null"
          >
            <div class="folder-icon mb-3">
              <UIcon
                :name="getFolderIcon(folder.name)"
                class="w-12 h-12"
                :class="getFolderIconColor(folder.name)"
              />
            </div>

            <h3 class="text-lg font-semibold text-gray-900 mb-1">
              {{ folder.label }}
            </h3>

            <p class="text-sm text-gray-600 mb-3">
              {{ folder.description }}
            </p>

            <div class="folder-stats text-xs text-gray-500">
              <div class="flex justify-between">
                <span>Files:</span>
                <span>{{ folder.fileCount || 0 }}</span>
              </div>
              <div class="flex justify-between">
                <span>Size:</span>
                <span>{{ folder.totalSize || '0 B' }}</span>
              </div>
            </div>

            <UButton
              v-if="folder.enabled"
              size="sm"
              variant="outline"
              class="mt-3 w-full"
            >
              Browse Files
            </UButton>

            <UButton
              v-else
              size="sm"
              variant="ghost"
              disabled
              class="mt-3 w-full"
            >
              Coming Soon
            </UButton>
          </div>
        </div>
      </div>

      <!-- Selected Folder Browser -->
      <div v-if="selectedFolder" class="folder-browser">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-2xl font-semibold text-gray-900">
              {{ getFolderLabel(selectedFolder) }}
            </h2>
            <p class="text-gray-600">
              {{ getFolderDescription(selectedFolder) }}
            </p>
          </div>

          <UButton variant="ghost" @click="selectedFolder = null">
            <UIcon name="i-lucide-arrow-left" class="w-4 h-4 mr-2" />
            Back to Overview
          </UButton>
        </div>

        <FileBrowser
          :folder="selectedFolder"
          :allowed-types="getFolderAllowedTypes(selectedFolder)"
          :max-size="getFolderMaxSize(selectedFolder)"
        />
      </div>

      <!-- Quick Upload Section -->
      <div v-if="!selectedFolder" class="quick-upload mt-8">
        <div class="bg-white border border-gray-200 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Upload</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 class="font-medium text-gray-700 mb-2">Public Files</h4>
              <p class="text-sm text-gray-600 mb-3">
                Upload files that will be accessible to everyone
              </p>
              <FileUpload
                folder="public"
                :allowed-types="[
                  'jpg',
                  'jpeg',
                  'png',
                  'gif',
                  'pdf',
                  'txt',
                  'md',
                ]"
                max-size="10MB"
                @upload-complete="handleUploadComplete"
                @upload-error="handleUploadError"
              />
            </div>

            <div>
              <h4 class="font-medium text-gray-700 mb-2">Session Materials</h4>
              <p class="text-sm text-gray-600 mb-3">
                Upload meeting recordings and session documents
              </p>
              <FileUpload
                folder="sessions"
                :allowed-types="['mp4', 'webm', 'mp3', 'wav', 'pdf', 'md']"
                max-size="100MB"
                @upload-complete="handleUploadComplete"
                @upload-error="handleUploadError"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Storage Statistics -->
      <div v-if="!selectedFolder" class="storage-stats mt-8">
        <div class="bg-white border border-gray-200 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">
            Storage Overview
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="stat-card">
              <div class="stat-icon mb-2">
                <UIcon
                  name="i-lucide-hard-drive"
                  class="w-8 h-8 text-blue-500"
                />
              </div>
              <div class="stat-value text-2xl font-bold text-gray-900">
                {{ totalFiles }}
              </div>
              <div class="stat-label text-sm text-gray-600">Total Files</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon mb-2">
                <UIcon
                  name="i-lucide-database"
                  class="w-8 h-8 text-green-500"
                />
              </div>
              <div class="stat-value text-2xl font-bold text-gray-900">
                {{ totalSize }}
              </div>
              <div class="stat-label text-sm text-gray-600">Total Size</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon mb-2">
                <UIcon name="i-lucide-folder" class="w-8 h-8 text-purple-500" />
              </div>
              <div class="stat-value text-2xl font-bold text-gray-900">
                {{ activeFolders }}
              </div>
              <div class="stat-label text-sm text-gray-600">Active Folders</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { FileBrowser, FileUpload } from '@/components/storage';

// Composables
const toast = useToast();
const authStore = useAuthStore();

// State
const selectedFolder = ref<string | null>(null);
const storageStats = ref({
  totalFiles: 0,
  totalSize: '0 B',
  folderStats: {} as Record<string, { fileCount: number; totalSize: string }>,
});

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
    public: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'md'],
    sessions: ['mp4', 'webm', 'mp3', 'wav', 'pdf', 'md'],
    permits: ['pdf', 'jpg', 'jpeg', 'png'],
    private: ['pdf', 'doc', 'docx', 'xls', 'xlsx'],
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
  const colorMap: Record<string, string> = {
    public: 'text-blue-500',
    sessions: 'text-purple-500',
    permits: 'text-green-500',
    private: 'text-red-500',
  };
  return colorMap[folderName] || 'text-gray-500';
};

const loadStorageStats = async () => {
  try {
    // Load stats for each folder
    for (const folder of storageFolders.value) {
      if (folder.enabled) {
        const response = await fetch(`/api/v1/storage/files/${folder.name}`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const files = result.data.files;
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
    }

    // Calculate totals
    storageStats.value.totalFiles = Object.values(
      storageStats.value.folderStats
    ).reduce((sum, stats) => sum + stats.fileCount, 0);

    const totalSizeBytes = Object.values(storageStats.value.folderStats).reduce(
      (sum, stats) => sum + parseFileSize(stats.totalSize),
      0
    );

    storageStats.value.totalSize = formatFileSize(totalSizeBytes);
  } catch (error) {
    console.error('Failed to load storage stats:', error);
  }
};

const handleUploadComplete = (files: any[]) => {
  toast.success(`${files.length} files uploaded successfully`);
  // Refresh stats after upload
  loadStorageStats();
};

const handleUploadError = (error: string) => {
  toast.error(error);
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
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * (units[unit] || 1);
};

const getAuthToken = (): string => {
  // In a real implementation, get this from your auth store
  return localStorage.getItem('auth_token') || '';
};

// Lifecycle
onMounted(() => {
  loadStorageStats();
});
</script>

<style scoped>
.storage-page {
  @apply min-h-screen bg-gray-50;
}

.page-header {
  @apply text-center;
}

.storage-overview {
  @apply w-full;
}

.storage-folder-card {
  @apply bg-white border border-gray-200 rounded-lg p-6 text-center hover:border-gray-300 hover:shadow-sm transition-all duration-200;
}

.storage-folder-card:hover {
  @apply transform scale-105;
}

.folder-icon {
  @apply flex justify-center;
}

.folder-stats {
  @apply space-y-1;
}

.folder-browser {
  @apply w-full;
}

.quick-upload {
  @apply w-full;
}

.storage-stats {
  @apply w-full;
}

.stat-card {
  @apply text-center;
}

.stat-icon {
  @apply flex justify-center;
}

.stat-value {
  @apply text-gray-900;
}

.stat-label {
  @apply text-gray-600;
}

/* Responsive design */
@media (max-width: 768px) {
  .storage-overview .grid {
    @apply grid-cols-1;
  }

  .quick-upload .grid {
    @apply grid-cols-1;
  }

  .storage-stats .grid {
    @apply grid-cols-1;
  }
}
</style>
