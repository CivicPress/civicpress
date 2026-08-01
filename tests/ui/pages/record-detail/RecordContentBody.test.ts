import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RecordContentBody from '~/pages/records/[type]/[id]/_components/RecordContentBody.vue';

describe('RecordContentBody', () => {
  it('renders the pre-rendered HTML content and exposes the container ref', () => {
    const wrapper = mount(RecordContentBody, {
      props: {
        content: '# Heading',
        renderedContent: '<p><strong>Bold</strong> body</p>',
      },
    });

    expect(wrapper.html()).toContain('<strong>Bold</strong>');
    // markdownContainer is defineExpose'd and bound to the rendered div
    expect((wrapper.vm as any).markdownContainer).toBeTruthy();
  });

  it('shows the empty-content message when there is no content', () => {
    const wrapper = mount(RecordContentBody, {
      props: { content: '', renderedContent: '' },
    });

    expect(wrapper.find('.markdown-content').exists()).toBe(false);
    expect(wrapper.text()).toContain('records.noContentAvailable');
  });

  it('emits contentClick when the rendered content is clicked', async () => {
    const wrapper = mount(RecordContentBody, {
      props: { content: 'x', renderedContent: '<p>x</p>' },
    });

    await wrapper.find('.markdown-content').trigger('click');
    expect(wrapper.emitted('contentClick')).toHaveLength(1);
  });
});
