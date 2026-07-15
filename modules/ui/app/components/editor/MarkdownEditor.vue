<script setup lang="ts">
import { computed, ref } from 'vue';
import CodeMirrorEditor from './CodeMirrorEditor.vue';
import CollaborativeMarkdownEditor from './CollaborativeMarkdownEditor.vue';
import { isLosslesslyRoundTrippable } from '~/utils/content-loss-guard';

/**
 * Editor host consumed by RecordForm. Chooses the editing surface:
 *
 *   - the single-user CodeMirror editor (default + safe fallback — edits the
 *     raw Markdown text and never drops content), or
 *   - the TipTap+Yjs collaborative editor.
 *
 * The collaborative editor is selected ONLY when collaborativeMode is
 * requested, a recordId is available, AND the record's Markdown round-trips
 * losslessly through @civicpress/editor-schema (the schema the realtime server
 * uses to write the Yjs document back to the canonical Markdown file). If
 * collab was requested for a real record but the content carries constructs the
 * schema can't preserve (raw HTML, footnotes, …), a visible non-blocking notice
 * explains the downgrade and editing continues in single-user mode. This is the
 * content-loss guard: a collaborator's edits must never silently rewrite the
 * archive file.
 */
interface Props {
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  theme?: 'light' | 'dark';
  minHeight?: string;
  maxHeight?: string;
  /** Opt-in to the TipTap+Yjs collaborative editor (subject to the guard). */
  collaborativeMode?: boolean;
  /** Record id — required to open a realtime room for the collaborative path. */
  recordId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
  theme: 'light',
  minHeight: '400px',
  maxHeight: '70vh',
  collaborativeMode: false,
  recordId: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  focus: [];
  blur: [];
}>();

const { t } = useI18n();

/** Collab requested for a real record (recordId present). */
const collabRequested = computed(
  () => props.collaborativeMode && props.recordId.length > 0
);

/** Whether the current content can be edited collaboratively without loss. */
const contentRoundTrips = computed(() =>
  isLosslesslyRoundTrippable(props.modelValue)
);

/**
 * Use the collaborative editor only when requested AND content round-trips.
 *
 * SSR safety: the collaborative editor opens a WebSocket and builds a
 * ProseMirror EditorView (client-only). It never enters setup on the server
 * because `collabRequested` needs a non-empty recordId, and the host
 * (RecordForm) only populates the record id in onMounted (client-side) — so
 * during SSR `collabRequested` is false and the CodeMirror surface renders.
 */
const useCollaborative = computed(
  () => collabRequested.value && contentRoundTrips.value
);

/**
 * Show the downgrade notice only when collab was genuinely requested for a real
 * record but the content blocks it — not when collab is simply off or no
 * recordId was supplied (those are not user-visible downgrades).
 */
const showFallbackNotice = computed(
  () => collabRequested.value && !contentRoundTrips.value
);

// Forward exposed methods to whichever surface is active so RecordForm's
// editorRef (toolbar actions via useRecordEditorActions, focus/getValue, …)
// works regardless of mode. The collaborative editor implements the same
// command surface; methods it does not provide degrade to no-ops.
const codeMirrorRef = ref<InstanceType<typeof CodeMirrorEditor> | null>(null);
const collaborativeRef = ref<InstanceType<
  typeof CollaborativeMarkdownEditor
> | null>(null);

const active = () =>
  (useCollaborative.value ? collaborativeRef.value : codeMirrorRef.value) as
    | Record<string, unknown>
    | null;

const callActive = (method: string, ...args: unknown[]): unknown => {
  const target = active();
  const fn = target?.[method];
  if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown)(...args);
  return undefined;
};

const onUpdate = (value: string) => emit('update:modelValue', value);
const onChange = (value: string) => emit('change', value);
const onFocus = () => emit('focus');
const onBlur = () => emit('blur');

defineExpose({
  focus: () => callActive('focus'),
  blur: () => callActive('blur'),
  getValue: () => (callActive('getValue') as string) ?? props.modelValue,
  setValue: (value: string) => callActive('setValue', value),
  getEditor: () => callActive('getEditor'),
  executeBold: () => callActive('executeBold'),
  executeItalic: () => callActive('executeItalic'),
  executeCode: () => callActive('executeCode'),
  executeHeading: (level: 1 | 2 | 3) => callActive('executeHeading', level),
  executeBulletList: () => callActive('executeBulletList'),
  executeNumberedList: () => callActive('executeNumberedList'),
  executeBlockquote: () => callActive('executeBlockquote'),
  executeHorizontalRule: () => callActive('executeHorizontalRule'),
  executeLink: () => callActive('executeLink'),
  executeImage: () => callActive('executeImage'),
});
</script>

<template>
  <div class="markdown-editor-host w-full h-full flex flex-col">
    <UAlert
      v-if="showFallbackNotice"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="t('records.collaborativeUnavailableTitle')"
      :description="t('records.collaborativeUnavailable')"
      class="mb-2"
    />

    <CollaborativeMarkdownEditor
      v-if="useCollaborative"
      ref="collaborativeRef"
      :record-id="recordId"
      :model-value="modelValue"
      :disabled="disabled"
      :theme="theme"
      :placeholder="placeholder"
      class="flex-1 min-h-0"
      @update:model-value="onUpdate"
      @change="onChange"
      @focus="onFocus"
      @blur="onBlur"
    />
    <CodeMirrorEditor
      v-else
      ref="codeMirrorRef"
      :model-value="modelValue"
      :disabled="disabled"
      :theme="theme"
      :placeholder="placeholder"
      :min-height="minHeight"
      :max-height="maxHeight"
      class="flex-1 min-h-0"
      @update:model-value="onUpdate"
      @change="onChange"
      @focus="onFocus"
      @blur="onBlur"
    />
  </div>
</template>

<style scoped>
.markdown-editor-host {
  overflow: hidden;
}
</style>
