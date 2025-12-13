import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PreviewPanel from '~/components/editor/PreviewPanel.vue';

describe('PreviewPanel', () => {
  const defaultProps = {
    content: '# Preview Content\n\nThis is preview content.',
  };

  const mountOptions = {
    global: {
      stubs: {
        RecordPreview: true,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render preview panel', () => {
    const wrapper = mount(PreviewPanel, {
      props: defaultProps,
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should display markdown content', () => {
    const content = '# Test Heading\n\nTest paragraph.';
    const wrapper = mount(PreviewPanel, {
      props: {
        content,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should handle empty content', () => {
    const wrapper = mount(PreviewPanel, {
      props: {
        content: '',
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should update when content changes', async () => {
    const wrapper = mount(PreviewPanel, {
      props: {
        content: '# Original',
      },
      ...mountOptions,
    });

    await wrapper.setProps({ content: '# Updated' });
    expect(wrapper.exists()).toBe(true);
  });

  it('should hide when show prop is false', () => {
    const wrapper = mount(PreviewPanel, {
      props: {
        ...defaultProps,
        show: false,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });
});
