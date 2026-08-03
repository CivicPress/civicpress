import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AdditionalInfoPanel from '~/pages/records/[type]/[id]/_components/AdditionalInfoPanel.vue';

const stubs = {
  UBadge: { template: '<span class="badge"><slot /></span>' },
  UIcon: true,
};

const mountPanel = (
  additionalMetadata: Array<{ key: string; value: unknown }>
) =>
  mount(AdditionalInfoPanel, {
    props: {
      additionalMetadata,
      getMetadataFieldLabel: vi.fn((k: string) => `label:${k}`),
    },
    global: { stubs },
  });

describe('AdditionalInfoPanel', () => {
  it('renders a string metadata value under its field label', () => {
    const wrapper = mountPanel([{ key: 'department', value: 'Public Works' }]);
    expect(wrapper.text()).toContain('label:department');
    expect(wrapper.text()).toContain('Public Works');
  });

  it('JSON-stringifies a non-string metadata value', () => {
    const wrapper = mountPanel([{ key: 'budget', value: { usd: 1000 } }]);
    expect(wrapper.text()).toContain('{"usd":1000}');
  });

  it('renders attendees as a structured list', () => {
    const wrapper = mountPanel([
      {
        key: 'attendees',
        value: [
          { name: 'Alice', role: 'Chair', status: 'present' },
          { name: 'Bob' },
        ],
      },
    ]);
    const text = wrapper.text();
    expect(text).toContain('Alice');
    expect(text).toContain('Chair');
    expect(text).toContain('present');
    expect(text).toContain('Bob');
  });

  it('falls back to the unknown-attendee label when a name is missing', () => {
    const wrapper = mountPanel([
      { key: 'attendees', value: [{ role: 'Guest' }] },
    ]);
    expect(wrapper.text()).toContain('records.unknownAttendee');
  });

  it('shows the empty state when there is no additional metadata', () => {
    const wrapper = mountPanel([]);
    expect(wrapper.text()).toContain('records.noAdditionalMetadataAvailable');
  });
});
