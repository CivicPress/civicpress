<template>
  <div class="file-content">
    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="flex flex-col items-center justify-center py-16">
        <div
          class="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-4"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-blue-600 animate-spin"
          />
        </div>
        <span class="text-gray-600 font-medium">{{ t('settings.storage.loadingFiles') }}</span>
        <span class="text-gray-400 text-sm mt-1"
          >{{ t('settings.storage.loadingFilesDescription') }}</span
        >
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredFiles.length === 0" class="empty-state">
      <div class="text-center py-16 px-6">
        <div
          class="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <UIcon
            name="i-lucide-folder-open"
            class="w-12 h-12 text-gray-400"
          />
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-3">
          {{ searchQuery ? t('settings.storage.noFilesFound') : t('settings.storage.noFilesInFolder') }}
        </h3>
        <p class="text-gray-500 mb-6 max-w-md mx-auto">
          {{
            searchQuery
              ? t('settings.storage.tryAdjustingSearch')
              : t('settings.storage.folderEmpty')
          }}
        </p>
        <UButton
          v-if="!searchQuery && canUpload"
          @click="$emit('open-upload')"
          color="primary"
          size="lg"
          class="hover:shadow-lg transition-shadow"
        >
          <UIcon name="i-lucide-upload" class="w-5 h-5 mr-2" />
          {{ t('settings.storage.uploadFiles') }}
        </UButton>
      </div>
    </div>

    <!-- File Grid -->
    <div v-else class="file-grid">
      <div
        v-for="file in paginatedFiles"
        :key="file.path"
        class="file-item group"
        :class="{ selected: selectedFiles.includes(file.path) }"
      >
        <!-- File Icon and Info -->
        <div class="file-main" @click="$emit('select-file', file)">
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
            @click="$emit('open-preview', file)"
            :disabled="!canPreview(file)"
          >
            <UIcon name="i-lucide-eye" class="w-4 h-4" />
          </UButton>

          <UButton size="sm" variant="ghost" @click="$emit('download-file', file)">
            <UIcon name="i-lucide-download" class="w-4 h-4" />
          </UButton>

          <UButton
            v-if="canDelete"
            size="sm"
            variant="ghost"
            color="error"
            @click="$emit('delete-file', file)"
            :title="`Delete ${file.name}`"
          >
            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
          </UButton>
        </div>

        <!-- Selection Checkbox -->
        <div class="file-selection">
          <UCheckbox
            :model-value="selectedFiles.includes(file.path)"
            @update:model-value="$emit('toggle-selection', file)"
          />
        </div>
      </div>
    </div>

    <!-- Bulk Actions -->
    <div v-if="selectedFiles.length > 0" class="bulk-actions mt-4 mb-4">
      <div
        class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <UIcon
              name="i-lucide-check-circle"
              class="w-5 h-5 text-blue-600"
            />
            <span class="text-sm font-medium text-blue-700">
              <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
              {{ (t as any)('settings.storage.filesSelected', selectedFiles.length, { count: selectedFiles.length }) }}
            </span>
          </div>

          <div class="flex items-center space-x-2">
            <UButton
              size="sm"
              variant="outline"
              @click="$emit('download-selected')"
              class="hover:bg-blue-100"
            >
              <UIcon name="i-lucide-download" class="w-4 h-4 mr-2" />
              {{ t('settings.storage.downloadSelected') }}
            </UButton>

            <UButton
              v-if="canDelete"
              size="sm"
              color="error"
              variant="outline"
              @click="$emit('delete-selected')"
              class="hover:bg-red-100"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4 mr-2" />
              {{ t('settings.storage.deleteSelected') }}
            </UButton>

            <UButton
              size="sm"
              variant="ghost"
              @click="$emit('clear-selection')"
              class="hover:bg-gray-100"
            >
              {{ t('settings.storage.clearSelection') }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination mt-6">
      <UPagination
        :model-value="currentPage"
        :total="totalFiles"
        :per-page="perPage"
        @update:model-value="$emit('update:current-page', $event)"
        @change="$emit('page-change')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileInfo } from '~/composables/useFileBrowser';

interface Props {
  loading: boolean;
  filteredFiles: FileInfo[];
  paginatedFiles: FileInfo[];
  selectedFiles: string[];
  searchQuery: string;
  canUpload: boolean;
  canDelete: boolean;
  currentPage: number;
  totalFiles: number;
  totalPages: number;
  perPage: number;
  getFileIcon: (mimeType: string) => string;
  getFileIconColor: (mimeType: string) => string;
  formatFileSize: (bytes: number) => string;
  formatDate: (dateString: string) => string;
  canPreview: (file: FileInfo) => boolean;
}

defineProps<Props>();

defineEmits<{
  'open-upload': [];
  'select-file': [file: FileInfo];
  'open-preview': [file: FileInfo];
  'download-file': [file: FileInfo];
  'delete-file': [file: FileInfo];
  'toggle-selection': [file: FileInfo];
  'download-selected': [];
  'delete-selected': [];
  'clear-selection': [];
  'update:current-page': [value: number];
  'page-change': [];
}>();

const { t } = useI18n();
</script>

<style scoped>
/* File Content Area */
.file-content {
  background-color: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem 0;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 4rem 1.5rem;
}

/* File Grid */
.file-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
}

@media (min-width: 640px) {
  .file-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .file-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .file-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* File Item */
.file-item {
  position: relative;
  background-color: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-item:hover {
  border-color: #d1d5db;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transform: scale(1.05);
}

.file-item.selected {
  border-color: #3b82f6;
  background-color: #eff6ff;
  box-shadow: 0 0 0 2px #dbeafe;
}

/* File Main Content */
.file-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.file-main > * + * {
  margin-top: 0.75rem;
}

/* File Icon */
.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 0.5rem;
  background-color: #f3f4f6;
}

/* File Info */
.file-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  width: 100%;
}

.file-info > * + * {
  margin-top: 0.25rem;
}

.file-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.file-size {
  font-size: 0.75rem;
  color: #6b7280;
}

.file-date {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* File Actions */
.file-actions {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.file-actions > * + * {
  margin-left: 0.25rem;
}

.file-item:hover .file-actions {
  opacity: 1;
}

/* File Selection */
.file-selection {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
}

/* Bulk Actions */
.bulk-actions {
  margin: 0 1.5rem 1.5rem 1.5rem;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

/* Responsive Design */
@media (max-width: 640px) {
  .file-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 1rem;
  }

  .file-item {
    padding: 0.75rem;
  }

  .file-icon {
    width: 3rem;
    height: 3rem;
  }
}
</style>
