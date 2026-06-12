import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MarkdownEditor from '~/components/editor/MarkdownEditor.vue';

/**
 * MarkdownEditor is the editor host consumed by RecordForm. It chooses between
 * two editing surfaces:
 *
 *   - the single-user CodeMirror editor (default, and the safe fallback), and
 *   - the TipTap+Yjs collaborative editor.
 *
 * The collaborative editor is used ONLY when collaborativeMode is requested,
 * a recordId is available, AND the record's Markdown round-trips losslessly
 * through @civicpress/editor-schema. Otherwise CodeMirror is used; when collab
 * was requested but the content is not round-trippable, a visible non-blocking
 * notice explains the downgrade. These tests pin that switching behaviour; the
 * collaborative child is stubbed so the test isolates the switch decision.
 */

// Stub the heavy children so the switch logic is tested in isolation. Each stub
// renders a marker element we can assert on.
const CodeMirrorStub = {
  name: 'CodeMirrorEditor',
  props: ['modelValue', 'disabled', 'placeholder', 'theme'],
  template: '<div data-test="codemirror" />',
};
const CollaborativeStub = {
  name: 'CollaborativeMarkdownEditor',
  props: ['recordId', 'modelValue', 'disabled'],
  template: '<div data-test="collaborative" />',
};

function mountEditor(props: Record<string, unknown>) {
  return mount(MarkdownEditor, {
    props,
    global: {
      stubs: {
        CodeMirrorEditor: CodeMirrorStub,
        CollaborativeMarkdownEditor: CollaborativeStub,
      },
    },
  });
}

const ROUND_TRIPPABLE = '## Budget 2026\n\nThe annual budget.';
const NON_ROUND_TRIPPABLE = 'Intro.\n\n<div class="callout">Note</div>\n\nEnd.';

describe('MarkdownEditor — editor surface switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the CodeMirror editor when collaborativeMode is off', async () => {
    const wrapper = mountEditor({
      modelValue: ROUND_TRIPPABLE,
      collaborativeMode: false,
      recordId: 'rec-1',
    });
    await nextTick();
    expect(wrapper.find('[data-test="codemirror"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="collaborative"]').exists()).toBe(false);
  });

  it('renders the collaborative editor when collab is on AND content round-trips', async () => {
    const wrapper = mountEditor({
      modelValue: ROUND_TRIPPABLE,
      collaborativeMode: true,
      recordId: 'rec-1',
    });
    await nextTick();
    expect(wrapper.find('[data-test="collaborative"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="codemirror"]').exists()).toBe(false);
  });

  it('falls back to CodeMirror + a notice when collab is on but content does NOT round-trip', async () => {
    const wrapper = mountEditor({
      modelValue: NON_ROUND_TRIPPABLE,
      collaborativeMode: true,
      recordId: 'rec-1',
    });
    await nextTick();
    expect(wrapper.find('[data-test="codemirror"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="collaborative"]').exists()).toBe(false);
    // A visible, non-blocking notice is shown (text mentions collaborative
    // editing being unavailable). The notice text comes through i18n; the test
    // i18n stub returns the key, so assert on the key marker.
    expect(wrapper.html()).toContain('collaborativeUnavailable');
  });

  it('falls back to CodeMirror (no collab) when collab is on but no recordId is given', async () => {
    const wrapper = mountEditor({
      modelValue: ROUND_TRIPPABLE,
      collaborativeMode: true,
      recordId: '',
    });
    await nextTick();
    expect(wrapper.find('[data-test="codemirror"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="collaborative"]').exists()).toBe(false);
  });

  it('passes recordId and modelValue through to the collaborative editor', async () => {
    const wrapper = mountEditor({
      modelValue: ROUND_TRIPPABLE,
      collaborativeMode: true,
      recordId: 'rec-42',
    });
    await nextTick();
    const collab = wrapper.findComponent(CollaborativeStub);
    expect(collab.exists()).toBe(true);
    expect(collab.props('recordId')).toBe('rec-42');
    expect(collab.props('modelValue')).toBe(ROUND_TRIPPABLE);
  });
});
