import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

// The page delegates its brains to useRecordDetail (separately unit-tested);
// mock it so we drive the page's own branch rendering / transcript gating /
// header actions. Panels + SystemFooter are stubbed via vi.mock (all imported);
// HeaderActions is auto-imported so it's a global stub.
const { rdMock } = vi.hoisted(() => ({ rdMock: vi.fn() }));
vi.mock('~/composables/useRecordDetail', () => ({ useRecordDetail: rdMock }));

// vi.mock factories are hoisted above module-scope consts, so the shared stub
// helper must live in vi.hoisted to be initialized when the mocks run.
const { panelStub } = vi.hoisted(() => ({
  panelStub: (name: string) => ({
    default: { name, template: `<div class="${name}" />` },
  }),
}));
vi.mock('~/pages/records/[type]/[id]/_components/RecordHeaderInfo.vue', () =>
  panelStub('RecordHeaderInfo')
);
vi.mock(
  '~/pages/records/[type]/[id]/_components/RecordContentBody.vue',
  () => ({
    default: {
      name: 'RecordContentBody',
      props: ['content', 'renderedContent'],
      template: '<div class="RecordContentBody" />',
    },
  })
);
vi.mock(
  '~/pages/records/[type]/[id]/_components/RecordDetailAccordion.vue',
  () => panelStub('RecordDetailAccordion')
);
vi.mock('~/pages/records/[type]/[id]/_components/TranscriptViewer.vue', () => ({
  default: {
    name: 'TranscriptViewer',
    props: ['src', 'status'],
    template: '<div class="TranscriptViewer" />',
  },
}));
vi.mock('~/components/SystemFooter.vue', () => panelStub('SystemFooter'));

import DetailPage from '~/pages/records/[type]/[id]/index.vue';

(global as any).useRoute = vi.fn(() => ({
  params: { type: 'bylaw', id: 'bylaw-001' },
}));

function makeRd(over: Record<string, any> = {}) {
  return {
    record: ref(over.record ?? null),
    loading: ref(over.loading ?? false),
    error: ref(over.error ?? ''),
    canEditRecords: ref(over.canEditRecords ?? true),
    authStore: { hasPermission: vi.fn(() => true) },
    renderedContent: ref('<p>rendered</p>'),
    statusDisplay: 'Published',
    statusHistory: [],
    breadcrumbItems: [],
    detailAccordionItems: [],
    additionalMetadata: [],
    formatDate: vi.fn((d: unknown) => String(d)),
    getTypeIcon: vi.fn(() => 'i'),
    getMetadataFieldLabel: vi.fn((k: string) => k),
    fetchRecord: vi.fn(),
    goBack: vi.fn(),
    handleStatusChanged: vi.fn(),
    handleContentClick: vi.fn(),
    downloadFile: vi.fn(),
  };
}

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: {
    template:
      '<div><slot name="title" /><slot name="description" /><slot name="right" /></div>',
  },
  UBreadcrumb: { props: ['items'], template: '<nav />' },
  UAlert: {
    props: ['title'],
    template: '<div class="alert">{{ title }}<slot name="footer" /></div>',
  },
  UButton: {
    emits: ['click'],
    template:
      '<button class="ubtn" @click="$emit(\'click\')"><slot /></button>',
  },
  UIcon: true,
  HeaderActions: {
    name: 'HeaderActions',
    props: ['actions'],
    template: '<div class="header-actions" />',
  },
};

const mountPage = () => mount(DetailPage, { global: { stubs } });

const rec = (over: Record<string, any> = {}) => ({
  id: 'bylaw-001',
  title: 'Noise Bylaw',
  type: 'bylaw',
  content: '# Noise',
  status: 'published',
  metadata: {},
  ...over,
});

beforeEach(() => {
  rdMock.mockReset();
});

describe('record detail page', () => {
  it('shows the loading state and no panels while loading', () => {
    rdMock.mockReturnValue(makeRd({ loading: true }));
    const wrapper = mountPage();
    expect(wrapper.text()).toContain('Loading record...');
    expect(wrapper.findComponent({ name: 'RecordHeaderInfo' }).exists()).toBe(
      false
    );
  });

  it('shows the error state and retries the fetch on "Try Again"', async () => {
    const rd = makeRd({ error: 'Something broke' });
    rdMock.mockReturnValue(rd);
    const wrapper = mountPage();

    expect(wrapper.find('.alert').text()).toContain('Something broke');
    await wrapper.find('.ubtn').trigger('click');
    expect(rd.fetchRecord).toHaveBeenCalledTimes(1);
  });

  it('renders the record panels and forwards rendered content', () => {
    rdMock.mockReturnValue(makeRd({ record: rec() }));
    const wrapper = mountPage();

    expect(wrapper.findComponent({ name: 'RecordHeaderInfo' }).exists()).toBe(
      true
    );
    expect(
      wrapper.findComponent({ name: 'RecordDetailAccordion' }).exists()
    ).toBe(true);
    expect(
      wrapper
        .findComponent({ name: 'RecordContentBody' })
        .props('renderedContent')
    ).toBe('<p>rendered</p>');
  });

  it('shows the transcript viewer only when the record carries a transcript', () => {
    rdMock.mockReturnValue(
      makeRd({ record: rec({ metadata: { media: {} } }) })
    );
    expect(
      mountPage().findComponent({ name: 'TranscriptViewer' }).exists()
    ).toBe(false);

    rdMock.mockReturnValue(
      makeRd({
        record: rec({
          metadata: {
            media: { transcript: '/api/v1/storage/files/t' },
            transcript_status: 'automated',
          },
        }),
      })
    );
    const viewer = mountPage().findComponent({ name: 'TranscriptViewer' });
    expect(viewer.exists()).toBe(true);
    expect(viewer.props('src')).toBe('/api/v1/storage/files/t');
    expect(viewer.props('status')).toBe('automated');
  });

  it('shows the not-found state and goes back when no record loads', async () => {
    const rd = makeRd({ record: null });
    rdMock.mockReturnValue(rd);
    const wrapper = mountPage();

    expect(wrapper.text()).toContain('Record Not Found');
    await wrapper.find('.ubtn').trigger('click');
    expect(rd.goBack).toHaveBeenCalledTimes(1);
  });

  it('gates the edit header action on canEditRecords', () => {
    rdMock.mockReturnValue(makeRd({ record: rec(), canEditRecords: true }));
    const editable = mountPage()
      .findComponent({ name: 'HeaderActions' })
      .props('actions')
      .find((a: any) => a.icon === 'i-lucide-edit');
    expect(editable.show).toBe(true);

    rdMock.mockReturnValue(makeRd({ record: rec(), canEditRecords: false }));
    const locked = mountPage()
      .findComponent({ name: 'HeaderActions' })
      .props('actions')
      .find((a: any) => a.icon === 'i-lucide-edit');
    expect(locked.show).toBe(false);
  });
});
