import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// The accordion is a slot-switching container over four imported sub-panels +
// GeographyLinkDisplay; stub each so we can assert which one renders per item
// value and that download / statusChanged bubble up. StatusTransitionControls is
// auto-imported (no import statement) so it's a global stub, not a vi.mock.
// vi.mock factories are hoisted above module-scope consts, so the shared stub
// helper must live in vi.hoisted to be initialized when the mocks run.
const { panelStub } = vi.hoisted(() => ({
  panelStub: (name: string, props: string[] = [], emits: string[] = []) => ({
    default: { name, props, emits, template: `<div class="${name}" />` },
  }),
}));
vi.mock('~/pages/records/[type]/[id]/_components/LinkedRecordsPanel.vue', () =>
  panelStub('LinkedRecordsPanel', ['linkedRecords'])
);
vi.mock('~/pages/records/[type]/[id]/_components/AttachmentsPanel.vue', () =>
  panelStub('AttachmentsPanel', ['attachedFiles', 'capture'], ['download'])
);
vi.mock('~/pages/records/[type]/[id]/_components/AdditionalInfoPanel.vue', () =>
  panelStub('AdditionalInfoPanel', [
    'additionalMetadata',
    'getMetadataFieldLabel',
  ])
);
vi.mock('~/components/GeographyLinkDisplay.vue', () =>
  panelStub('GeographyLinkDisplay', ['linkedGeographyFiles'])
);

import RecordDetailAccordion from '~/pages/records/[type]/[id]/_components/RecordDetailAccordion.vue';

const stubs = {
  UIcon: true,
  // Render the #content slot for every item so each branch is exercised.
  UAccordion: {
    props: ['items'],
    template:
      '<div><section v-for="item in items" :key="item.value" :data-value="item.value"><slot name="content" :item="item" /></section></div>',
  },
  StatusTransitionControls: {
    name: 'StatusTransitionControls',
    props: [
      'recordId',
      'currentStatus',
      'userCanChangeStatus',
      'statusHistory',
    ],
    emits: ['changed'],
    template: '<div class="stc" />',
  },
};

const items = [
  { label: 'Linked', value: 'linked-records', iconName: 'i', description: 'd' },
  { label: 'Files', value: 'attachments', iconName: 'i', description: 'd' },
  {
    label: 'Status',
    value: 'status-transitions',
    iconName: 'i',
    description: 'd',
  },
  { label: 'Geo', value: 'linked-geography', iconName: 'i', description: 'd' },
  { label: 'More', value: 'additional-info', iconName: 'i', description: 'd' },
];

const record = {
  id: 'bylaw-001',
  status: 'published',
  linkedRecords: [{ id: 'r2', type: 'policy', description: 'x' }],
  attachedFiles: [{ id: 'f1', path: 'p', original_name: 'a.pdf' }],
  linkedGeographyFiles: ['geo-1'],
  metadata: { capture: { av_file: 'raw.mkv' } },
};

const mountAccordion = (canChangeStatus = true) =>
  mount(RecordDetailAccordion, {
    props: {
      record: record as any,
      items,
      statusHistory: [{ status: 'draft', user: 'jo' }],
      additionalMetadata: [{ key: 'k', value: 'v' }],
      canChangeStatus,
      getMetadataFieldLabel: vi.fn((k: string) => k),
    },
    global: { stubs },
  });

describe('RecordDetailAccordion', () => {
  it('routes each accordion item to its sub-panel', () => {
    const wrapper = mountAccordion();
    expect(wrapper.findComponent({ name: 'LinkedRecordsPanel' }).exists()).toBe(
      true
    );
    expect(wrapper.findComponent({ name: 'AttachmentsPanel' }).exists()).toBe(
      true
    );
    expect(
      wrapper.findComponent({ name: 'StatusTransitionControls' }).exists()
    ).toBe(true);
    expect(
      wrapper.findComponent({ name: 'GeographyLinkDisplay' }).exists()
    ).toBe(true);
    expect(
      wrapper.findComponent({ name: 'AdditionalInfoPanel' }).exists()
    ).toBe(true);
  });

  it('forwards the record slices into the sub-panels', () => {
    const wrapper = mountAccordion();
    expect(
      wrapper
        .findComponent({ name: 'LinkedRecordsPanel' })
        .props('linkedRecords')
    ).toEqual(record.linkedRecords);
    expect(
      wrapper.findComponent({ name: 'AttachmentsPanel' }).props('capture')
    ).toEqual(record.metadata.capture);
    expect(
      wrapper
        .findComponent({ name: 'GeographyLinkDisplay' })
        .props('linkedGeographyFiles')
    ).toEqual(record.linkedGeographyFiles);
  });

  it('passes the status-change permission into the transition controls', () => {
    const wrapper = mountAccordion(false);
    const stc = wrapper.findComponent({ name: 'StatusTransitionControls' });
    expect(stc.props('userCanChangeStatus')).toBe(false);
    expect(stc.props('recordId')).toBe('bylaw-001');
    expect(stc.props('currentStatus')).toBe('published');
  });

  it('bubbles download and statusChanged up from the sub-panels', async () => {
    const wrapper = mountAccordion();

    await wrapper
      .findComponent({ name: 'AttachmentsPanel' })
      .vm.$emit('download', 'f1', 'a.pdf');
    expect(wrapper.emitted('download')).toEqual([['f1', 'a.pdf']]);

    await wrapper
      .findComponent({ name: 'StatusTransitionControls' })
      .vm.$emit('changed', { newStatus: 'archived' });
    expect(wrapper.emitted('statusChanged')).toEqual([
      [{ newStatus: 'archived' }],
    ]);
  });
});
