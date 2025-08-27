<template>
  <div class="media-player">
    <!-- Video Player -->
    <video
      v-if="isVideo"
      ref="videoPlayer"
      class="w-full rounded-lg"
      controls
      preload="metadata"
      @loadedmetadata="onMediaLoaded"
      @error="onMediaError"
    >
      <source :src="fileUrl" :type="file.mime_type" />
      Your browser does not support video playback.
    </video>

    <!-- Audio Player -->
    <audio
      v-else-if="isAudio"
      ref="audioPlayer"
      class="w-full"
      controls
      preload="metadata"
      @loadedmetadata="onMediaLoaded"
      @error="onMediaError"
    >
      <source :src="fileUrl" :type="file.mime_type" />
      Your browser does not support audio playback.
    </audio>

    <!-- PDF Viewer -->
    <div v-else-if="isPDF" class="pdf-viewer">
      <iframe
        :src="fileUrl"
        class="w-full h-96 border rounded-lg"
        frameborder="0"
        @load="onMediaLoaded"
        @error="onMediaError"
      ></iframe>
    </div>

    <!-- Image Viewer -->
    <div v-else-if="isImage" class="image-viewer">
      <img
        :src="fileUrl"
        :alt="file.name"
        class="w-full h-auto max-h-96 object-contain rounded-lg"
        @load="onMediaLoaded"
        @error="onMediaError"
      />
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
        <UButton @click="downloadFile" color="primary">
          <UIcon name="i-lucide-download" class="w-4 h-4 mr-2" />
          Download to view
        </UButton>
      </div>
    </div>

    <!-- File Information -->
    <div class="file-info mt-6">
      <div class="bg-gray-50 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">
          {{ file.name }}
        </h3>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span class="font-medium text-gray-700">Size:</span>
            <p class="text-gray-600">{{ formatFileSize(file.size) }}</p>
          </div>

          <div>
            <span class="font-medium text-gray-700">Type:</span>
            <p class="text-gray-600">{{ file.mime_type }}</p>
          </div>

          <div>
            <span class="font-medium text-gray-700">Uploaded:</span>
            <p class="text-gray-600">{{ formatDate(file.created) }}</p>
          </div>

          <div>
            <span class="font-medium text-gray-700">Modified:</span>
            <p class="text-gray-600">{{ formatDate(file.modified) }}</p>
          </div>
        </div>

        <!-- Media Controls (for video/audio) -->
        <div
          v-if="isVideo || isAudio"
          class="media-controls mt-4 pt-4 border-t border-gray-200"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <UButton size="sm" variant="outline" @click="togglePlayPause">
                <UIcon
                  :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
                  class="w-4 h-4"
                />
                {{ isPlaying ? 'Pause' : 'Play' }}
              </UButton>

              <UButton size="sm" variant="outline" @click="stopMedia">
                <UIcon name="i-lucide-square" class="w-4 h-4" />
                Stop
              </UButton>
            </div>

            <div class="flex items-center space-x-2">
              <UButton size="sm" variant="outline" @click="setVolume(0.5)">
                <UIcon name="i-lucide-volume-2" class="w-4 h-4" />
                50%
              </UButton>

              <UButton size="sm" variant="outline" @click="setVolume(1)">
                <UIcon name="i-lucide-volume-x" class="w-4 h-4" />
                Mute
              </UButton>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="mt-3">
            <div class="flex items-center space-x-2 text-xs text-gray-500">
              <span>{{ formatTime(currentTime) }}</span>
              <div class="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  class="bg-blue-500 h-2 rounded-full transition-all duration-100"
                  :style="{ width: `${progressPercent}%` }"
                ></div>
              </div>
              <span>{{ formatTime(duration) }}</span>
            </div>
          </div>
        </div>

        <!-- Download Button -->
        <div class="mt-4 pt-4 border-t border-gray-200">
          <UButton @click="downloadFile" color="primary" class="w-full">
            <UIcon name="i-lucide-download" class="w-4 h-4 mr-2" />
            Download {{ file.name }}
          </UButton>
        </div>
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
      <UAlert color="red" variant="soft">
        <template #title>Failed to load media</template>
        <template #description>
          {{ error }}
          <UButton
            size="sm"
            variant="ghost"
            color="red"
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useToast } from '@/composables/useToast';

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
}

const props = defineProps<Props>();

// Composables
const toast = useToast();

// Refs
const videoPlayer = ref<HTMLVideoElement>();
const audioPlayer = ref<HTMLAudioElement>();
const loading = ref(true);
const error = ref<string | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);

// Computed
const fileUrl = computed(() => {
  // In a real implementation, this would be the actual file URL
  // For now, we'll construct it from the API
  return `/api/v1/storage/download/${getFolderFromPath(props.file.path)}/${encodeURIComponent(props.file.name)}`;
});

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

const progressPercent = computed(() => {
  if (duration.value === 0) return 0;
  return (currentTime.value / duration.value) * 100;
});

// Methods
const getFolderFromPath = (path: string): string => {
  // Extract folder from path like "storage/public/filename.ext"
  const parts = path.split('/');
  return parts[1] || 'public';
};

const onMediaLoaded = () => {
  loading.value = false;
  error.value = null;

  if (isVideo.value && videoPlayer.value) {
    duration.value = videoPlayer.value.duration || 0;
    setupVideoEvents();
  } else if (isAudio.value && audioPlayer.value) {
    duration.value = audioPlayer.value.duration || 0;
    setupAudioEvents();
  }
};

const onMediaError = (e: Event) => {
  loading.value = false;
  error.value = 'Failed to load media file';
  console.error('Media error:', e);
};

const setupVideoEvents = () => {
  if (!videoPlayer.value) return;

  const video = videoPlayer.value;

  video.addEventListener('play', () => {
    isPlaying.value = true;
  });

  video.addEventListener('pause', () => {
    isPlaying.value = false;
  });

  video.addEventListener('ended', () => {
    isPlaying.value = false;
    currentTime.value = 0;
  });

  video.addEventListener('timeupdate', () => {
    currentTime.value = video.currentTime;
  });

  video.addEventListener('loadedmetadata', () => {
    duration.value = video.duration;
  });
};

const setupAudioEvents = () => {
  if (!audioPlayer.value) return;

  const audio = audioPlayer.value;

  audio.addEventListener('play', () => {
    isPlaying.value = true;
  });

  audio.addEventListener('pause', () => {
    isPlaying.value = false;
  });

  audio.addEventListener('ended', () => {
    isPlaying.value = false;
    currentTime.value = 0;
  });

  audio.addEventListener('timeupdate', () => {
    currentTime.value = audio.currentTime;
  });

  audio.addEventListener('loadedmetadata', () => {
    duration.value = audio.duration;
  });
};

const togglePlayPause = () => {
  if (isVideo.value && videoPlayer.value) {
    if (isPlaying.value) {
      videoPlayer.value.pause();
    } else {
      videoPlayer.value.play();
    }
  } else if (isAudio.value && audioPlayer.value) {
    if (isPlaying.value) {
      audioPlayer.value.pause();
    } else {
      audioPlayer.value.play();
    }
  }
};

const stopMedia = () => {
  if (isVideo.value && videoPlayer.value) {
    videoPlayer.value.pause();
    videoPlayer.value.currentTime = 0;
    isPlaying.value = false;
    currentTime.value = 0;
  } else if (isAudio.value && audioPlayer.value) {
    audioPlayer.value.pause();
    audioPlayer.value.currentTime = 0;
    isPlaying.value = false;
    currentTime.value = 0;
  }
};

const setVolume = (volume: number) => {
  if (isVideo.value && videoPlayer.value) {
    videoPlayer.value.volume = volume;
  } else if (isAudio.value && audioPlayer.value) {
    audioPlayer.value.volume = volume;
  }
};

const downloadFile = async () => {
  try {
    const response = await fetch(fileUrl.value, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Download failed');
    }

    // Create download link
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = props.file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success('Download started');
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Download failed');
  }
};

const retryLoad = () => {
  loading.value = true;
  error.value = null;

  // Force reload of media
  nextTick(() => {
    if (isVideo.value && videoPlayer.value) {
      videoPlayer.value.load();
    } else if (isAudio.value && audioPlayer.value) {
      audioPlayer.value.load();
    }
  });
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

const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getAuthToken = (): string => {
  // In a real implementation, get this from your auth store
  return localStorage.getItem('auth_token') || '';
};

// Lifecycle
onMounted(() => {
  // Set initial loading state
  loading.value = true;

  // For non-media files, mark as loaded immediately
  if (!isVideo.value && !isAudio.value) {
    loading.value = false;
  }
});

onUnmounted(() => {
  // Clean up event listeners
  if (videoPlayer.value) {
    videoPlayer.value.removeEventListener('play', () => {});
    videoPlayer.value.removeEventListener('pause', () => {});
    videoPlayer.value.removeEventListener('ended', () => {});
    videoPlayer.value.removeEventListener('timeupdate', () => {});
    videoPlayer.value.removeEventListener('loadedmetadata', () => {});
  }

  if (audioPlayer.value) {
    audioPlayer.value.removeEventListener('play', () => {});
    audioPlayer.value.removeEventListener('pause', () => {});
    audioPlayer.value.removeEventListener('ended', () => {});
    audioPlayer.value.removeEventListener('timeupdate', () => {});
    audioPlayer.value.removeEventListener('loadedmetadata', () => {});
  }
});
</script>

<style scoped>
.media-player {
  @apply relative;
}

.loading-overlay {
  @apply absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center;
}

.pdf-viewer {
  @apply w-full;
}

.image-viewer {
  @apply w-full;
}

.unsupported-file {
  @apply w-full;
}

.file-info {
  @apply w-full;
}

.media-controls {
  @apply w-full;
}

/* Video and Audio player styling */
video,
audio {
  @apply w-full;
}

/* PDF iframe styling */
.pdf-viewer iframe {
  @apply w-full;
}

/* Image styling */
.image-viewer img {
  @apply w-full;
}

/* Progress bar styling */
.progress-bar {
  @apply w-full bg-gray-200 rounded-full h-2;
}

.progress-fill {
  @apply bg-blue-500 h-2 rounded-full transition-all duration-100;
}

/* Responsive design */
@media (max-width: 768px) {
  .file-info .grid {
    @apply grid-cols-2;
  }

  .media-controls .flex {
    @apply flex-col space-y-2;
  }
}
</style>
