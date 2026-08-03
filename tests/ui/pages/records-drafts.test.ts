import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

// drafts.vue imports useAuthStore from '~/stores/auth'; SystemFooter is imported.
const { store } = vi.hoisted(() => ({
  store: { isLoggedIn: true, hasPermission: vi.fn(() => true) },
}));
vi.mock('~/stores/auth', () => ({ useAuthStore: () => store }));
vi.mock('~/components/SystemFooter.vue', () => ({
  default: { name: 'SystemFooter', template: '<footer />' },
}));

import Drafts from '~/pages/records/drafts.vue';

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));

// The shared setup mock's useRecordUtils lacks the helpers this page destructures.
(global as any).useRecordUtils = vi.fn(() => ({
  formatDate: vi.fn(() => 'fd'),
  formatRelativeTime: vi.fn(() => 'a while ago'),
  getTypeLabel: (t: string) => `label-${t}`,
  getTypeIcon: (t: string) => `icon-${t}`,
}));

(global as any).definePageMeta = vi.fn();
const confirmMock = vi.fn();
vi.stubGlobal('confirm', confirmMock);

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
    template: '<div class="alert">{{ title }}</div>',
  },
  UBadge: { template: '<span class="badge"><slot /></span>' },
  UButton: { emits: ['click'], template: '<button><slot /></button>' },
  UDropdownMenu: { template: '<div><slot /></div>' },
  UIcon: true,
  HeaderActions: {
    name: 'HeaderActions',
    props: ['actions'],
    template: '<div class="header-actions" />',
  },
};

const draftsEnvelope = (drafts: unknown[]) => ({
  success: true,
  data: { drafts },
});

const mountDrafts = () => mount(Drafts, { global: { stubs } });

beforeEach(() => {
  store.isLoggedIn = true;
  store.hasPermission.mockReset();
  store.hasPermission.mockReturnValue(true);
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue(draftsEnvelope([]));
  toastAdd.mockReset();
  confirmMock.mockReset();
  confirmMock.mockReturnValue(true);
});

describe('records drafts page', () => {
  it('fetches drafts on mount and sorts them newest-first', async () => {
    civicApiMock.mockResolvedValue(
      draftsEnvelope([
        {
          id: 'd1',
          title: 'Older',
          type: 'bylaw',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'd2',
          title: 'Newer',
          type: 'policy',
          updated_at: '2026-03-01T00:00:00Z',
        },
      ])
    );
    const wrapper = mountDrafts();
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/drafts');
    expect(vm.drafts.map((d: any) => d.id)).toEqual(['d2', 'd1']);
    expect(wrapper.text()).toContain('Newer');
    expect(wrapper.text()).toContain('Older');
  });

  it('shows the loading state before the fetch resolves', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockReturnValue(new Promise(() => {}));
    const wrapper = mountDrafts();
    await nextTick();

    expect((wrapper.vm as any).loading).toBe(true);
    // the i18n stub returns the key, not the fallback string
    expect(wrapper.text()).toContain('records.drafts.loading');
  });

  it('surfaces a fetch error', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('drafts boom'));
    const wrapper = mountDrafts();
    await flushPromises();

    expect((wrapper.vm as any).error).toBe('drafts boom');
    expect(wrapper.find('.alert').text()).toContain('drafts boom');
  });

  it('treats an unsuccessful envelope as a load failure', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockResolvedValue({ success: false });
    const wrapper = mountDrafts();
    await flushPromises();

    expect((wrapper.vm as any).error).toBe('Failed to load drafts');
  });

  it('shows the empty state when there are no drafts', async () => {
    const wrapper = mountDrafts();
    await flushPromises();
    expect(wrapper.text()).toContain('records.drafts.empty.title');
  });

  it('flags an internal-only draft with a badge', async () => {
    civicApiMock.mockResolvedValue(
      draftsEnvelope([
        {
          id: 'd1',
          title: 'Secret',
          type: 'bylaw',
          workflowState: 'internal_only',
        },
      ])
    );
    const wrapper = mountDrafts();
    await flushPromises();
    expect(wrapper.text()).toContain('records.drafts.badge.internal');
  });

  it('navigates to the editor for a draft', async () => {
    const wrapper = mountDrafts();
    await flushPromises();

    (wrapper.vm as any).editDraft({ id: 'd9', type: 'bylaw' });
    expect(navigateTo).toHaveBeenCalledWith('/records/bylaw/d9/edit');
  });

  it('deletes a draft after confirmation and drops it from the list', async () => {
    civicApiMock.mockResolvedValue(
      draftsEnvelope([{ id: 'd1', title: 'X', type: 'bylaw' }])
    );
    const wrapper = mountDrafts();
    await flushPromises();
    civicApiMock.mockClear();

    await (wrapper.vm as any).deleteDraft({ id: 'd1', title: 'X' });
    await flushPromises();

    expect(confirmMock).toHaveBeenCalled();
    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/d1/draft', {
      method: 'DELETE',
    });
    expect((wrapper.vm as any).drafts.map((d: any) => d.id)).not.toContain(
      'd1'
    );
  });

  it('does not delete when the confirmation is dismissed', async () => {
    civicApiMock.mockResolvedValue(
      draftsEnvelope([{ id: 'd1', title: 'X', type: 'bylaw' }])
    );
    const wrapper = mountDrafts();
    await flushPromises();
    civicApiMock.mockClear();
    confirmMock.mockReturnValue(false);

    await (wrapper.vm as any).deleteDraft({ id: 'd1', title: 'X' });

    expect(civicApiMock).not.toHaveBeenCalled();
    expect((wrapper.vm as any).drafts.map((d: any) => d.id)).toContain('d1');
  });

  it('shows an error toast when a delete fails', async () => {
    civicApiMock.mockResolvedValue(
      draftsEnvelope([{ id: 'd1', title: 'X', type: 'bylaw' }])
    );
    const wrapper = mountDrafts();
    await flushPromises();
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('nope'));

    await (wrapper.vm as any).deleteDraft({ id: 'd1', title: 'X' });
    await flushPromises();

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
    // failed delete leaves the draft in place
    expect((wrapper.vm as any).drafts.map((d: any) => d.id)).toContain('d1');
  });

  it('shows the create action only with records:create permission', async () => {
    const shown = mountDrafts();
    await flushPromises();
    expect(shown.findComponent({ name: 'HeaderActions' }).exists()).toBe(true);

    store.hasPermission.mockReturnValue(false);
    const hidden = mountDrafts();
    await flushPromises();
    expect(hidden.findComponent({ name: 'HeaderActions' }).exists()).toBe(
      false
    );
  });
});
