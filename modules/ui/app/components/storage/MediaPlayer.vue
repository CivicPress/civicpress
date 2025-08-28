<template>
  <div class="media-player">
    <!-- Video Player -->
    <div v-if="isVideo" class="video-player">
      <div v-if="videoData" class="video-container">
        <video
          ref="videoPlayer"
          class="w-full rounded-lg"
          controls
          preload="metadata"
          @loadedmetadata="onMediaLoaded"
          @error="onMediaError"
        >
          <source :src="videoData" :type="file.mime_type" />
          Your browser does not support video playback.
        </video>
      </div>
      <div v-else-if="loading" class="loading-container">
        <div class="flex items-center justify-center py-8">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-gray-400 animate-spin mr-3"
          />
          <span class="text-gray-500">Loading video...</span>
        </div>
      </div>
      <div v-else-if="error" class="error-container">
        <div class="text-center py-8">
          <UIcon
            name="i-lucide-alert-circle"
            class="w-12 h-12 text-red-400 mx-auto mb-3"
          />
          <p class="text-red-600">{{ error }}</p>
          <UButton @click="loadVideo" size="sm" variant="outline" class="mt-3">
            <UIcon name="i-lucide-refresh-cw" class="w-4 h-4 mr-2" />
            Retry
          </UButton>
        </div>
      </div>
    </div>

    <!-- Audio Player -->
    <div v-else-if="isAudio" class="audio-player">
      <div v-if="audioData" class="audio-container">
        <audio
          ref="audioPlayer"
          class="w-full"
          controls
          preload="metadata"
          @loadedmetadata="onMediaLoaded"
          @error="onMediaError"
        >
          <source :src="audioData" :type="file.mime_type" />
          Your browser does not support audio playback.
        </audio>
      </div>
      <div v-else-if="loading" class="loading-container">
        <div class="flex items-center justify-center py-8">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-gray-400 animate-spin mr-3"
          />
          <span class="text-gray-500">Loading audio...</span>
        </div>
      </div>
      <div v-else-if="error" class="error-container">
        <div class="text-center py-8">
          <UIcon
            name="i-lucide-alert-circle"
            class="w-12 h-12 text-red-400 mx-auto mb-3"
          />
          <p class="text-red-600">{{ error }}</p>
          <UButton @click="loadAudio" size="sm" variant="outline" class="mt-3">
            <UIcon name="i-lucide-refresh-cw" class="w-4 h-4 mr-2" />
            Retry
          </UButton>
        </div>
      </div>
    </div>

    <!-- PDF Viewer -->
    <div v-else-if="isPDF" class="pdf-viewer">
      <div v-if="pdfData" class="pdf-container">
        <iframe
          :src="pdfData"
          class="w-full h-96 border rounded-lg"
          frameborder="0"
        />
      </div>
      <div v-else-if="loading" class="loading-container">
        <div class="flex items-center justify-center py-8">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-gray-400 animate-spin mr-3"
          />
          <span class="text-gray-500">Loading PDF...</span>
        </div>
      </div>
      <div v-else-if="error" class="error-container">
        <div class="text-center py-8">
          <UIcon
            name="i-lucide-alert-circle"
            class="w-12 h-12 text-red-400 mx-auto mb-3"
          />
          <p class="text-red-600">{{ error }}</p>
          <UButton @click="loadPDF" size="sm" variant="outline" class="mt-3">
            <UIcon name="i-lucide-refresh-cw" class="w-4 h-4 mr-2" />
            Retry
          </UButton>
        </div>
      </div>
    </div>

    <!-- Image Viewer -->
    <div v-else-if="isImage" class="image-viewer">
      <div v-if="computedImageUrl" class="image-container">
        <img
          :src="computedImageUrl"
          :alt="file.name"
          class="w-full h-auto max-h-96 object-contain rounded-lg"
        />
      </div>
      <div v-else-if="loading" class="loading-container">
        <div class="flex items-center justify-center py-8">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-gray-400 animate-spin mr-3"
          />
          <span class="text-gray-500">Loading image...</span>
        </div>
      </div>
      <div v-else-if="error" class="error-container">
        <div class="text-center py-8">
          <UIcon
            name="i-lucide-alert-circle"
            class="w-12 h-12 text-red-400 mx-auto mb-3"
          />
          <p class="text-red-600">{{ error }}</p>
          <UButton @click="loadImage" size="sm" variant="outline" class="mt-3">
            <UIcon name="i-lucide-refresh-cw" class="w-4 h-4 mr-2" />
            Retry
          </UButton>
        </div>
      </div>
    </div>

    <!-- Unsupported File Type -->
    <div v-else class="unsupported-file">
      <div class="text-center py-12">
        <UIcon
          name="i-lucide-file-x"
          class="w-16 h-16 text-gray-300 mx-auto mb-4"
        />
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          Preview not available
        </h3>
        <p class="text-gray-500 mb-4">
          This file type cannot be previewed in the browser.
        </p>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-overlay">
      <div class="flex items-center justify-center py-8">
        <UIcon
          name="i-lucide-loader-2"
          class="w-8 h-8 text-blue-500 animate-spin mr-3"
        />
        <span class="text-gray-600">Loading media...</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="error-state mt-4">
      <UAlert color="error" variant="soft">
        <template #title>Failed to load media</template>
        <template #description>
          {{ error }}
          <UButton
            size="sm"
            variant="ghost"
            color="error"
            @click="retryLoad"
            class="ml-2"
          >
            Retry
          </UButton>
        </template>
      </UAlert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';

// Props
interface Props {
  file: {
    name: string;
    size: number;
    mime_type: string;
    path: string;
    url: string;
    created: string;
    modified: string;
  };
  folder?: string;
}

const props = defineProps<Props>();

// Refs
const videoPlayer = ref<HTMLVideoElement>();
const audioPlayer = ref<HTMLAudioElement>();
const loading = ref(true);
const error = ref<string | null>(null);
const imageData = ref<string | null>(null);
const pdfData = ref<string | null>(null);
const videoData = ref<string | null>(null);
const audioData = ref<string | null>(null);

const isVideo = computed(() => {
  return props.file.mime_type.startsWith('video/');
});

const isAudio = computed(() => {
  return props.file.mime_type.startsWith('audio/');
});

const isPDF = computed(() => {
  return props.file.mime_type.includes('pdf');
});

const isImage = computed(() => {
  return props.file.mime_type.startsWith('image/');
});

// Computed image URL for better reactivity
const computedImageUrl = computed(() => {
  return imageData.value;
});

// Methods
const extractFolderFromPath = (path: string): string => {
  // Extract folder from full system path like "/Users/.../data/storage/public/filename.ext"
  // or from relative path like "storage/public/filename.ext"
  const parts = path.split('/');

  // Look for "storage" in the path and get the next part as folder
  const storageIndex = parts.findIndex((part) => part === 'storage');
  if (storageIndex !== -1 && storageIndex + 1 < parts.length) {
    const folder = parts[storageIndex + 1] || 'public';
    return folder;
  }

  // Fallback: look for common storage folder names
  const storageFolders = [
    'public',
    'private',
    'documents',
    'images',
    'videos',
    'audio',
  ];
  for (const folder of storageFolders) {
    if (parts.includes(folder)) {
      return folder;
    }
  }

  // Default fallback
  return 'public';
};

const onMediaLoaded = () => {
  loading.value = false;
  error.value = null;
};

const onMediaError = (e: Event) => {
  loading.value = false;
  error.value = 'Failed to load media file';
};

const loadImage = async () => {
  if (!props.file || !isImage.value) {
    return;
  }

  loading.value = true;
  error.value = null;
  imageData.value = null;

  try {
    // Use props.folder if provided, otherwise extract from file path
    const folder = props.folder || extractFolderFromPath(props.file.path);

    // For file downloads, we need to use fetch directly to get the blob
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(
      `${config.public.civicApiUrl}/api/v1/storage/download/${folder}/${encodeURIComponent(props.file.name)}`,
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

    // Create blob URL and set it
    const url = window.URL.createObjectURL(blob);

    imageData.value = url;
    loading.value = false;
  } catch (err) {
    loading.value = false;
    error.value = err instanceof Error ? err.message : 'Failed to load image';
  }
};

const retryLoad = () => {
  loading.value = true;
  error.value = null;

  // Force reload of media
  nextTick(() => {
    if (isImage.value) {
      loadImage();
    } else if (isPDF.value) {
      loadPDF();
    } else if (isVideo.value) {
      loadVideo();
    } else if (isAudio.value) {
      loadAudio();
    }
  });
};

const loadPDF = async () => {
  if (!props.file || !isPDF.value) return;

  loading.value = true;
  error.value = null;
  pdfData.value = null;

  try {
    // Use props.folder if provided, otherwise extract from file path
    const folder = props.folder || extractFolderFromPath(props.file.path);

    // For file downloads, we need to use fetch directly to get the blob
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(
      `${config.public.civicApiUrl}/api/v1/storage/download/${folder}/${encodeURIComponent(props.file.name)}`,
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

    // Create blob URL and set it
    const url = window.URL.createObjectURL(blob);

    pdfData.value = url;
    loading.value = false;
  } catch (err) {
    loading.value = false;
    error.value = err instanceof Error ? err.message : 'Failed to load PDF';
  }
};

const loadVideo = async () => {
  if (!props.file || !isVideo.value) return;

  loading.value = true;
  error.value = null;
  videoData.value = null;

  try {
    // Use props.folder if provided, otherwise extract from file path
    const folder = props.folder || extractFolderFromPath(props.file.path);

    // For file downloads, we need to use fetch directly to get the blob
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(
      `${config.public.civicApiUrl}/api/v1/storage/download/${folder}/${encodeURIComponent(props.file.name)}`,
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

    // Create blob URL and set it
    const url = window.URL.createObjectURL(blob);

    videoData.value = url;
    loading.value = false;
  } catch (err) {
    loading.value = false;
    error.value = err instanceof Error ? err.message : 'Failed to load video';
  }
};

const loadAudio = async () => {
  if (!props.file || !isAudio.value) return;

  loading.value = true;
  error.value = null;
  audioData.value = null;

  try {
    // Use props.folder if provided, otherwise extract from file path
    const folder = props.folder || extractFolderFromPath(props.file.path);

    // For file downloads, we need to use fetch directly to get the blob
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(
      `${config.public.civicApiUrl}/api/v1/storage/download/${folder}/${encodeURIComponent(props.file.name)}`,
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

    // Create blob URL and set it
    const url = window.URL.createObjectURL(blob);

    audioData.value = url;
    loading.value = false;
  } catch (err) {
    loading.value = false;
    error.value = err instanceof Error ? err.message : 'Failed to load audio';
  }
};

// Lifecycle
onMounted(() => {
  // Set initial loading state
  loading.value = true;

  // For images, PDFs, videos, and audio, load them via API
  if (isImage.value) {
    loadImage();
  } else if (isPDF.value) {
    loadPDF();
  } else if (isVideo.value) {
    loadVideo();
  } else if (isAudio.value) {
    loadAudio();
  }
  // For non-media files, mark as loaded immediately
  else {
    loading.value = false;
  }
});

// Watch for file prop changes and reload media
watch(
  () => props.file,
  (newFile, oldFile) => {
    if (newFile && newFile !== oldFile) {
      // Reset state
      loading.value = true;
      error.value = null;
      imageData.value = null;
      pdfData.value = null;
      videoData.value = null;
      audioData.value = null;

      // Load new media
      if (isImage.value) {
        loadImage();
      } else if (isPDF.value) {
        loadPDF();
      } else if (isVideo.value) {
        loadVideo();
      } else if (isAudio.value) {
        loadAudio();
      } else {
        loading.value = false;
      }
    }
  },
  { immediate: true, deep: true }
);

onUnmounted(() => {
  // Clean up blob URLs to prevent memory leaks
  if (imageData.value) {
    window.URL.revokeObjectURL(imageData.value);
  }
  if (pdfData.value) {
    window.URL.revokeObjectURL(pdfData.value);
  }
  if (videoData.value) {
    window.URL.revokeObjectURL(videoData.value);
  }
  if (audioData.value) {
    window.URL.revokeObjectURL(audioData.value);
  }
});
</script>

<style scoped></style>
