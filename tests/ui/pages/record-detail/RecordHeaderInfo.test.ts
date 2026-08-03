import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// RecordHeaderInfo imports useAuthStore directly from '~/stores/auth' (not the
// global shim), so mock that module. Hoisted so the factory can see the store.
const { store } = vi.hoisted(() => ({
  store: { hasPermission: vi.fn(() => true) },
}));
vi.mock('~/stores/auth', () => ({ useAuthStore: () => store }));

import RecordHeaderInfo from '~/pages/records/[type]/[id]/_components/RecordHeaderInfo.vue';

const stubs = {
  UIcon: true,
  UBadge: { template: '<span class="badge"><slot /></span>' },
};

const baseRecord = () => ({
  id: 'bylaw-001',
  type: 'bylaw',
  created_at: '2026-01-01T00:00:00Z',
  author: 'clerk-jo',
  status: 'published',
  hasUnpublishedChanges: false,
  metadata: {},
});

const mountHeader = (overrides: Record<string, unknown> = {}) => {
  const record = { ...baseRecord(), ...overrides };
  const formatDate = vi.fn((d: unknown) => `D(${String(d)})`);
  const getTypeIcon = vi.fn((t: string) => `icon-${t}`);
  const wrapper = mount(RecordHeaderInfo, {
    props: {
      record: record as any,
      statusDisplay: 'Published',
      formatDate,
      getTypeIcon,
    },
    global: { stubs },
  });
  return { wrapper, formatDate, getTypeIcon };
};

beforeEach(() => {
  store.hasPermission.mockReset();
  store.hasPermission.mockReturnValue(true);
});

describe('RecordHeaderInfo', () => {
  it('renders the record identity, formatted date, and status', () => {
    const { wrapper, formatDate, getTypeIcon } = mountHeader();
    const text = wrapper.text();

    expect(text).toContain('bylaw-001');
    expect(text).toContain('bylaw');
    expect(text).toContain('Published');
    expect(text).toContain('clerk-jo');
    expect(formatDate).toHaveBeenCalledWith('2026-01-01T00:00:00Z');
    expect(text).toContain('D(2026-01-01T00:00:00Z)');
    expect(getTypeIcon).toHaveBeenCalledWith('bylaw');
  });

  it('omits the author line when the record has no author', () => {
    const { wrapper } = mountHeader({ author: '' });
    expect(wrapper.text()).not.toContain('clerk-jo');
  });

  it('shows the unpublished-changes badge only with records:edit + the flag', () => {
    const { wrapper } = mountHeader({ hasUnpublishedChanges: true });
    expect(wrapper.text()).toContain('records.unpublishedChanges');
  });

  it('hides the unpublished-changes badge without records:edit', () => {
    store.hasPermission.mockReturnValue(false);
    const { wrapper } = mountHeader({ hasUnpublishedChanges: true });
    expect(wrapper.text()).not.toContain('records.unpublishedChanges');
  });

  it('renders tags when present and nothing when absent', () => {
    const withTags = mountHeader({ metadata: { tags: ['noise', 'zoning'] } });
    expect(withTags.wrapper.text()).toContain('Tags:');
    expect(withTags.wrapper.text()).toContain('noise');
    expect(withTags.wrapper.text()).toContain('zoning');

    const noTags = mountHeader({ metadata: {} });
    expect(noTags.wrapper.text()).not.toContain('Tags:');
  });
});
