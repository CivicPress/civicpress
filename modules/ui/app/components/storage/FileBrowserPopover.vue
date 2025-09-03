<template>
  <div class="file-browser-popover w-96 max-h-96 overflow-hidden flex flex-col">
    <!-- Header with Folder Selection -->
    <div class="border-b p-4 flex-shrink-0">
      <div class="space-y-3">
        <h3 class="font-medium text-gray-900 dark:text-white">Select Files</h3>

        <!-- Folder Selection -->
        <USelectMenu
          v-model="selectedFolder"
          :items="folderOptions"
          placeholder="Select folder"
          icon="i-lucide-folder"
          @change="loadFiles"
          class="w-full"
        />
      </div>
    </div>

    <!-- File List -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading State -->
      <div v-if="loading" class="p-6 text-center">
        <UIcon
          name="i-lucide-loader-2"
          class="w-6 h-6 animate-spin mx-auto mb-2"
        />
        <p class="text-sm text-gray-500">Loading files...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="files.length === 0" class="p-6 text-center">
        <UIcon
          name="i-lucide-folder-open"
          class="w-8 h-8 text-gray-400 mx-auto mb-2"
        />
        <p class="text-sm text-gray-500">No files in this folder</p>
      </div>

      <!-- File List -->
      <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
        <div
          v-for="file in files"
          :key="file.id"
          class="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center space-x-3"
          :class="{
            'bg-blue-50 dark:bg-blue-900/20': selectedFiles.includes(file.id),
          }"
          @click="toggleFileSelection(file)"
        >
          <!-- File Icon -->
          <div class="flex-shrink-0">
            <UIcon
              :name="getFileIcon(file.mime_type)"
              class="w-5 h-5"
              :class="getFileIconColor(file.mime_type)"
            />
          </div>

          <!-- File Info -->
          <div class="flex-1 min-w-0">
            <p
              class="text-sm font-medium text-gray-900 dark:text-white truncate"
            >
              {{ file.original_name }}
            </p>
            <p class="text-xs text-gray-500 truncate">
              {{ formatFileSize(file.size) }} •
              {{ formatDate(file.created_at) }}
            </p>
          </div>

          <!-- Selection Indicator -->
          <div class="flex-shrink-0">
            <UIcon
              v-if="selectedFiles.includes(file.id)"
              name="i-lucide-check-circle"
              class="w-4 h-4 text-blue-600"
            />
            <UIcon
              v-else
              name="i-lucide-circle"
              class="w-4 h-4 text-gray-300"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Footer with Actions -->
    <div class="border-t p-4 flex-shrink-0">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-500">
          {{ selectedFiles.length }} file{{
            selectedFiles.length !== 1 ? 's' : ''
          }}
          selected
        </p>
        <div class="flex space-x-2">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            @click="$emit('cancel')"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            size="sm"
            :disabled="selectedFiles.length === 0"
            @click="confirmSelection"
          >
            Add Files
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface FileInfo {
  id: string;
  original_name: string;
  relative_path: string;
  size: number;
  mime_type: string;
  created_at: string;
}

interface Props {
  folder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  folder: 'public',
});

const emit = defineEmits<{
  'files-selected': [files: FileInfo[]];
  cancel: [];
}>();

// State
const loading = ref(false);
const files = ref<FileInfo[]>([]);
const selectedFiles = ref<string[]>([]);
const selectedFolder = ref<any>(null);

// Folder options
const folderOptions = [
  { label: 'Public', value: 'public', icon: 'i-lucide-globe' },
  { label: 'Sessions', value: 'sessions', icon: 'i-lucide-calendar' },
  { label: 'Permits', value: 'permits', icon: 'i-lucide-file-text' },
  { label: 'Private', value: 'private', icon: 'i-lucide-lock' },
];

// Initialize with default folder
onMounted(() => {
  selectedFolder.value =
    folderOptions.find((f) => f.value === props.folder) || folderOptions[0];
  loadFiles();
});

// Load files from API
const loadFiles = async () => {
  if (!selectedFolder.value) return;

  loading.value = true;
  try {
    const response = await useNuxtApp().$civicApi(
      `/api/v1/storage/folders/${selectedFolder.value.value}/files`
    );

    if (response.success) {
      files.value = response.data.files || [];
    } else {
      console.error('Failed to load files:', response.error);
      files.value = [];
    }
  } catch (error) {
    console.error('Error loading files:', error);
    files.value = [];
  } finally {
    loading.value = false;
  }
};

// Toggle file selection
const toggleFileSelection = (file: FileInfo) => {
  const index = selectedFiles.value.indexOf(file.id);
  if (index > -1) {
    selectedFiles.value.splice(index, 1);
  } else {
    selectedFiles.value.push(file.id);
  }
};

// Confirm selection and emit selected files
const confirmSelection = () => {
  const selected = files.value.filter((file) =>
    selectedFiles.value.includes(file.id)
  );
  emit('files-selected', selected);
};

// Utility functions
const getFileIcon = (mimeType: string): string => {
  if (!mimeType) return 'i-lucide-file';

  if (mimeType.startsWith('image/')) return 'i-lucide-image';
  if (mimeType.startsWith('video/')) return 'i-lucide-video';
  if (mimeType.startsWith('audio/')) return 'i-lucide-audio-lines';
  if (mimeType.includes('pdf')) return 'i-lucide-file-text';
  if (mimeType.includes('word') || mimeType.includes('document'))
    return 'i-lucide-file-text';
  if (mimeType.includes('sheet') || mimeType.includes('csv'))
    return 'i-lucide-table';
  if (mimeType.includes('presentation')) return 'i-lucide-presentation';
  if (mimeType.includes('zip') || mimeType.includes('archive'))
    return 'i-lucide-archive';
  if (mimeType.includes('json') || mimeType.includes('geojson'))
    return 'i-lucide-map';

  return 'i-lucide-file';
};

const getFileIconColor = (mimeType: string): string => {
  if (!mimeType) return 'text-gray-400';

  if (mimeType.startsWith('image/')) return 'text-green-500';
  if (mimeType.startsWith('video/')) return 'text-red-500';
  if (mimeType.startsWith('audio/')) return 'text-purple-500';
  if (mimeType.includes('pdf')) return 'text-red-600';
  if (mimeType.includes('word') || mimeType.includes('document'))
    return 'text-blue-600';
  if (mimeType.includes('sheet') || mimeType.includes('csv'))
    return 'text-green-600';
  if (mimeType.includes('presentation')) return 'text-orange-500';
  if (mimeType.includes('zip') || mimeType.includes('archive'))
    return 'text-yellow-600';
  if (mimeType.includes('json') || mimeType.includes('geojson'))
    return 'text-indigo-500';

  return 'text-gray-400';
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString();
};
</script>
