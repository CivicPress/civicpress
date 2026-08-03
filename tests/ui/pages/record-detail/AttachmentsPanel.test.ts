import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// MediaPlayer is explicitly imported and heavy; stub it. The media-preview
// helpers (isPlayableMedia / inferMediaMime) are pure and used for real.
vi.mock('@/components/storage/MediaPlayer.vue', () => ({
  default: {
    name: 'MediaPlayer',
    props: ['file'],
    template: '<div class="media-player" />',
  },
}));

import AttachmentsPanel from '~/pages/records/[type]/[id]/_components/AttachmentsPanel.vue';

const stubs = {
  UIcon: true,
  UButton: {
    // declare the click emit so `@click` binds only as a component event (no
    // native-listener fallthrough, which would fire download twice)
    emits: ['click'],
    template: '<button class="dl" @click="$emit(\'click\')"><slot /></button>',
  },
};

const file = (overrides: Record<string, unknown> = {}) => ({
  id: 'file-1',
  path: 'attachments/report.pdf',
  original_name: 'report.pdf',
  ...overrides,
});

const mountPanel = (props: Record<string, unknown>) =>
  mount(AttachmentsPanel, { props, global: { stubs } });

describe('AttachmentsPanel', () => {
  it('renders attached files and emits download with id + name', async () => {
    const wrapper = mountPanel({ attachedFiles: [file()] });
    expect(wrapper.text()).toContain('report.pdf');
    expect(wrapper.text()).toContain('attachments/report.pdf');

    await wrapper.find('.dl').trigger('click');
    expect(wrapper.emitted('download')).toEqual([['file-1', 'report.pdf']]);
  });

  it('renders an inline MediaPlayer for a playable A/V attachment', () => {
    const wrapper = mountPanel({
      attachedFiles: [file({ id: 'cap', original_name: 'meeting.mp4' })],
    });
    const player = wrapper.findComponent({ name: 'MediaPlayer' });
    expect(player.exists()).toBe(true);
    expect(player.props('file').mime_type).toBe('video/mp4');
  });

  it('does not render a MediaPlayer for a non-playable attachment', () => {
    const wrapper = mountPanel({ attachedFiles: [file()] }); // .pdf
    expect(wrapper.findComponent({ name: 'MediaPlayer' }).exists()).toBe(false);
  });

  it('renders an object category by its label and a string category verbatim', () => {
    const obj = mountPanel({
      attachedFiles: [file({ category: { label: 'Minutes' } })],
    });
    expect(obj.text()).toContain('Minutes');

    const str = mountPanel({ attachedFiles: [file({ category: 'Report' })] });
    expect(str.text()).toContain('Report');
  });

  it('shows the recording-processing banner when a capture awaits its public variant', () => {
    const wrapper = mountPanel({
      attachedFiles: [],
      capture: { av_file: 'raw.mkv', redaction_status: 'pending' },
    });
    expect(wrapper.text()).toContain(
      'records.attachments.recordingProcessingTitle'
    );
  });

  it('shows no processing banner once the public variant exists', () => {
    const wrapper = mountPanel({
      attachedFiles: [file()],
      capture: {
        av_file: 'raw.mkv',
        public_file: 'public.mp4',
        redaction_status: 'pending',
      },
    });
    expect(wrapper.text()).not.toContain(
      'records.attachments.recordingProcessingTitle'
    );
  });

  it('shows the empty state when there are no files and nothing is processing', () => {
    const wrapper = mountPanel({ attachedFiles: [] });
    expect(wrapper.text()).toContain(
      'records.attachments.noFilesAttachedTitle'
    );
  });
});
