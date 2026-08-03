import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

// RecordForm pulls in the whole editor stack (tiptap / MarkdownEditor); the
// FormSkeleton is trivial. Replace both with light component stubs so mounting
// the page never loads that module graph — and so we can assert the props the
// page wires in and drive its @saved / @delete handlers through real emits.
vi.mock('~/components/RecordForm.vue', () => ({
  default: {
    name: 'RecordForm',
    props: [
      'record',
      'isEditing',
      'saving',
      'error',
      'canDelete',
      'collaborativeMode',
    ],
    emits: ['delete', 'saved'],
    template: '<div class="record-form" />',
  },
}));
vi.mock('~/components/FormSkeleton.vue', () => ({
  default: { name: 'FormSkeleton', template: '<div class="form-skeleton" />' },
}));

import Edit from '~/pages/records/[type]/[id]/edit.vue';

// ---- controllable seams (override the tests/ui/setup.ts globals) ----
const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

let routeParams: Record<string, string> = { type: 'bylaw', id: 'bylaw-001' };
(global as any).useRoute = vi.fn(() => ({ params: routeParams }));

const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));

let loggedIn = true;
let permissions: string[] = ['records:edit'];
(global as any).useAuthStore = vi.fn(() => ({
  isLoggedIn: loggedIn,
  hasPermission: (p: string) => permissions.includes(p),
}));

// edit.vue destructures `getTypeLabel` from useRecordUtils(); the shared setup
// mock returns a different shape (getStatusConfig/formatDate/...) with no
// getTypeLabel, so the breadcrumb computed would throw. Override it here.
(global as any).useRecordUtils = vi.fn(() => ({
  getTypeLabel: (type: string) => type,
}));

// realtimeEnabled drives the collaborativeMode computed; the shared setup has
// no runtime config at all.
let realtimeEnabled = false;
(global as any).useRuntimeConfig = vi.fn(() => ({
  public: { realtimeEnabled },
}));

// definePageMeta is a Nuxt compiler macro; under the plain @vitejs/plugin-vue
// pipeline it survives as a runtime call, so it must exist as a no-op global
// (login/reset-password pages don't call it, which is why setup.ts omits it).
(global as any).definePageMeta = vi.fn();

const publishedRecord = () => ({
  success: true,
  data: {
    id: 'bylaw-001',
    title: 'Noise Bylaw',
    type: 'bylaw',
    content: '# Noise\n\nQuiet hours.',
    status: 'published',
    path: 'records/bylaw/bylaw-001.md',
    author: 'clerk',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-02T00:00:00Z',
  },
});

const draftRecord = () => ({
  success: true,
  data: {
    ...publishedRecord().data,
    status: 'draft',
    markdownBody: '# Draft body',
    isDraft: true,
  },
});

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: {
    template:
      '<div><slot /><slot name="title" /><slot name="description" /></div>',
  },
  UBreadcrumb: { props: ['items'], template: '<nav class="breadcrumb" />' },
  UAlert: {
    props: ['title', 'description'],
    template: '<div class="alert">{{ title }} {{ description }}</div>',
  },
};

const mountOptions = { global: { stubs } };

beforeEach(() => {
  routeParams = { type: 'bylaw', id: 'bylaw-001' };
  loggedIn = true;
  permissions = ['records:edit'];
  realtimeEnabled = false;
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue(publishedRecord());
  toastAdd.mockReset();
});

describe('records edit page', () => {
  it('fetches the record on mount and renders the editor form', async () => {
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(civicApiMock).toHaveBeenCalledWith(
      '/api/v1/records/bylaw-001?edit=true'
    );
    expect(vm.loading).toBe(false);
    expect(vm.error).toBe('');
    expect(vm.record?.title).toBe('Noise Bylaw');

    const form = wrapper.findComponent({ name: 'RecordForm' });
    expect(form.exists()).toBe(true);
    expect(form.props('isEditing')).toBe(true);
    expect(form.props('canDelete')).toBe(true);
    expect(form.props('collaborativeMode')).toBe(false);
    expect(form.props('record').id).toBe('bylaw-001');
  });

  it('shows the form skeleton while the record is loading', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    civicApiMock.mockReset();
    civicApiMock.mockReturnValue(
      new Promise((r) => {
        resolveFetch = r;
      })
    );

    const wrapper = mount(Edit, mountOptions);
    await nextTick();
    const vm = wrapper.vm as any;

    expect(vm.loading).toBe(true);
    expect(wrapper.find('.form-skeleton').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'RecordForm' }).exists()).toBe(false);

    resolveFetch(publishedRecord());
    await flushPromises();
    expect(vm.loading).toBe(false);
    expect(wrapper.find('.form-skeleton').exists()).toBe(false);
  });

  it('marks a draft as having saved changes and points breadcrumbs at drafts', async () => {
    civicApiMock.mockResolvedValue(draftRecord());
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.hasSavedChanges).toBe(true);
    const tos = vm.breadcrumbItems.map((i: any) => i.to);
    expect(tos).toContain('/records/drafts');
    // draft breadcrumbs skip the per-type crumb and the (unpublished) record link
    expect(tos).not.toContain('/records/bylaw/bylaw-001');
  });

  it('builds published-record breadcrumbs with the type and record links', async () => {
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.hasSavedChanges).toBe(false);
    const tos = vm.breadcrumbItems.map((i: any) => i.to);
    expect(tos).toContain('/records');
    expect(tos).toContain('/records/bylaw'); // type crumb
    expect(tos).toContain('/records/bylaw/bylaw-001'); // record view link
  });

  it('renders access-denied and no form when the user lacks records:edit', async () => {
    permissions = [];
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.canEditRecords).toBe(false);
    expect(wrapper.findComponent({ name: 'RecordForm' }).exists()).toBe(false);
    expect(wrapper.text()).toContain('records.accessDenied');
  });

  it('surfaces a fetch failure with an error toast and no record', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('boom'));
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.record).toBe(null);
    expect(vm.error).toBe('boom');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
    expect(wrapper.findComponent({ name: 'RecordForm' }).exists()).toBe(false);
  });

  it('treats an unsuccessful API envelope as a load failure', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockResolvedValue({ success: false });
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.record).toBe(null);
    expect(vm.error).toBe('records.failedToLoadRecord');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
  });

  it('updates local record state when RecordForm emits saved', async () => {
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    const vm = wrapper.vm as any;
    expect(vm.hasSavedChanges).toBe(false);

    await wrapper.findComponent({ name: 'RecordForm' }).vm.$emit('saved', {
      type: 'bylaw',
      title: 'Renamed Bylaw',
      status: 'draft',
      markdownBody: '# Updated',
      updated_at: '2026-02-02T00:00:00Z',
    });
    await flushPromises();

    expect(vm.hasSavedChanges).toBe(true);
    expect(vm.record.title).toBe('Renamed Bylaw');
    expect(vm.record.content).toBe('# Updated');
    expect(vm.record.updated_at).toBe('2026-02-02T00:00:00Z');
  });

  it('deletes via RecordForm and navigates back to the type list on success', async () => {
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    civicApiMock.mockClear(); // drop the fetch call; keep the resolved envelope

    await wrapper
      .findComponent({ name: 'RecordForm' })
      .vm.$emit('delete', 'bylaw-001');
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/bylaw-001', {
      method: 'DELETE',
    });
    expect(navigateTo).toHaveBeenCalledWith('/records/bylaw');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'primary' })
    );
  });

  it('keeps the user on the page and shows an error toast when delete fails', async () => {
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('nope'));

    await wrapper
      .findComponent({ name: 'RecordForm' })
      .vm.$emit('delete', 'bylaw-001');
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.error).toBeTruthy();
    expect(vm.saving).toBe(false);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('passes collaborativeMode through from the realtimeEnabled runtime flag', async () => {
    realtimeEnabled = true;
    const wrapper = mount(Edit, mountOptions);
    await flushPromises();

    expect((wrapper.vm as any).collaborativeMode).toBe(true);
    expect(
      wrapper.findComponent({ name: 'RecordForm' }).props('collaborativeMode')
    ).toBe(true);
  });
});
