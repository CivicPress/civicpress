<template>
  <div class="file-browser">
    <!-- Header with Navigation and Actions -->
    <div class="browser-header mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <h2 class="text-xl font-semibold text-gray-900">
            {{ folderName || 'Storage' }}
          </h2>
          <UBreadcrumb :items="breadcrumbItems" />
        </div>

        <div class="flex items-center space-x-3">
          <UButton
            @click="refreshFiles"
            :loading="loading"
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
    </div>

    <!-- Search and Filters -->
    <div class="filters mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UInput
          v-model="searchQuery"
          placeholder="Search files..."
          icon="i-lucide-search"
          @input="debouncedSearch"
          clearable
        />

        <USelect
          v-model="selectedType"
          :options="fileTypeOptions"
          placeholder="All types"
          icon="i-lucide-filter"
        />

        <USelect
          v-model="sortBy"
          :options="sortOptions"
          placeholder="Sort by"
          icon="i-lucide-sort-asc"
        />
      </div>
    </div>

    <!-- File Grid/List -->
    <div class="file-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="flex items-center justify-center py-12">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-gray-400 animate-spin mr-3"
          />
          <span class="text-gray-500">Loading files...</span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredFiles.length === 0" class="empty-state">
        <div class="text-center py-12">
          <UIcon
            name="i-lucide-folder-open"
            class="w-16 h-16 text-gray-300 mx-auto mb-4"
          />
          <h3 class="text-lg font-medium text-gray-900 mb-2">
            {{ searchQuery ? 'No files found' : 'No files in this folder' }}
          </h3>
          <p class="text-gray-500 mb-4">
            {{
              searchQuery
                ? 'Try adjusting your search terms'
                : 'Upload some files to get started'
            }}
          </p>
          <UButton
            v-if="!searchQuery && canUpload"
            @click="showUploadModal = true"
            color="primary"
          >
            <UIcon name="i-lucide-upload" class="w-4 h-4 mr-2" />
            Upload Files
          </UButton>
        </div>
      </div>

      <!-- File Grid -->
      <div v-else class="file-grid">
        <div
          v-for="file in paginatedFiles"
          :key="file.path"
          class="file-item"
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
              @click="previewFile(file)"
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
              color="red"
              @click="deleteFile(file)"
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
      <div v-if="selectedFiles.length > 0" class="bulk-actions mt-4">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-blue-700">
              {{ selectedFiles.length }} file(s) selected
            </span>

            <div class="flex items-center space-x-2">
              <UButton
                size="sm"
                variant="outline"
                @click="downloadSelectedFiles"
              >
                <UIcon name="i-lucide-download" class="w-4 h-4 mr-2" />
                Download Selected
              </UButton>

              <UButton
                v-if="canDelete"
                size="sm"
                color="red"
                variant="outline"
                @click="deleteSelectedFiles"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4 mr-2" />
                Delete Selected
              </UButton>

              <UButton size="sm" variant="ghost" @click="clearSelection">
                Clear Selection
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
    <UModal v-model:open="showUploadModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Upload Files</h3>
            <UButton
              variant="ghost"
              color="gray"
              @click="showUploadModal = false"
            >
              <UIcon name="i-lucide-x" class="w-4 h-4" />
            </UButton>
          </div>
        </template>

        <FileUpload
          :folder="folderName"
          :allowed-types="allowedTypes"
          :max-size="maxSize"
          @upload-complete="handleUploadComplete"
          @upload-error="handleUploadError"
        />
      </UCard>
    </UModal>

    <!-- File Preview Modal -->
    <UModal v-model:open="showPreviewModal" size="4xl">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">{{ previewFile?.name }}</h3>
            <UButton
              variant="ghost"
              color="gray"
              @click="showPreviewModal = false"
            >
              <UIcon name="i-lucide-x" class="w-4 h-4" />
            </UButton>
          </div>
        </template>

        <div v-if="previewFile" class="file-preview">
          <MediaPlayer :file="previewFile" />
        </div>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import FileUpload from './FileUpload.vue'
import MediaPlayer from './MediaPlayer.vue'

// Props
interface Props {
  folder: string
  allowedTypes?: string[]
  maxSize?: string
}

const props = withDefaults(defineProps<Props>(), {
  allowedTypes: () => ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'md', 'mp4', 'webm', 'mp3', 'wav'],
  maxSize: '100MB'
})

// Composables
const toast = useToast()
const authStore = useAuthStore()

// State
const loading = ref(false)
const files = ref<FileInfo[]>([])
const searchQuery = ref('')
const selectedType = ref('')
const sortBy = ref('name')
const currentPage = ref(1)
const perPage = ref(20)
const selectedFiles = ref<string[]>([])
const showUploadModal = ref(false)
const showPreviewModal = ref(false)
const previewFile = ref<FileInfo | null>(null)

// Computed
const folderName = computed(() => props.folder)

const breadcrumbItems = computed(() => [
  { label: 'Storage', to: '/storage' },
  { label: props.folder, to: `/storage/${props.folder}` }
])

const fileTypeOptions = computed(() => [
  { label: 'All types', value: '' },
  { label: 'Images', value: 'image' },
  { label: 'Documents', value: 'document' },
  { label: 'Videos', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Other', value: 'other' }
])

const sortOptions = computed(() => [
  { label: 'Name A-Z', value: 'name' },
  { label: 'Name Z-A', value: 'name-desc' },
  { label: 'Date (newest)', value: 'date-desc' },
  { label: 'Date (oldest)', value: 'date-asc' },
  { label: 'Size (largest)', value: 'size-desc' },
  { label: 'Size (smallest)', value: 'size-asc' }
])

const filteredFiles = computed(() => {
  let filtered = [...files.value]

  // Apply search filter
  if (searchQuery.value) {
    filtered = filtered.filter(file =>
      file.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }

  // Apply type filter
  if (selectedType.value) {
    filtered = filtered.filter(file => {
      const mimeType = file.mime_type.toLowerCase()
      switch (selectedType.value) {
        case 'image':
          return mimeType.startsWith('image/')
        case 'document':
          return mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('document')
        case 'video':
          return mimeType.startsWith('video/')
        case 'audio':
          return mimeType.startsWith('audio/')
        case 'other':
          return !mimeType.startsWith('image/') && !mimeType.startsWith('video/') && !mimeType.startsWith('audio/')
        default:
          return true
      }
    })
  }

  // Apply sorting
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'name-desc':
        return b.name.localeCompare(a.name)
      case 'date-desc':
        return new Date(b.modified).getTime() - new Date(a.modified).getTime()
      case 'date-asc':
        return new Date(a.modified).getTime() - new Date(b.modified).getTime()
      case 'size-desc':
        return b.size - a.size
      case 'size-asc':
        return a.size - b.size
      default:
        return 0
    }
  })

  return filtered
})

const totalFiles = computed(() => filteredFiles.value.length)
const totalPages = computed(() => Math.ceil(totalFiles.value / perPage.value)

const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * perPage.value
  const end = start + perPage.value
  return filteredFiles.value.slice(start, end)
})

const canUpload = computed(() => {
  return authStore.hasPermission('storage:upload')
})

const canDelete = computed(() => {
  return authStore.hasPermission('storage:delete')
})

// Types
interface FileInfo {
  name: string
  size: number
  mime_type: string
  path: string
  url: string
  created: string
  modified: string
}

// Methods
const loadFiles = async () => {
  loading.value = true

  try {
    const response = await fetch(`/api/v1/storage/files/${props.folder}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to load files')
    }

    const result = await response.json()

    if (result.success) {
      files.value = result.data.files
    } else {
      throw new Error(result.error?.message || 'Failed to load files')
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to load files')
  } finally {
    loading.value = false
  }
}

const refreshFiles = () => {
  loadFiles()
}

const debouncedSearch = () => {
  // Reset to first page when searching
  currentPage.value = 1
}

const selectFile = (file: FileInfo) => {
  const index = selectedFiles.value.indexOf(file.path)
  if (index > -1) {
    selectedFiles.value.splice(index, 1)
  } else {
    selectedFiles.value.push(file.path)
  }
}

const toggleFileSelection = (file: FileInfo) => {
  selectFile(file)
}

const clearSelection = () => {
  selectedFiles.value = []
}

const previewFile = (file: FileInfo) => {
  previewFile.value = file
  showPreviewModal.value = true
}

const downloadFile = async (file: FileInfo) => {
  try {
    const response = await fetch(`/api/v1/storage/download/${props.folder}/${encodeURIComponent(file.name)}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    })

    if (!response.ok) {
      throw new Error('Download failed')
    }

    // Create download link
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    toast.success('Download started')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Download failed')
  }
}

const deleteFile = async (file: FileInfo) => {
  if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
    return
  }

  try {
    const response = await fetch(`/api/v1/storage/files/${props.folder}/${encodeURIComponent(file.name)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    })

    if (!response.ok) {
      throw new Error('Delete failed')
    }

    const result = await response.json()

    if (result.success) {
      toast.success('File deleted successfully')
      await loadFiles()
    } else {
      throw new Error(result.error?.message || 'Delete failed')
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Delete failed')
  }
}

const downloadSelectedFiles = () => {
  // For multiple files, we'd need to implement a zip download or individual downloads
  toast.info('Downloading selected files...')
  selectedFiles.value.forEach(path => {
    const file = files.value.find(f => f.path === path)
    if (file) {
      downloadFile(file)
    }
  })
}

const deleteSelectedFiles = async () => {
  if (!confirm(`Are you sure you want to delete ${selectedFiles.value.length} files?`)) {
    return
  }

  try {
    let deletedCount = 0

    for (const path of selectedFiles.value) {
      const file = files.value.find(f => f.path === path)
      if (file) {
        await deleteFile(file)
        deletedCount++
      }
    }

    toast.success(`${deletedCount} files deleted successfully`)
    clearSelection()
  } catch (error) {
    toast.error('Some files could not be deleted')
  }
}

const handleUploadComplete = (uploadedFiles: any[]) => {
  toast.success(`${uploadedFiles.length} files uploaded successfully`)
  showUploadModal.value = false
  loadFiles()
}

const handleUploadError = (error: string) => {
  toast.error(error)
}

const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return 'i-lucide-image'
  if (mimeType.startsWith('video/')) return 'i-lucide-video'
  if (mimeType.startsWith('audio/')) return 'i-lucide-music'
  if (mimeType.includes('pdf')) return 'i-lucide-file-text'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'i-lucide-file-text'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'i-lucide-file-spreadsheet'
  return 'i-lucide-file'
}

const getFileIconColor = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return 'text-blue-500'
  if (mimeType.startsWith('video/')) return 'text-purple-500'
  if (mimeType.startsWith('audio/')) return 'text-green-500'
  if (mimeType.includes('pdf')) return 'text-red-500'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-600'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'text-green-600'
  return 'text-gray-500'
}

const canPreview = (file: FileInfo): boolean => {
  const mimeType = file.mime_type.toLowerCase()
  return mimeType.startsWith('image/') ||
         mimeType.startsWith('video/') ||
         mimeType.startsWith('audio/') ||
         mimeType.includes('pdf')
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString()
}

const getAuthToken = (): string => {
  // In a real implementation, get this from your auth store
  return localStorage.getItem('auth_token') || ''
}

// Lifecycle
onMounted(() => {
  loadFiles()
})

// Watchers
watch(() => props.folder, () => {
  currentPage.value = 1
  selectedFiles.value = []
  loadFiles()
})
</script>

<style scoped>
.file-browser {
  @apply w-full;
}

.browser-header {
  @apply border-b border-gray-200 pb-4;
}

.filters {
  @apply bg-gray-50 rounded-lg p-4;
}

.file-content {
  @apply min-h-64;
}

.loading-state,
.empty-state {
  @apply flex items-center justify-center;
}

.file-grid {
  @apply grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4;
}

.file-item {
  @apply bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all duration-200 relative;
}

.file-item.selected {
  @apply border-blue-500 bg-blue-50;
}

.file-main {
  @apply cursor-pointer;
}

.file-icon {
  @apply flex justify-center mb-3;
}

.file-info {
  @apply text-center;
}

.file-name {
  @apply text-sm font-medium text-gray-900 truncate mb-1;
}

.file-size,
.file-date {
  @apply text-xs text-gray-500;
}

.file-actions {
  @apply absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200;
}

.file-item:hover .file-actions {
  @apply opacity-100;
}

.file-selection {
  @apply absolute top-2 left-2;
}

.bulk-actions {
  @apply sticky bottom-4 z-10;
}

.file-preview {
  @apply max-h-96 overflow-auto;
}
</style>
