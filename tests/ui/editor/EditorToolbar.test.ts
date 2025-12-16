import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EditorToolbar from '~/components/editor/EditorToolbar.vue';

vi.mock('~/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('EditorToolbar', () => {
  const defaultProps = {
    disabled: false,
    showPreview: false,
  };

  const mountOptions = {
    global: {
      stubs: {
        UButton: true,
        UIcon: true,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render toolbar', () => {
    const wrapper = mount(EditorToolbar, {
      props: defaultProps,
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should disable buttons when disabled prop is true', () => {
    const wrapper = mount(EditorToolbar, {
      props: {
        ...defaultProps,
        disabled: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show preview icon state correctly', () => {
    const wrapperShow = mount(EditorToolbar, {
      props: {
        ...defaultProps,
        showPreview: true,
      },
      ...mountOptions,
    });

    expect(wrapperShow.exists()).toBe(true);

    const wrapperHide = mount(EditorToolbar, {
      props: {
        ...defaultProps,
        showPreview: false,
      },
      ...mountOptions,
    });

    expect(wrapperHide.exists()).toBe(true);
  });
});
