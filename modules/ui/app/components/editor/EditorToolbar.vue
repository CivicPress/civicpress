<script setup lang="ts">
import { ref } from 'vue';

const { t } = useI18n();

interface Props {
  disabled?: boolean;
  showPreview?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  showPreview: false,
});

const emit = defineEmits<{
  bold: [];
  italic: [];
  underline: [];
  code: [];
  heading: [level: 1 | 2 | 3];
  bulletList: [];
  numberedList: [];
  blockquote: [];
  horizontalRule: [];
  link: [];
  image: [];
  'toggle-preview': [];
}>();

const handleAction = (action: string, ...args: any[]) => {
  if (props.disabled) return;
  // Type-safe emit based on action
  if (action === 'bold') emit('bold');
  else if (action === 'italic') emit('italic');
  else if (action === 'underline') emit('underline');
  else if (action === 'code') emit('code');
  else if (action === 'heading' && args[0])
    emit('heading', args[0] as 1 | 2 | 3);
  else if (action === 'bulletList') emit('bulletList');
  else if (action === 'numberedList') emit('numberedList');
  else if (action === 'blockquote') emit('blockquote');
  else if (action === 'horizontalRule') emit('horizontalRule');
  else if (action === 'link') emit('link');
  else if (action === 'image') emit('image');
};
</script>

<template>
  <div
    class="editor-toolbar flex items-center justify-between gap-0.5 sm:gap-1 p-2 sm:p-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto"
  >
    <div class="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
      <!-- Formatting -->
      <div
        class="flex items-center gap-0.5 sm:gap-1 border-r border-gray-300 dark:border-gray-700 pr-1.5 sm:pr-2 flex-shrink-0"
      >
        <UButton
          icon="i-lucide-bold"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('bold')"
          :title="t('records.editor.toolbar.bold')"
          :aria-label="t('records.editor.toolbar.bold')"
        />
        <UButton
          icon="i-lucide-italic"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('italic')"
          :title="t('records.editor.toolbar.italic')"
          :aria-label="t('records.editor.toolbar.italic')"
        />
        <UButton
          icon="i-lucide-underline"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('underline')"
          :title="t('records.editor.toolbar.underline')"
          :aria-label="t('records.editor.toolbar.underline')"
        />
        <UButton
          icon="i-lucide-code"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('code')"
          :title="t('records.editor.toolbar.inlineCode')"
          :aria-label="t('records.editor.toolbar.inlineCode')"
        />
      </div>

      <!-- Headings -->
      <div
        class="flex items-center gap-0.5 sm:gap-1 border-r border-gray-300 dark:border-gray-700 pr-1.5 sm:pr-2 flex-shrink-0"
      >
        <UButton
          icon="i-lucide-heading-1"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('heading', 1)"
          :title="t('records.editor.toolbar.heading1')"
          :aria-label="t('records.editor.toolbar.heading1')"
        />
        <UButton
          icon="i-lucide-heading-2"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('heading', 2)"
          :title="t('records.editor.toolbar.heading2')"
          :aria-label="t('records.editor.toolbar.heading2')"
        />
        <UButton
          icon="i-lucide-heading-3"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('heading', 3)"
          :title="t('records.editor.toolbar.heading3')"
          :aria-label="t('records.editor.toolbar.heading3')"
        />
      </div>

      <!-- Lists -->
      <div
        class="flex items-center gap-0.5 sm:gap-1 border-r border-gray-300 dark:border-gray-700 pr-1.5 sm:pr-2 flex-shrink-0"
      >
        <UButton
          icon="i-lucide-list"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('bulletList')"
          :title="t('records.editor.toolbar.bulletList')"
          :aria-label="t('records.editor.toolbar.bulletList')"
        />
        <UButton
          icon="i-lucide-list-ordered"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('numberedList')"
          :title="t('records.editor.toolbar.numberedList')"
          :aria-label="t('records.editor.toolbar.numberedList')"
        />
      </div>

      <!-- Other -->
      <div
        class="flex items-center gap-0.5 sm:gap-1 border-r border-gray-300 dark:border-gray-700 pr-1.5 sm:pr-2 flex-shrink-0"
      >
        <UButton
          icon="i-lucide-quote"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('blockquote')"
          :title="t('records.editor.toolbar.blockquote')"
          :aria-label="t('records.editor.toolbar.blockquote')"
        />
        <UButton
          icon="i-lucide-minus"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('horizontalRule')"
          :title="t('records.editor.toolbar.horizontalRule')"
          :aria-label="t('records.editor.toolbar.horizontalRule')"
        />
      </div>

      <!-- Links & Images -->
      <div class="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        <UButton
          icon="i-lucide-link"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('link')"
          :title="t('records.editor.toolbar.insertLink')"
          :aria-label="t('records.editor.toolbar.insertLink')"
        />
        <UButton
          icon="i-lucide-image"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="handleAction('image')"
          :title="t('records.editor.toolbar.insertImage')"
          :aria-label="t('records.editor.toolbar.insertImage')"
        />
      </div>
    </div>

    <!-- Preview Toggle (Right Side) -->
    <div
      class="flex items-center gap-1 ml-auto flex-shrink-0 border-l border-gray-300 dark:border-gray-700 pl-1.5 sm:pl-2"
    >
      <UButton
        :icon="showPreview ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        variant="ghost"
        size="xs"
        :disabled="disabled"
        @click="emit('toggle-preview')"
        :aria-label="
          showPreview
            ? t('records.editor.toolbar.hidePreview')
            : t('records.editor.toolbar.showPreview')
        "
      >
        <span class="hidden sm:inline">{{
          showPreview
            ? t('records.editor.toolbar.hidePreview')
            : t('records.editor.toolbar.showPreview')
        }}</span>
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.editor-toolbar {
  user-select: none;
  /* Hide scrollbar but allow scrolling */
  scrollbar-width: thin;
  scrollbar-color: rgb(203, 213, 225) transparent;
}

.dark .editor-toolbar {
  scrollbar-color: rgb(51, 65, 85) transparent;
}

.editor-toolbar::-webkit-scrollbar {
  height: 4px;
}

.editor-toolbar::-webkit-scrollbar-track {
  background: transparent;
}

.editor-toolbar::-webkit-scrollbar-thumb {
  background: rgb(203, 213, 225);
  border-radius: 2px;
}

.dark .editor-toolbar::-webkit-scrollbar-thumb {
  background: rgb(51, 65, 85);
}
</style>
