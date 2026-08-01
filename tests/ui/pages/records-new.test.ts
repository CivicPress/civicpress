import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// SystemFooter is explicitly imported by the page, so stub it via vi.mock to
// keep its module graph out of the mount. RecordForm is AUTO-imported (there is
// no import statement in the SFC), so vi.mock can't intercept it — it's
// registered as a global stub component below instead.
vi.mock('~/components/SystemFooter.vue', () => ({
  default: {
    name: 'SystemFooter',
    template: '<footer class="system-footer" />',
  },
}));

import NewRecord from '~/pages/records/[type]/new.vue';

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

let routeParams: Record<string, string> = { type: 'bylaw' };
(global as any).useRoute = vi.fn(() => ({ params: routeParams }));

const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));

// This page gates on role (currentUser.role), not a permission — and the shared
// setup mock exposes `user`, not `currentUser`, so override it here.
let role: string | undefined = 'admin';
(global as any).useAuthStore = vi.fn(() => ({
  currentUser: role ? { role } : undefined,
}));

const stubs = {
  RecordForm: {
    name: 'RecordForm',
    props: ['recordType', 'saving', 'error'],
    emits: ['submit', 'delete'],
    template: '<div class="record-form" />',
  },
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

const created = () => ({ success: true, data: { id: 'bylaw-042' } });

beforeEach(() => {
  routeParams = { type: 'bylaw' };
  role = 'admin';
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue(created());
  toastAdd.mockReset();
});

describe('records new (create) page', () => {
  it('renders the create form for the route type', async () => {
    const wrapper = mount(NewRecord, mountOptions);
    await flushPromises();

    const form = wrapper.findComponent({ name: 'RecordForm' });
    expect(form.exists()).toBe(true);
    expect(form.props('recordType')).toBe('bylaw');
    expect(form.props('saving')).toBe(false);
    expect((wrapper.vm as any).canCreateRecords).toBe(true);
  });

  it('allows a clerk to create records', async () => {
    role = 'clerk';
    const wrapper = mount(NewRecord, mountOptions);
    await flushPromises();

    expect((wrapper.vm as any).canCreateRecords).toBe(true);
    expect(wrapper.findComponent({ name: 'RecordForm' }).exists()).toBe(true);
  });

  it('renders access-denied and no form for a non-privileged role', async () => {
    role = 'public';
    const wrapper = mount(NewRecord, mountOptions);
    await flushPromises();

    expect((wrapper.vm as any).canCreateRecords).toBe(false);
    expect(wrapper.findComponent({ name: 'RecordForm' }).exists()).toBe(false);
    expect(wrapper.text()).toContain('records.accessDenied');
  });

  it('POSTs the record and navigates to it on a successful submit', async () => {
    const wrapper = mount(NewRecord, mountOptions);
    await flushPromises();

    const payload = { type: 'bylaw', title: 'New Bylaw', content: '# Body' };
    await wrapper
      .findComponent({ name: 'RecordForm' })
      .vm.$emit('submit', payload);
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records', {
      method: 'POST',
      body: payload,
    });
    expect(navigateTo).toHaveBeenCalledWith('/records/bylaw/bylaw-042');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'primary' })
    );
    expect((wrapper.vm as any).saving).toBe(false);
  });

  it('shows an error toast and does not navigate when create is rejected', async () => {
    const wrapper = mount(NewRecord, mountOptions);
    await flushPromises();
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('server exploded'));

    await wrapper
      .findComponent({ name: 'RecordForm' })
      .vm.$emit('submit', { type: 'bylaw', title: 'X' });
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.error).toBe('server exploded');
    expect(vm.saving).toBe(false);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('treats an unsuccessful envelope as a create failure', async () => {
    const wrapper = mount(NewRecord, mountOptions);
    await flushPromises();
    civicApiMock.mockReset();
    civicApiMock.mockResolvedValue({ success: false });

    await wrapper
      .findComponent({ name: 'RecordForm' })
      .vm.$emit('submit', { type: 'bylaw', title: 'X' });
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.error).toBe('Failed to create record');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
    expect(navigateTo).not.toHaveBeenCalled();
  });
});
