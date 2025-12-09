<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import {
  foldGutter,
  indentOnInput,
  bracketMatching,
  foldKeymap,
} from '@codemirror/language';

interface Props {
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  theme?: 'light' | 'dark';
  minHeight?: string;
  maxHeight?: string;
}

const { t } = useI18n();

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
  theme: 'light',
  minHeight: '400px',
  maxHeight: '70vh',
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

const editorContainer = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const themeCompartment = new Compartment();
const disabledCompartment = new Compartment();

// Create editor state
const createEditorState = (content: string) => {
  return EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
      ]),
      markdown(),
      themeCompartment.of(props.theme === 'dark' ? oneDark : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          emit('update:modelValue', newValue);
          emit('change', newValue);
        }
      }),
      EditorView.contentAttributes.of({
        'data-placeholder': placeholderText.value,
      }),
      EditorView.theme({
        '&': {
          height: '100%',
        },
        '.cm-content': {
          padding: '0.5rem 0',
          fontSize: '0.875rem', // Match prose-sm (14px) to align with preview
        },
        '.cm-line': {
          fontSize: '0.875rem', // Ensure all lines use the same font size
        },
        '.cm-scroller': {
          overflow: 'auto',
          height: '100%',
        },
        '.cm-editor': {
          height: '100%',
        },
        '.cm-focused': {
          outline: 'none',
        },
      }),
      disabledCompartment.of(EditorState.readOnly.of(props.disabled)),
    ],
  });
};

// Initialize editor
onMounted(async () => {
  await nextTick();
  if (!editorContainer.value) return;

  const state = createEditorState(props.modelValue);
  view = new EditorView({
    state,
    parent: editorContainer.value,
  });
});

// Update content when modelValue changes externally
watch(
  () => props.modelValue,
  (newValue) => {
    if (view && view.state.doc.toString() !== newValue) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: newValue,
        },
      });
    }
  }
);

// Update theme
watch(
  () => props.theme,
  (newTheme) => {
    if (view) {
      view.dispatch({
        effects: themeCompartment.reconfigure(
          newTheme === 'dark' ? oneDark : []
        ),
      });
    }
  }
);

// Update disabled state
watch(
  () => props.disabled,
  (disabled) => {
    if (view) {
      view.dispatch({
        effects: disabledCompartment.reconfigure(
          EditorState.readOnly.of(disabled)
        ),
      });
    }
  }
);

// Cleanup
onUnmounted(() => {
  if (view) {
    view.destroy();
    view = null;
  }
});

// Toolbar action methods
const executeBold = () => {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = selected ? `**${selected}**` : '****';
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: selected ? to + 4 : from + 2 },
  });
};

const executeItalic = () => {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = selected ? `*${selected}*` : '**';
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: selected ? to + 2 : from + 1 },
  });
};

const executeCode = () => {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = selected ? `\`${selected}\`` : '``';
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: selected ? to + 2 : from + 1 },
  });
};

const executeHeading = (level: 1 | 2 | 3) => {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineStart = line.from;
  const lineText = line.text;

  // Remove existing heading markers
  const cleanedText = lineText.replace(/^#+\s*/, '');
  const headingPrefix = '#'.repeat(level) + ' ';

  view.dispatch({
    changes: {
      from: lineStart,
      to: line.to,
      insert: headingPrefix + cleanedText,
    },
    selection: {
      anchor: lineStart + headingPrefix.length + cleanedText.length,
    },
  });
};

const executeBulletList = () => {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineStart = line.from;
  const lineText = line.text;

  // Toggle bullet list
  if (lineText.startsWith('- ')) {
    view.dispatch({
      changes: { from: lineStart, to: lineStart + 2, insert: '' },
    });
  } else {
    view.dispatch({
      changes: { from: lineStart, insert: '- ' },
    });
  }
};

const executeNumberedList = () => {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineStart = line.from;
  const lineText = line.text;

  // Toggle numbered list
  if (/^\d+\.\s/.test(lineText)) {
    const match = lineText.match(/^(\d+\.\s)/);
    if (match && match[1]) {
      view.dispatch({
        changes: {
          from: lineStart,
          to: lineStart + match[1].length,
          insert: '',
        },
      });
    }
  } else {
    view.dispatch({
      changes: { from: lineStart, insert: '1. ' },
    });
  }
};

const executeBlockquote = () => {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineStart = line.from;
  const lineText = line.text;

  // Toggle blockquote
  if (lineText.startsWith('> ')) {
    view.dispatch({
      changes: { from: lineStart, to: lineStart + 2, insert: '' },
    });
  } else {
    view.dispatch({
      changes: { from: lineStart, insert: '> ' },
    });
  }
};

const executeHorizontalRule = () => {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const insertText = '\n---\n';
  view.dispatch({
    changes: { from: line.to, insert: insertText },
    selection: { anchor: line.to + insertText.length },
  });
};

const executeLink = () => {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = selected ? `[${selected}](url)` : '[text](url)';
  const newAnchor = selected ? to + 3 : from + 1;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: newAnchor },
  });
};

const executeImage = () => {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = `![${selected || 'alt text'}](url)`;
  const newAnchor = selected ? from + replacement.length - 5 : from + 2; // Position cursor at 'url' or after 'alt text'
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: newAnchor },
  });
};

// Expose methods
defineExpose({
  focus: () => view?.focus(),
  blur: () => view?.contentDOM.blur(),
  getValue: () => view?.state.doc.toString() || '',
  setValue: (value: string) => {
    if (view) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value,
        },
      });
    }
  },
  getEditor: () => view,
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
  <div ref="editorContainer" class="markdown-editor w-full h-full" />
</template>

<style scoped>
.markdown-editor {
  overflow: hidden;
}
</style>
