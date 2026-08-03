import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EditorToolbar from '~/components/editor/EditorToolbar.vue';

/**
 * The toolbar is stateless: each button click emits a typed event the host
 * (RecordForm → useRecordEditorActions) forwards to the active editor. These
 * tests drive the real click → emit path (the previous suite only asserted the
 * component rendered). We stub UButton with a real <button> that forwards its
 * native click as the component `click` event; `emits: ['click']` prevents the
 * native+component double-fire.
 */
const UButtonStub = {
  props: ['icon', 'disabled'],
  emits: ['click'],
  template:
    '<button :data-icon="icon" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const mountToolbar = (props: Record<string, unknown> = {}) =>
  mount(EditorToolbar, {
    props: { disabled: false, showPreview: false, ...props },
    global: { stubs: { UButton: UButtonStub, UIcon: true } },
  });

const clickIcon = async (
  wrapper: ReturnType<typeof mountToolbar>,
  icon: string
) => {
  const btn = wrapper.find(`button[data-icon="${icon}"]`);
  expect(btn.exists()).toBe(true);
  await btn.trigger('click');
};

describe('EditorToolbar', () => {
  it('renders in both preview states', () => {
    expect(mountToolbar({ showPreview: true }).exists()).toBe(true);
    expect(mountToolbar({ showPreview: false }).exists()).toBe(true);
  });

  it('emits the matching event for each formatting button', async () => {
    const wrapper = mountToolbar();
    await clickIcon(wrapper, 'i-lucide-bold');
    await clickIcon(wrapper, 'i-lucide-italic');
    await clickIcon(wrapper, 'i-lucide-code');
    await clickIcon(wrapper, 'i-lucide-list');
    await clickIcon(wrapper, 'i-lucide-list-ordered');
    await clickIcon(wrapper, 'i-lucide-quote');
    await clickIcon(wrapper, 'i-lucide-minus');
    await clickIcon(wrapper, 'i-lucide-link');
    await clickIcon(wrapper, 'i-lucide-image');

    const e = wrapper.emitted();
    expect(e.bold).toBeTruthy();
    expect(e.italic).toBeTruthy();
    expect(e.code).toBeTruthy();
    expect(e.bulletList).toBeTruthy();
    expect(e.numberedList).toBeTruthy();
    expect(e.blockquote).toBeTruthy();
    expect(e.horizontalRule).toBeTruthy();
    expect(e.link).toBeTruthy();
    expect(e.image).toBeTruthy();
  });

  it('emits heading with the requested level', async () => {
    const wrapper = mountToolbar();
    await clickIcon(wrapper, 'i-lucide-heading-1');
    await clickIcon(wrapper, 'i-lucide-heading-2');
    await clickIcon(wrapper, 'i-lucide-heading-3');
    expect(wrapper.emitted('heading')).toEqual([[1], [2], [3]]);
  });

  it('emits undo and redo from the new history buttons', async () => {
    const wrapper = mountToolbar();
    await clickIcon(wrapper, 'i-lucide-undo-2');
    await clickIcon(wrapper, 'i-lucide-redo-2');
    expect(wrapper.emitted('undo')).toBeTruthy();
    expect(wrapper.emitted('redo')).toBeTruthy();
  });

  it('emits toggle-preview from the preview button', async () => {
    const wrapper = mountToolbar();
    await clickIcon(wrapper, 'i-lucide-eye');
    expect(wrapper.emitted('toggle-preview')).toBeTruthy();
  });

  it('no longer renders the underline decoy (Markdown has no underline)', () => {
    const wrapper = mountToolbar();
    expect(
      wrapper.find('button[data-icon="i-lucide-underline"]').exists()
    ).toBe(false);
    expect(wrapper.emitted('underline')).toBeFalsy();
  });

  it('does not emit when disabled', async () => {
    const wrapper = mountToolbar({ disabled: true });
    await wrapper.find('button[data-icon="i-lucide-bold"]').trigger('click');
    await wrapper.find('button[data-icon="i-lucide-undo-2"]').trigger('click');
    expect(wrapper.emitted('bold')).toBeFalsy();
    expect(wrapper.emitted('undo')).toBeFalsy();
  });
});
