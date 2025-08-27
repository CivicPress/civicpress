<template>
  <div class="file-upload">
    <!-- Drag & Drop Zone -->
    <div
      class="upload-zone"
      :class="{ 'drag-over': isDragOver, uploading: isUploading }"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @click="triggerFileInput"
    >
      <div class="upload-content">
        <UIcon
          :name="isUploading ? 'i-lucide-loader-2' : 'i-lucide-upload'"
          class="w-12 h-12 text-gray-400 animate-spin"
          :class="{ 'animate-spin': isUploading }"
        />
        <p class="text-lg font-medium">
          {{
            isUploading ? 'Uploading...' : 'Drop files here or click to browse'
          }}
        </p>
        <p class="text-sm text-gray-500">
          Supports: {{ allowedTypes.join(', ') }} • Max: {{ maxSize }}
        </p>
        <input
          ref="fileInput"
          type="file"
          :accept="acceptedTypes"
          @change="handleFileSelect"
          class="hidden"
          multiple
        />
      </div>
    </div>

    <!-- Upload Progress -->
    <div v-if="uploads.length > 0" class="upload-progress mt-4">
      <h4 class="text-sm font-medium text-gray-700 mb-3">
        Upload Progress ({{ completedCount }}/{{ uploads.length }})
      </h4>

      <div class="space-y-3">
        <div
          v-for="upload in uploads"
          :key="upload.id"
          class="upload-item bg-white border border-gray-200 rounded-lg p-3"
        >
          <div class="flex items-center space-x-3">
            <UIcon
              :name="getFileIcon(upload.file.type)"
              class="w-5 h-5 text-gray-500 flex-shrink-0"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">
                {{ upload.file.name }}
              </p>
              <p class="text-xs text-gray-500">
                {{ formatFileSize(upload.file.size) }}
              </p>
            </div>
            <div class="flex items-center space-x-2">
              <span
                class="text-sm font-medium"
                :class="
                  upload.status === 'error' ? 'text-red-600' : 'text-gray-700'
                "
              >
                {{
                  upload.status === 'error' ? 'Failed' : `${upload.progress}%`
                }}
              </span>
              <UButton
                v-if="upload.status === 'error'"
                size="xs"
                color="red"
                variant="ghost"
                @click="retryUpload(upload)"
              >
                Retry
              </UButton>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="mt-2">
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="h-2 rounded-full transition-all duration-300"
                :class="getProgressBarClass(upload.status)"
                :style="{ width: `${upload.progress}%` }"
              ></div>
            </div>
          </div>

          <!-- Status Messages -->
          <div v-if="upload.message" class="mt-2">
            <UAlert
              :color="upload.status === 'error' ? 'red' : 'blue'"
              variant="soft"
              size="sm"
            >
              {{ upload.message }}
            </UAlert>
          </div>
        </div>
      </div>
    </div>

    <!-- Upload Summary -->
    <div v-if="completedCount > 0" class="upload-summary mt-4">
      <UAlert
        :color="hasErrors ? 'yellow' : 'green'"
        variant="soft"
        :icon="hasErrors ? 'i-lucide-alert-triangle' : 'i-lucide-check-circle'"
      >
        <template #title>
          {{
            hasErrors
              ? 'Upload completed with errors'
              : 'Upload completed successfully'
          }}
        </template>
        <template #description>
          {{ completedCount }} files uploaded
          <span v-if="errorCount > 0" class="text-red-600">
            • {{ errorCount }} failed
          </span>
        </template>
      </UAlert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useToast } from '@/composables/useToast';

// Props
interface Props {
  folder: string;
  allowedTypes?: string[];
  maxSize?: string;
  multiple?: boolean;
  autoUpload?: boolean;
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
  multiple: true,
  autoUpload: true,
});

// Emits
const emit = defineEmits<{
  'upload-complete': [files: UploadedFile[]];
  'upload-error': [error: string];
}>();

// Composables
const toast = useToast();

// State
const fileInput = ref<HTMLInputElement>();
const isDragOver = ref(false);
const isUploading = ref(false);
const uploads = ref<UploadItem[]>([]);

// Computed
const acceptedTypes = computed(() => {
  return props.allowedTypes.map((type) => `.${type}`).join(',');
});

const completedCount = computed(() => {
  return uploads.value.filter((upload) => upload.status === 'completed').length;
});

const errorCount = computed(() => {
  return uploads.value.filter((upload) => upload.status === 'error').length;
});

const hasErrors = computed(() => {
  return errorCount.value > 0;
});

// Types
interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  message?: string;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  path: string;
}

// Methods
const triggerFileInput = () => {
  if (!isUploading.value) {
    fileInput.value?.click();
  }
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  isDragOver.value = false;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragOver.value = false;

  const files = Array.from(e.dataTransfer?.files || []);
  if (files.length > 0) {
    processFiles(files);
  }
};

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  if (files.length > 0) {
    processFiles(files);
  }

  // Reset input value to allow selecting the same file again
  target.value = '';
};

const processFiles = (files: File[]) => {
  // Validate files
  const validFiles = files.filter((file) => validateFile(file));

  if (validFiles.length === 0) {
    toast.error('No valid files selected');
    return;
  }

  // Create upload items
  const newUploads = validFiles.map((file) => ({
    id: generateId(),
    file,
    progress: 0,
    status: 'pending' as const,
    message: undefined,
  }));

  uploads.value.push(...newUploads);

  // Auto-upload if enabled
  if (props.autoUpload) {
    uploadFiles(newUploads);
  }
};

const validateFile = (file: File): boolean => {
  // Check file type
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !props.allowedTypes.includes(extension)) {
    toast.error(`File type '${extension}' not allowed`);
    return false;
  }

  // Check file size
  const maxSizeBytes = parseSizeString(props.maxSize);
  if (file.size > maxSizeBytes) {
    toast.error(`File size exceeds limit of ${props.maxSize}`);
    return false;
  }

  return true;
};

const uploadFiles = async (items: UploadItem[]) => {
  isUploading.value = true;

  for (const item of items) {
    try {
      item.status = 'uploading';
      item.progress = 0;

      // Simulate progress (in real implementation, use XMLHttpRequest or fetch with progress)
      const progressInterval = setInterval(() => {
        if (item.progress < 90) {
          item.progress += Math.random() * 20;
        }
      }, 200);

      // Upload file
      const formData = new FormData();
      formData.append('file', item.file);

      const response = await fetch(`/api/v1/storage/upload/${props.folder}`, {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        item.status = 'completed';
        item.progress = 100;
        item.message = 'Upload successful';

        // Emit success
        emit('upload-complete', [
          {
            id: item.id,
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            url: result.data.url,
            path: result.data.path,
          },
        ]);
      } else {
        throw new Error(result.error?.message || 'Upload failed');
      }
    } catch (error) {
      item.status = 'error';
      item.progress = 0;
      item.message = error instanceof Error ? error.message : 'Upload failed';

      emit('upload-error', item.message);
    }
  }

  isUploading.value = false;
};

const retryUpload = (item: UploadItem) => {
  item.status = 'pending';
  item.progress = 0;
  item.message = undefined;

  uploadFiles([item]);
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

const getProgressBarClass = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    case 'uploading':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const parseSizeString = (sizeStr: string): number => {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match) return 100 * 1024 * 1024; // Default to 100MB

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * (units[unit] || 1);
};

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

const getAuthToken = (): string => {
  // In a real implementation, get this from your auth store
  return localStorage.getItem('auth_token') || '';
};

// Lifecycle
onMounted(() => {
  // Component is ready
});
</script>

<style scoped>
.file-upload {
  @apply w-full;
}

.upload-zone {
  @apply border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer transition-all duration-200;
}

.upload-zone:hover {
  @apply border-gray-400 bg-gray-50;
}

.upload-zone.drag-over {
  @apply border-blue-500 bg-blue-50;
}

.upload-zone.uploading {
  @apply border-gray-400 bg-gray-100 cursor-not-allowed;
}

.upload-content {
  @apply flex flex-col items-center space-y-3;
}

.upload-progress {
  @apply bg-gray-50 rounded-lg p-4;
}

.upload-item {
  @apply transition-all duration-200;
}

.upload-summary {
  @apply transition-all duration-200;
}

/* Animation for drag over */
.drag-over .upload-content {
  @apply transform scale-105;
}

/* Progress bar animation */
.upload-item .bg-blue-500 {
  @apply transition-all duration-300 ease-out;
}
</style>
