import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('~/components/SystemFooter.vue', () => ({
  default: { name: 'SystemFooter', template: '<footer />' },
}));

import ConfigIndex from '~/pages/settings/configuration/index.vue';

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));

let canManage = true;
(global as any).useAuthStore = vi.fn(() => ({
  isInitialized: true,
  hasPermission: (p: string) => (p === 'config:manage' ? canManage : false),
}));

(global as any).definePageMeta = vi.fn();

// happy-dom may not implement object URLs; the export path uses them.
(URL as any).createObjectURL = vi.fn(() => 'blob:x');
(URL as any).revokeObjectURL = vi.fn();

// Per-test controllable responses, routed by URL.
let exportResp: any;
let importResp: any;
const installApi = () => {
  civicApiMock.mockImplementation((url: string) => {
    if (url === '/api/v1/config/list')
      return Promise.resolve({ success: true, data: [] });
    if (url === '/api/v1/config/export') return Promise.resolve(exportResp);
    if (url === '/api/v1/config/import') return Promise.resolve(importResp);
    return Promise.resolve({ success: true, data: {} });
  });
};

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: { template: '<div><slot name="title" /></div>' },
  UBreadcrumb: { props: ['items'], template: '<nav />' },
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UButton: { emits: ['click'], template: '<button><slot /></button>' },
  UIcon: true,
};

const mountPage = () => mount(ConfigIndex, { global: { stubs } });

beforeEach(() => {
  canManage = true;
  civicApiMock.mockReset();
  exportResp = {
    success: true,
    data: { files: { 'org-config': 'a: 1', roles: 'b: 2' } },
  };
  importResp = {
    success: true,
    data: { applied: 2, skipped: 1, failed: 0, results: [] },
  };
  installApi();
  toastAdd.mockReset();
  (URL as any).createObjectURL.mockClear();
});

describe('configuration index page', () => {
  it('exports the bundle and triggers a client-side download', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await (wrapper.vm as any).exportConfiguration();
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/config/export');
    expect((URL as any).createObjectURL).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Configuration exported',
        color: 'primary',
      })
    );
  });

  it('shows an error toast when export fails', async () => {
    exportResp = { success: false, error: { message: 'nope' } };
    const wrapper = mountPage();
    await flushPromises();

    await (wrapper.vm as any).exportConfiguration();
    await flushPromises();

    expect((URL as any).createObjectURL).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Export failed', color: 'error' })
    );
  });

  it('does not export without config:manage permission', async () => {
    canManage = false;
    const wrapper = mountPage();
    await flushPromises();
    civicApiMock.mockClear();

    await (wrapper.vm as any).exportConfiguration();
    expect(civicApiMock).not.toHaveBeenCalledWith('/api/v1/config/export');
  });

  it('applies a bundle, summarizes the result, and refreshes the list', async () => {
    const wrapper = mountPage();
    await flushPromises();
    civicApiMock.mockClear();

    await (wrapper.vm as any).applyConfigBundle({
      'org-config': 'a: 1',
      notifications: 'x: 1',
    });
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/config/import', {
      method: 'POST',
      body: { files: { 'org-config': 'a: 1', notifications: 'x: 1' } },
    });
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Configuration imported',
        description: 'Applied 2, skipped 1, failed 0.',
        color: 'primary',
      })
    );
    // list refreshed after import
    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/config/list');
  });

  it('uses a warning color when some files failed to import', async () => {
    importResp = {
      success: true,
      data: { applied: 1, skipped: 0, failed: 1, results: [] },
    };
    const wrapper = mountPage();
    await flushPromises();

    await (wrapper.vm as any).applyConfigBundle({ 'org-config': 'a: 1' });
    await flushPromises();

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'warning' })
    );
  });

  it('shows an error toast when the import request fails', async () => {
    const wrapper = mountPage();
    await flushPromises();
    civicApiMock.mockImplementation((url: string) => {
      if (url === '/api/v1/config/import')
        return Promise.reject(new Error('server down'));
      return Promise.resolve({ success: true, data: [] });
    });

    await (wrapper.vm as any).applyConfigBundle({ 'org-config': 'a: 1' });
    await flushPromises();

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Import failed', color: 'error' })
    );
  });
});
