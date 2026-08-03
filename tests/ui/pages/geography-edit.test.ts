import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// This page imports useRouter/useRoute straight from 'vue-router' (not the Nuxt
// globals), so mock that module. GeographyForm + SystemFooter are imported.
const { router, route } = vi.hoisted(() => ({
  router: { push: vi.fn(), back: vi.fn() },
  route: { params: { id: 'geo-1' } },
}));
vi.mock('vue-router', () => ({
  useRouter: () => router,
  useRoute: () => route,
}));
vi.mock('~/components/GeographyForm.vue', () => ({
  default: {
    name: 'GeographyForm',
    props: ['mode', 'geographyId'],
    emits: ['success', 'cancel'],
    template: '<div class="geography-form" />',
  },
}));
vi.mock('~/components/SystemFooter.vue', () => ({
  default: { name: 'SystemFooter', template: '<footer />' },
}));

import GeographyEdit from '~/pages/geography/[id]/edit.vue';

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

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
    template: '<div class="alert">{{ title }}<slot name="actions" /></div>',
  },
  UButton: { emits: ['click'], template: '<button><slot /></button>' },
  UIcon: true,
  UModal: { template: '<div><slot name="body" /></div>' },
};

const mountEdit = () => mount(GeographyEdit, { global: { stubs } });

beforeEach(() => {
  router.push.mockReset();
  router.back.mockReset();
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue({ success: true });
});

describe('geography edit page', () => {
  it('renders the edit form and the delete action', () => {
    const wrapper = mountEdit();
    const form = wrapper.findComponent({ name: 'GeographyForm' });
    expect(form.exists()).toBe(true);
    expect(form.props('mode')).toBe('edit');
    expect(form.props('geographyId')).toBe('geo-1');
    expect((wrapper.vm as any).canDeleteGeography).toBe(true);
  });

  it('navigates to the file view after a successful save', async () => {
    const wrapper = mountEdit();
    await wrapper
      .findComponent({ name: 'GeographyForm' })
      .vm.$emit('success', { id: 'geo-2' });
    expect(router.push).toHaveBeenCalledWith('/geography/geo-2');
  });

  it('returns to the current file on cancel', async () => {
    const wrapper = mountEdit();
    await wrapper.findComponent({ name: 'GeographyForm' }).vm.$emit('cancel');
    expect(router.push).toHaveBeenCalledWith('/geography/geo-1');
  });

  it('deletes the file and redirects to the list on success', async () => {
    const wrapper = mountEdit();
    await (wrapper.vm as any).deleteFile();
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/geography/geo-1', {
      method: 'DELETE',
    });
    expect(router.push).toHaveBeenCalledWith('/geography');
    expect((wrapper.vm as any).showDeleteModal).toBe(false);
  });

  it('surfaces an error and closes the modal when delete fails', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockResolvedValue({ success: false });
    const wrapper = mountEdit();
    await (wrapper.vm as any).deleteFile();
    await flushPromises();

    expect((wrapper.vm as any).error).toBeTruthy();
    expect((wrapper.vm as any).showDeleteModal).toBe(false);
    expect(router.push).not.toHaveBeenCalledWith('/geography');
    // the error branch replaces the form
    expect(wrapper.findComponent({ name: 'GeographyForm' }).exists()).toBe(
      false
    );
    expect(wrapper.find('.alert').exists()).toBe(true);
  });
});
