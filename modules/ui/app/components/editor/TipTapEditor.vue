<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick, shallowRef } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';

interface CollaboratorUser {
  name: string;
  color: string;
}

interface Props {
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  theme?: 'light' | 'dark';
  minHeight?: string;
  maxHeight?: string;
  collaborativeMode?: boolean;
  yjsDoc?: Y.Doc;
  yjsFragment?: Y.XmlFragment;
  wsProvider?: WebsocketProvider;
  currentUser?: CollaboratorUser;
}

const { t } = useI18n();

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
  theme: 'light',
  minHeight: '400px',
  maxHeight: '70vh',
  collaborativeMode: false,
});

const placeholderText = computed(
  () => props.placeholder || t('records.enterContent')
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  focus: [];
  blur: [];
}>();

// Track if we're updating from external source to avoid loops
const isExternalUpdate = ref(false);

// Build extensions array
const getExtensions = () => {
  const extensions: any[] = [
    StarterKit.configure({
      // Disable undo/redo when in collaborative mode (Yjs handles this)
      undoRedo: props.collaborativeMode ? false : undefined,
    }),
    // Markdown extension for import/export (disabled in collaborative mode to avoid conflicts)
    ...(props.collaborativeMode
      ? []
      : [
          Markdown.configure({
            // Use GFM for better markdown support
            markedOptions: { gfm: true },
          }),
        ]),
    Image.configure({
      inline: false,
      allowBase64: true,
    }),
  ];

  // Add collaboration extensions when in collaborative mode
  if (props.collaborativeMode && props.yjsFragment && props.wsProvider) {
    extensions.push(
      Collaboration.configure({
        fragment: props.yjsFragment,
      })
    );

    extensions.push(
      CollaborationCursor.configure({
        provider: props.wsProvider,
        user: props.currentUser || { name: 'Anonymous', color: '#888888' },
      })
    );
  }

  return extensions;
};

// Initialize editor
const editor = useEditor({
  extensions: getExtensions(),
  content: props.modelValue,
  editable: !props.disabled,
  editorProps: {
    attributes: {
      class:
        'tiptap-editor prose prose-sm dark:prose-invert max-w-none focus:outline-none',
      'data-placeholder': placeholderText.value,
    },
  },
  onUpdate: ({ editor }) => {
    if (isExternalUpdate.value) return;

    // Get markdown content using v3 API
    const markdown = (editor as any).getMarkdown?.() ?? editor.getHTML();
    emit('update:modelValue', markdown);
    emit('change', markdown);
  },
  onFocus: () => {
    emit('focus');
  },
  onBlur: () => {
    emit('blur');
  },
});

// Update content when modelValue changes externally
watch(
  () => props.modelValue,
  (newValue) => {
    if (!editor.value) return;

    // Get current markdown content using v3 API
    const currentMarkdown = (editor.value as any).getMarkdown?.() ?? '';

    if (currentMarkdown !== newValue) {
      isExternalUpdate.value = true;
      editor.value.commands.setContent(newValue || '', {
        emitUpdate: false,
      });
      nextTick(() => {
        isExternalUpdate.value = false;
      });
    }
  }
);

// Update editable state
watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled);
  }
);

// Cleanup
onUnmounted(() => {
  editor.value?.destroy();
});

// Toolbar action methods matching MarkdownEditor interface
const executeBold = () => {
  editor.value?.chain().focus().toggleBold().run();
};

const executeItalic = () => {
  editor.value?.chain().focus().toggleItalic().run();
};

const executeCode = () => {
  editor.value?.chain().focus().toggleCode().run();
};

const executeHeading = (level: 1 | 2 | 3) => {
  editor.value?.chain().focus().toggleHeading({ level }).run();
};

const executeBulletList = () => {
  editor.value?.chain().focus().toggleBulletList().run();
};

const executeNumberedList = () => {
  editor.value?.chain().focus().toggleOrderedList().run();
};

const executeBlockquote = () => {
  editor.value?.chain().focus().toggleBlockquote().run();
};

const executeHorizontalRule = () => {
  editor.value?.chain().focus().setHorizontalRule().run();
};

const executeLink = () => {
  const url = window.prompt('Enter URL:');
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run();
  }
};

const executeImage = () => {
  const url = window.prompt('Enter image URL:');
  if (url) {
    editor.value?.chain().focus().setImage({ src: url }).run();
  }
};

// Expose methods matching MarkdownEditor interface
defineExpose({
  focus: () => editor.value?.commands.focus(),
  blur: () => editor.value?.commands.blur(),
  getValue: () =>
    (editor.value as any)?.getMarkdown?.() ?? editor.value?.getHTML() ?? '',
  setValue: (value: string) => {
    if (editor.value) {
      editor.value.commands.setContent(value || '');
    }
  },
  getEditor: () => editor.value,
  // Toolbar actions
  executeBold,
  executeItalic,
  executeCode,
  executeHeading,
  executeBulletList,
  executeNumberedList,
  executeBlockquote,
  executeHorizontalRule,
  executeLink,
  executeImage,
});
</script>

<template>
  <div
    class="tiptap-editor-container w-full h-full overflow-auto"
    :class="{ dark: theme === 'dark' }"
  >
    <EditorContent :editor="editor" class="h-full" />
  </div>
</template>

<style scoped>
.tiptap-editor-container {
  overflow: hidden;
}

.tiptap-editor-container :deep(.tiptap-editor) {
  height: 100%;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  line-height: 1.625;
}

.tiptap-editor-container :deep(.tiptap-editor:focus) {
  outline: none;
}

.tiptap-editor-container :deep(.ProseMirror) {
  min-height: 100%;
  height: 100%;
}

.tiptap-editor-container :deep(.ProseMirror-focused) {
  outline: none;
}

/* Placeholder styling */
.tiptap-editor-container :deep(.tiptap-editor.is-empty::before) {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
  pointer-events: none;
  height: 0;
}

/* Prose styling adjustments */
.tiptap-editor-container :deep(.prose h1) {
  font-size: 1.5rem;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.tiptap-editor-container :deep(.prose h2) {
  font-size: 1.25rem;
  margin-top: 0.875rem;
  margin-bottom: 0.5rem;
}

.tiptap-editor-container :deep(.prose h3) {
  font-size: 1.125rem;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}

.tiptap-editor-container :deep(.prose p) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.tiptap-editor-container :deep(.prose ul),
.tiptap-editor-container :deep(.prose ol) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  padding-left: 1.5rem;
}

.tiptap-editor-container :deep(.prose li) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.tiptap-editor-container :deep(.prose blockquote) {
  border-left: 3px solid #e5e7eb;
  padding-left: 1rem;
  margin: 0.5rem 0;
  font-style: italic;
}

.dark .tiptap-editor-container :deep(.prose blockquote) {
  border-left-color: #4b5563;
}

.tiptap-editor-container :deep(.prose code) {
  background-color: #f3f4f6;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
}

.dark .tiptap-editor-container :deep(.prose code) {
  background-color: #374151;
}

.tiptap-editor-container :deep(.prose pre) {
  background-color: #1f2937;
  color: #f9fafb;
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  overflow-x: auto;
}

.tiptap-editor-container :deep(.prose hr) {
  border-color: #e5e7eb;
  margin: 1rem 0;
}

.dark .tiptap-editor-container :deep(.prose hr) {
  border-color: #4b5563;
}

.tiptap-editor-container :deep(.prose a) {
  color: #3b82f6;
  text-decoration: underline;
}

.tiptap-editor-container :deep(.prose a:hover) {
  color: #2563eb;
}

.tiptap-editor-container :deep(.prose img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.375rem;
}

/* Collaboration cursor styles */
.tiptap-editor-container :deep(.collaboration-cursor__caret) {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 2px solid;
  border-right: none;
  word-break: normal;
  pointer-events: none;
}

.tiptap-editor-container :deep(.collaboration-cursor__label) {
  position: absolute;
  left: -1px;
  top: -1.4em;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem 0.25rem 0.25rem 0;
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  color: white;
}
</style>
