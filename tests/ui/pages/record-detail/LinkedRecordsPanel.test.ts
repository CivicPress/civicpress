import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// LinkedRecordList is explicitly imported; stub it so we can assert the panel
// forwards the linked records (read-only) without pulling its real graph.
vi.mock('~/components/records/LinkedRecordList.vue', () => ({
  default: {
    name: 'LinkedRecordList',
    props: ['modelValue', 'editable'],
    template: '<div class="linked-record-list" />',
  },
}));

import LinkedRecordsPanel from '~/pages/records/[type]/[id]/_components/LinkedRecordsPanel.vue';

const links = [{ id: 'r1', type: 'bylaw', description: 'related' }];

describe('LinkedRecordsPanel', () => {
  it('renders the read-only list when there are linked records', () => {
    const wrapper = mount(LinkedRecordsPanel, {
      props: { linkedRecords: links },
      global: { stubs: { UIcon: true } },
    });

    const list = wrapper.findComponent({ name: 'LinkedRecordList' });
    expect(list.exists()).toBe(true);
    expect(list.props('modelValue')).toEqual(links);
    expect(list.props('editable')).toBe(false);
  });

  it('shows the empty state when there are no linked records', () => {
    const wrapper = mount(LinkedRecordsPanel, {
      props: { linkedRecords: [] },
      global: { stubs: { UIcon: true } },
    });

    expect(wrapper.findComponent({ name: 'LinkedRecordList' }).exists()).toBe(
      false
    );
    expect(wrapper.text()).toContain(
      'records.linkedRecords.noRecordsLinkedTitle'
    );
  });
});
