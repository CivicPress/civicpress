<template>
  <div class="file-upload">
    <!-- Custom File Upload Area -->
    <div
      class="file-upload-area"
      :class="{
        'border-primary-500 bg-primary-50': isDragOver,
        'border-gray-300 bg-white': !isDragOver,
        'border-dashed': true,
        'border-2': true,
        'rounded-lg': true,
        'p-8': true,
        'text-center': true,
        'cursor-pointer': true,
        'hover:border-primary-400': true,
        'transition-colors': true,
        'min-h-48': true,
        flex: true,
        'flex-col': true,
        'items-center': true,
        'justify-center': true,
        'space-y-4': true,
      }"
      @click="triggerFileInput"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <!-- Upload Icon -->
      <UIcon name="i-lucide-upload" class="w-12 h-12 text-gray-400" />

      <!-- Upload Label -->
      <div class="space-y-2">
        <h3 class="text-lg font-medium text-gray-900">
          {{ uploadLabel }}
        </h3>
        <p class="text-sm text-gray-600">
          {{ uploadDescription }}
        </p>
      </div>

      <!-- File Input (Hidden) -->
      <input
        ref="fileInput"
        type="file"
        :accept="acceptedTypes"
        :multiple="props.multiple"
        class="hidden"
        @change="handleFileChange"
      />

      <!-- Action Buttons -->
      <div v-if="selectedFiles.length > 0" class="flex space-x-3">
        <UButton
          v-if="!isUploading"
          color="primary"
          @click.stop="uploadFiles"
          :disabled="isUploading"
        >
          <UIcon name="i-lucide-upload" class="w-4 h-4 mr-2" />
          Upload {{ selectedFiles.length }} File{{
            selectedFiles.length > 1 ? 's' : ''
          }}
        </UButton>

        <UButton
          color="neutral"
          variant="ghost"
          @click.stop="clearFiles"
          :disabled="isUploading"
        >
          Clear
        </UButton>
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
                color="error"
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
              :color="upload.status === 'error' ? 'error' : 'primary'"
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
        :color="hasErrors ? 'neutral' : 'primary'"
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
const selectedFiles = ref<File[]>([]);
const isUploading = ref(false);
const uploads = ref<UploadItem[]>([]);
const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// Computed
const acceptedTypes = computed(() => {
  return props.allowedTypes.map((type) => `.${type}`).join(',');
});

const uploadLabel = computed(() => {
  if (isUploading.value) return 'Uploading...';
  return 'Drop files here or click to browse';
});

const uploadDescription = computed(() => {
  return `Supports: ${props.allowedTypes.join(', ')} • Max: ${props.maxSize}`;
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
  message: string | undefined;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  path: string;
  folder?: string;
  description?: string;
  created_at?: string;
}

// Methods
const triggerFileInput = () => {
  fileInput.value?.click();
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;

  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length > 0) {
    handleFiles(files);
  }
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  if (files.length > 0) {
    handleFiles(files);
  }
};

const handleFiles = (files: File[]) => {
  // Validate files
  const validFiles = files.filter(validateFile);

  if (validFiles.length > 0) {
    selectedFiles.value = [...selectedFiles.value, ...validFiles];

    // Auto-upload if enabled
    if (props.autoUpload) {
      uploadFiles();
    }
  }
};

const validateFile = (file: File): boolean => {
  // Check file type
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !props.allowedTypes.includes(extension)) {
    toast.add({
      title: 'Invalid File Type',
      description: `File type '${extension}' not allowed`,
      color: 'error',
    });
    return false;
  }

  // Check file size
  const maxSizeBytes = parseSizeString(props.maxSize);
  if (file.size > maxSizeBytes) {
    toast.add({
      title: 'File Too Large',
      description: `File size exceeds limit of ${props.maxSize}`,
      color: 'error',
    });
    return false;
  }

  return true;
};

const clearFiles = () => {
  selectedFiles.value = [];
  uploads.value = [];
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const parseSizeString = (sizeStr: string): number => {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * (units[unit] || 1);
};

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

const uploadFiles = async () => {
  if (selectedFiles.value.length === 0) return;

  isUploading.value = true;

  // Create upload items
  const newUploads = selectedFiles.value.map((file) => ({
    id: generateId(),
    file,
    progress: 0,
    status: 'pending' as const,
    message: undefined,
  }));

  uploads.value.push(...newUploads);

  for (const item of newUploads) {
    try {
      item.status = 'uploading' as const;
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
      formData.append('folder', props.folder);
      if (item.description) {
        formData.append('description', item.description);
      }

      const response = (await useNuxtApp().$civicApi(`/api/v1/storage/files`, {
        method: 'POST',
        body: formData,
      })) as any;

      clearInterval(progressInterval);

      if (response.success) {
        item.status = 'completed' as const;
        item.progress = 100;
        item.message = 'Upload successful';

        // Emit success
        emit('upload-complete', [
          {
            id: response.data.id, // UUID from storage system
            name: response.data.original_name || item.file.name,
            size: response.data.size || item.file.size,
            type: response.data.mime_type || item.file.type,
            url: response.data.url,
            path: response.data.path,
            folder: response.data.folder,
            description: response.data.description,
            created_at: response.data.created_at,
          },
        ]);
      } else {
        throw new Error(response.error?.message || 'Upload failed');
      }
    } catch (error) {
      item.status = 'error' as const;
      item.progress = 0;
      item.message = error instanceof Error ? error.message : 'Upload failed';

      emit('upload-error', item.message);
    }
  }

  isUploading.value = false;

  // Clear selected files after upload
  if (props.autoUpload) {
    clearFiles();
  }
};

const retryUpload = (item: UploadItem) => {
  item.status = 'pending' as const;
  item.progress = 0;
  item.message = undefined;

  // Add file back to selected files and upload
  selectedFiles.value = [item.file];
  uploadFiles();
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

// Lifecycle
onMounted(() => {
  // Component is ready
});
</script>

<style scoped>
/* All styles are now handled by Tailwind classes in the template */
</style>
