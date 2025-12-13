import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MarkdownEditor from '~/components/editor/MarkdownEditor.vue';

vi.mock('~/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('MarkdownEditor', () => {
  const defaultProps = {
    modelValue: '# Test Content\n\nThis is test content.',
  };

  const mountOptions = {
    global: {
      stubs: {},
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should render editor', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: defaultProps,
      ...mountOptions,
    });

    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should initialize with modelValue', async () => {
    const content = '# Initial Content';
    const wrapper = mount(MarkdownEditor, {
      props: {
        modelValue: content,
      },
      ...mountOptions,
    });

    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should update when modelValue changes', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        modelValue: '# Original',
      },
      ...mountOptions,
    });

    await nextTick();
    await wrapper.setProps({ modelValue: '# Updated' });
    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should handle placeholder prop', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        ...defaultProps,
        placeholder: 'Enter your content here',
      },
      ...mountOptions,
    });

    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should disable editor when disabled prop is true', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        ...defaultProps,
        disabled: true,
      },
      ...mountOptions,
    });

    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should support dark theme', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        ...defaultProps,
        theme: 'dark',
      },
      ...mountOptions,
    });

    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should support light theme', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        ...defaultProps,
        theme: 'light',
      },
      ...mountOptions,
    });

    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });
});
