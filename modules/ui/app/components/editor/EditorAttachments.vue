<script setup lang="ts">
import { ref, onMounted } from 'vue';
import FileBrowserPopover from '~/components/storage/FileBrowserPopover.vue';
import { useAttachmentTypes } from '~/composables/useAttachmentTypes';

const { t } = useI18n();

interface Props {
  attachedFiles: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?: string;
  }>;
  disabled?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:attachedFiles': [files: typeof props.attachedFiles];
}>();

const { getAttachmentTypeOptions, fetchAttachmentTypes } = useAttachmentTypes();
const showFileBrowser = ref(false);
const toast = useToast();

// Fetch attachment types on mount
onMounted(async () => {
  await fetchAttachmentTypes();
});

const handleFilesSelected = (files: any[]) => {
  const newFiles = files.map((file) => ({
    id: file.id,
    path: file.relative_path,
    original_name: file.original_name,
    description: '',
    category: 'reference',
  }));

  emit('update:attachedFiles', [...props.attachedFiles, ...newFiles]);
  showFileBrowser.value = false;

  toast.add({
    title: t('records.filesAdded'),
    description: (t as any)('records.filesAttachedToRecord', files.length, {
      count: files.length,
    }),
    color: 'primary',
  });
};

const removeFile = (index: number) => {
  const updated = [...props.attachedFiles];
  updated.splice(index, 1);
  emit('update:attachedFiles', updated);
};

const updateFileCategory = (index: number, category: any) => {
  const updated = [...props.attachedFiles];
  const file = updated[index];
  if (file) {
    updated[index] = {
      id: file.id,
      path: file.path,
      original_name: file.original_name,
      description: file.description,
      category: typeof category === 'string' ? category : category?.value,
    };
    emit('update:attachedFiles', updated);
  }
};

const updateFileDescription = (index: number, description: string) => {
  const updated = [...props.attachedFiles];
  const file = updated[index];
  if (file) {
    updated[index] = {
      id: file.id,
      path: file.path,
      original_name: file.original_name,
      description,
      category: file.category,
    };
    emit('update:attachedFiles', updated);
  }
};

const getFileUrl = (fileId: string): string => {
  if (!process.client) return '';
  const config = useRuntimeConfig();
  return `${config.public.civicApiUrl}/api/v1/storage/files/${fileId}`;
};

const downloadFile = async (fileId: string, fileName: string) => {
  if (!process.client) return;

  try {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();

    const response = await fetch(getFileUrl(fileId), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authStore.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
    toast.add({
      title: t('records.downloadFailed'),
      description: t('records.failedToDownloadFile'),
      color: 'error',
    });
  }
};
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-end">
      <UPopover v-model:open="showFileBrowser">
        <UButton
          icon="i-lucide-plus"
          color="primary"
          variant="outline"
          size="xs"
          :disabled="disabled"
        >
          {{ t('records.attachments.addFiles') }}
        </UButton>

        <template #content>
          <FileBrowserPopover
            @files-selected="handleFilesSelected"
            @cancel="showFileBrowser = false"
          />
        </template>
      </UPopover>
    </div>

    <div v-if="attachedFiles.length > 0" class="space-y-3">
      <div
        v-for="(file, index) in attachedFiles"
        :key="file.id"
        class="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-white dark:bg-gray-800"
      >
        <!-- Top: Title and Actions -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ file.original_name }}</p>
            <p class="text-xs text-gray-500 font-mono truncate">
              {{ file.id }}
            </p>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0 -mt-2 -mr-2">
            <UButton
              icon="i-lucide-download"
              variant="ghost"
              size="xs"
              @click="downloadFile(file.id, file.original_name)"
              :disabled="disabled"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              color="error"
              @click="removeFile(index)"
              :disabled="disabled"
            />
          </div>
        </div>

        <!-- Bottom: Content (Full Width) -->
        <div class="space-y-2">
          <UFormField :label="t('records.attachments.category')" size="xs">
            <USelectMenu
              :model-value="
                getAttachmentTypeOptions().find(
                  (opt) => opt.value === file.category
                )
              "
              :items="getAttachmentTypeOptions()"
              @update:model-value="(val) => updateFileCategory(index, val)"
              :disabled="disabled"
              size="xs"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('common.description')" size="xs">
            <UInput
              :model-value="file.description || ''"
              @update:model-value="(val) => updateFileDescription(index, val)"
              :disabled="disabled"
              size="xs"
              :placeholder="t('records.attachments.optionalDescription')"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <div
      v-else
      class="text-center py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
    >
      <p class="text-xs text-gray-500">
        {{ t('records.attachments.noFilesAttached') }}
      </p>
    </div>
  </div>
</template>
