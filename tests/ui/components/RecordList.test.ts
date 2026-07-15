import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// RecordList does `import { useRecordsStore } from '~/stores/records'`
// and `import { useAuthStore } from '~/stores/auth'`, so we mock the
// modules directly (the setup.ts `global.useXStore` shim is only used
// for composables that come in via Nuxt auto-import).
const recordsStoreState: any = {
  records: [],
  isLoading: false,
  recordsError: null,
  totalPages: 1,
  totalCount: 0,
  currentPage: 1,
  facetCounts: { types: {}, statuses: {} },
};

const authStoreState: any = {
  user: { id: 1, username: 'admin', role: 'admin' },
  currentUser: { id: 1, username: 'admin', role: 'admin' },
  isAuthenticated: true,
  hasPermission: vi.fn(() => true),
};

vi.mock('~/stores/records', () => ({
  useRecordsStore: () => recordsStoreState,
}));

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => authStoreState,
}));

// useVirtualList is imported (but unused) by RecordList; the dep itself
// still has to resolve. We don't need to stub it because @vueuse/core is
// a real installed package.

import RecordList from '~/components/RecordList.vue';

// RecordList reads records from the records store (no `records` prop). We
// drive the rendered rows by mutating the mocked store state per-test.
const stubRecord = (overrides: Record<string, any> = {}) => ({
  id: 'r1',
  title: 'Test Record',
  type: 'bylaw',
  status: 'published',
  content: 'Body text',
  path: '/records/bylaw/r1',
  author: 'alice',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  metadata: {},
  ...overrides,
});

const seedStore = (records: any[], extras: Record<string, any> = {}) => {
  recordsStoreState.records = records;
  recordsStoreState.isLoading = false;
  recordsStoreState.recordsError = null;
  recordsStoreState.totalPages = 1;
  recordsStoreState.totalCount = records.length;
  recordsStoreState.currentPage = 1;
  recordsStoreState.facetCounts = { types: {}, statuses: {} };
  Object.assign(recordsStoreState, extras);
};

const seedAuth = (overrides: Record<string, any> = {}) => {
  authStoreState.user = { id: 1, username: 'admin', role: 'admin' };
  authStoreState.currentUser = { id: 1, username: 'admin', role: 'admin' };
  authStoreState.isAuthenticated = true;
  authStoreState.hasPermission = vi.fn(() => true);
  Object.assign(authStoreState, overrides);
};

const mountOptions = {
  global: {
    stubs: {
      // UCard renders the row container; we need a real DOM element so
      // `@click="navigateToRecord(record)"` fires and `data-test` attrs
      // are visible to query selectors.
      UCard: {
        inheritAttrs: false,
        template:
          '<div class="ucard-stub" v-bind="$attrs"><slot /></div>',
      },
      UButton: true,
      UBadge: {
        inheritAttrs: false,
        template:
          '<span class="ubadge-stub" v-bind="$attrs"><slot /></span>',
      },
      UIcon: true,
      UAlert: true,
      USelectMenu: true,
      UPagination: true,
      RecordCardSkeleton: true,
    },
  },
};

describe('RecordList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore([]);
    seedAuth();
    (global as any).navigateTo = vi.fn();
    // RecordList destructures several helpers from useRecordUtils. The
    // default global mock in tests/ui/setup.ts only stubs a subset, so
    // we extend it here to keep the template wiring safe.
    (global as any).useRecordUtils = vi.fn(() => ({
      formatDate: (d: string) => d,
      normalizeDateString: (d: string) => d,
      getStatusColor: () => 'primary',
      getStatusLabel: (s: string) => s,
      getStatusIcon: () => 'i-lucide-circle',
      getStatusConfig: (s: string) => ({
        label: s,
        color: 'primary',
        variant: 'soft',
      }),
      getTypeIcon: () => 'i-lucide-file',
      getTypeLabel: (t: string) => t,
    }));
  });

  it('renders the empty state when no records and not loading', () => {
    seedStore([]);
    const wrapper = mount(RecordList, { props: {}, ...mountOptions });
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(true);
    // No record rows in empty state
    expect(wrapper.findAll('[data-test="record-row"]')).toHaveLength(0);
  });

  it('renders one row per record from the store', () => {
    seedStore([
      stubRecord({ id: 'a', title: 'Alpha' }),
      stubRecord({ id: 'b', title: 'Beta' }),
      stubRecord({ id: 'c', title: 'Gamma' }),
    ]);

    const wrapper = mount(RecordList, { props: {}, ...mountOptions });

    const rows = wrapper.findAll('[data-test="record-row"]');
    expect(rows).toHaveLength(3);
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('Beta');
    expect(wrapper.text()).toContain('Gamma');
  });

  it('emits recordClick when a row is clicked', async () => {
    const record = stubRecord({ id: 'xyz', title: 'Clickable' });
    seedStore([record]);

    const wrapper = mount(RecordList, { props: {}, ...mountOptions });

    await wrapper.find('[data-test="record-row"]').trigger('click');

    const emitted = wrapper.emitted('recordClick');
    expect(emitted).toBeTruthy();
    // First arg of first emit is the record (with display-formatted extras)
    const arg = emitted![0][0] as any;
    expect(arg.id).toBe('xyz');
    expect(arg.title).toBe('Clickable');
  });

  it('shows the unpublished-changes indicator when a record has draft', () => {
    seedStore([
      stubRecord({
        id: 'with-draft',
        title: 'Published With Draft',
        hasUnpublishedChanges: true,
      }),
    ]);
    seedAuth({ hasPermission: vi.fn(() => true) });

    const wrapper = mount(RecordList, { props: {}, ...mountOptions });

    expect(wrapper.find('[data-test="unpublished-indicator"]').exists()).toBe(
      true
    );
  });

  it('does NOT show the unpublished indicator when user lacks edit permission', () => {
    seedStore([
      stubRecord({
        id: 'with-draft',
        hasUnpublishedChanges: true,
      }),
    ]);
    seedAuth({ hasPermission: vi.fn(() => false) });

    const wrapper = mount(RecordList, { props: {}, ...mountOptions });

    expect(wrapper.find('[data-test="unpublished-indicator"]').exists()).toBe(
      false
    );
  });

  it('emits resetFilters when empty-state "clear filters" button is clicked', async () => {
    seedStore([]);

    // Render the empty-state with a non-stubbed UButton so we can click it
    const wrapper = mount(RecordList, {
      props: {},
      global: {
        ...mountOptions.global,
        stubs: {
          ...mountOptions.global.stubs,
          UButton: {
            template:
              '<button class="ubutton-stub" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });

    const emptyState = wrapper.find('[data-test="empty-state"]');
    expect(emptyState.exists()).toBe(true);

    // First clear-filters UButton inside the empty state
    const clearBtn = emptyState.find('button.ubutton-stub');
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger('click');

    expect(wrapper.emitted('resetFilters')).toBeTruthy();
  });
});
