<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { Editor, EditorContent } from '@tiptap/vue-3';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { serializeDocToMarkdown } from '@civicpress/editor-schema';
import { buildTiptapExtensionsFromSchema } from '~/utils/tiptap-from-schema';
import { useRealtimeEditor } from '~/composables/useRealtimeEditor';

/**
 * TipTap + Yjs collaborative Markdown editor.
 *
 * The shared Y.Doc / WebsocketProvider come from `useRealtimeEditor`; TipTap's
 * Collaboration extension binds to the Y.Doc's `default` XmlFragment (its
 * default `field`) — the same fragment the realtime server seeds from the
 * record's Markdown and serializes back to the canonical file. The document is
 * therefore owned by Yjs: we deliberately pass NO `content` to the editor (the
 * server's seed / the CRDT sync populate it), and never call setContent.
 *
 * The editor's schema is derived from @civicpress/editor-schema
 * (buildTiptapExtensionsFromSchema) so node/mark/attr names match what the
 * server uses to serialize the fragment back to Markdown — including GFM tables
 * and the civicRef inline atom.
 *
 * `update:modelValue` carries the doc serialized to Markdown (debounced). In
 * collaborative mode the realtime server owns periodic writeback; this emit
 * keeps the parent form's `markdownBody` roughly current so the on-blur /
 * explicit autosave backstop (useAutosave collaborativeMode) has fresh content.
 */
interface Props {
  recordId: string;
  modelValue: string;
  disabled?: boolean;
  theme?: 'light' | 'dark';
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  theme: 'light',
  placeholder: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  focus: [];
  blur: [];
}>();

const authStore = useAuthStore();
const runtimeConfig = useRuntimeConfig();

const realtime = useRealtimeEditor({
  recordId: props.recordId,
  token: authStore.token ?? '',
  wsUrl: String(runtimeConfig.public.realtimeWsUrl ?? ''),
});

// Local participant identity for the collaboration caret. The realtime server
// has no participant-color concept (realtime-007); color is assigned client-
// side and deterministically per user id (useRealtimeEditor.pickUserColor).
const currentUser = authStore.user;
const userId = currentUser?.id != null ? String(currentUser.id) : 'anon';
const userName = currentUser?.name || currentUser?.username || 'Anonymous';

// Emit the serialized Markdown, debounced — keystroke-rate ProseMirror→Markdown
// serialization would be wasteful, and the server (not this emit) owns the
// canonical writeback.
const emitSerialized = useDebounceFn(() => {
  if (!editor) return;
  const markdown = serializeDocToMarkdown(editor.state.doc);
  emit('update:modelValue', markdown);
  emit('change', markdown);
}, 400);

const editor = new Editor({
  editable: !props.disabled,
  extensions: [
    ...buildTiptapExtensionsFromSchema(),
    Collaboration.configure({ document: realtime.yDoc }),
    CollaborationCaret.configure({
      provider: realtime.provider,
      user: { name: userName, color: realtime.pickUserColor(userId) },
    }),
  ],
  editorProps: {
    attributes: {
      class: 'civic-collab-editor prose prose-sm max-w-none focus:outline-none',
      'data-placeholder': props.placeholder,
    },
  },
  onUpdate: () => emitSerialized(),
  onFocus: () => emit('focus'),
  onBlur: () => emit('blur'),
});

watch(
  () => props.disabled,
  (disabled) => editor.setEditable(!disabled)
);

onBeforeUnmount(() => {
  editor.destroy();
  // useRealtimeEditor registers its own onUnmounted to destroy provider + doc.
});

// Expose a command surface compatible with the CodeMirror editor so the host's
// editorRef forwarding works. Toolbar formatting commands are intentionally
// minimal in the collaborative path for this iteration (see W5-T9 notes); they
// no-op rather than mutate, leaving rich-toolbar wiring as deferred polish.
const focus = () => editor.commands.focus();
const noop = () => {};

defineExpose({
  focus,
  blur: () => editor.commands.blur(),
  getValue: () => serializeDocToMarkdown(editor.state.doc),
  getEditor: () => editor,
  executeBold: () => editor.chain().focus().toggleMark('strong').run(),
  executeItalic: () => editor.chain().focus().toggleMark('em').run(),
  executeCode: () => editor.chain().focus().toggleMark('code').run(),
  executeHeading: noop,
  executeBulletList: noop,
  executeNumberedList: noop,
  executeBlockquote: noop,
  executeHorizontalRule: noop,
  executeLink: noop,
  executeImage: noop,
});
</script>

<template>
  <div class="collaborative-markdown-editor w-full h-full overflow-auto">
    <ClientOnly>
      <EditorContent :editor="editor" class="h-full" />
    </ClientOnly>
    <div
      v-if="realtime.connectionError.value"
      class="px-3 py-1 text-xs text-amber-700 dark:text-amber-400"
      role="status"
    >
      {{ realtime.connectionError.value }}
    </div>
  </div>
</template>

<style scoped>
.collaborative-markdown-editor :deep(.civic-collab-editor) {
  min-height: 100%;
  padding: 0.5rem 0;
  font-size: 0.875rem;
}
.collaborative-markdown-editor :deep(.ProseMirror) {
  outline: none;
}
/* Collaboration caret (remote cursors) */
.collaborative-markdown-editor :deep(.collaboration-carets__caret) {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 1px solid;
  border-right: 1px solid;
  word-break: normal;
  pointer-events: none;
}
.collaborative-markdown-editor :deep(.collaboration-carets__label) {
  position: absolute;
  top: -1.4em;
  left: -1px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: normal;
  color: #fff;
  white-space: nowrap;
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
  pointer-events: none;
  user-select: none;
}
</style>
