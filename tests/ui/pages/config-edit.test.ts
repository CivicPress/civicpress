import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('~/components/SystemFooter.vue', () => ({
  default: { name: 'SystemFooter', template: '<footer />' },
}));

import ConfigEdit from '~/pages/settings/configuration/[configFile]/edit.vue';

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

(global as any).useRoute = vi.fn(() => ({
  params: { configFile: 'org-config' },
}));

let canManage = true;
(global as any).useAuthStore = vi.fn(() => ({
  isInitialized: true,
  hasPermission: (p: string) => (p === 'config:manage' ? canManage : false),
}));

const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));
(global as any).definePageMeta = vi.fn();

const metadata = () => ({
  _metadata: { name: 'Organization', description: 'Org settings' },
  name: { type: 'string' },
  timezone: { type: 'string' },
});
const configData = () => ({ name: 'Old Org', timezone: 'UTC' });

// URL-routed API: metadata + config load, validate, and PUT save.
const installApi = (over: { putSuccess?: boolean } = {}) => {
  civicApiMock.mockImplementation((url: string, opts?: any) => {
    if (url === '/api/v1/config/metadata/org-config')
      return Promise.resolve({ success: true, data: metadata() });
    if (url === '/api/v1/config/org-config/validate')
      return Promise.resolve({ success: true, data: { valid: true } });
    if (url === '/api/v1/config/org-config' && opts?.method === 'PUT')
      return Promise.resolve({ success: over.putSuccess !== false });
    if (url === '/api/v1/config/org-config')
      return Promise.resolve({ success: true, data: configData() });
    return Promise.resolve({ success: true, data: {} });
  });
};

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: {
    template:
      '<div><slot name="title" /><slot name="description" /><slot name="right" /></div>',
  },
  UBreadcrumb: { props: ['items'], template: '<nav />' },
  UButton: { emits: ['click'], template: '<button><slot /></button>' },
  UFormField: { template: '<div><slot /></div>' },
  UInput: true,
  UIcon: true,
  ConfigurationField: {
    name: 'ConfigurationField',
    props: ['fieldKey', 'field', 'value'],
    emits: ['update'],
    template: '<div class="config-field" />',
  },
};

const mountEdit = () => mount(ConfigEdit, { global: { stubs } });
const field = (wrapper: any, key: string) =>
  wrapper
    .findAllComponents({ name: 'ConfigurationField' })
    .find((c: any) => c.props('fieldKey') === key);

beforeEach(() => {
  canManage = true;
  civicApiMock.mockReset();
  installApi();
  toastAdd.mockReset();
});

describe('configuration edit page', () => {
  it('loads metadata + config on mount and renders the fields', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(civicApiMock).toHaveBeenCalledWith(
      '/api/v1/config/metadata/org-config'
    );
    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/config/org-config');
    expect(vm.loading).toBe(false);
    expect(vm.configTitle).toBe('Organization');
    expect(vm.config).toEqual(configData());
    expect(field(wrapper, 'name')).toBeTruthy();
  });

  it('shows the error state when the config fails to load', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('cfg boom'));
    const wrapper = mountEdit();
    await flushPromises();

    expect((wrapper.vm as any).error).toBeTruthy();
    expect(wrapper.text()).toContain('Configuration Error');
  });

  it('marks changes and updates config when a field emits update', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    const vm = wrapper.vm as any;
    expect(vm.hasChanges).toBe(false);

    await field(wrapper, 'name').vm.$emit('update', 'name', 'New Org');
    expect(vm.config.name).toBe('New Org');
    expect(vm.hasChanges).toBe(true);
  });

  it('builds nested structure for a 3-part key and ignores malformed keys', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.updateNestedFieldValue('roles.clerk.label', 'Clerk');
    expect(vm.config.roles.clerk.label).toBe('Clerk');
    expect(vm.hasChanges).toBe(true);

    vm.hasChanges = false;
    vm.updateNestedFieldValue('too.short', 'x'); // not 3 parts -> no-op
    expect(vm.hasChanges).toBe(false);
  });

  it('sets a second-level value for a 2-part key', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.updateSecondLevelFieldValue('social.twitter', '@civic');
    expect(vm.config.social.twitter).toBe('@civic');
    expect(vm.hasChanges).toBe(true);
  });

  it('reverts edits with resetToOriginal', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.updateFieldValue('name', 'Changed');
    expect(vm.config.name).toBe('Changed');
    vm.resetToOriginal();
    expect(vm.config.name).toBe('Old Org');
    expect(vm.hasChanges).toBe(false);
  });

  it('PUTs the config on save and clears the dirty flag', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    const vm = wrapper.vm as any;
    vm.updateFieldValue('name', 'Saved Org');

    await vm.saveConfiguration();
    await flushPromises();

    const putCall = civicApiMock.mock.calls.find(
      (c: any[]) => c[1]?.method === 'PUT'
    );
    expect(putCall[0]).toBe('/api/v1/config/org-config');
    expect(putCall[1].body.name).toBe('Saved Org');
    expect(vm.hasChanges).toBe(false);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'primary' })
    );
  });

  it('does not save without config:manage permission', async () => {
    canManage = false;
    const wrapper = mountEdit();
    await flushPromises();

    await (wrapper.vm as any).saveConfiguration();
    expect(
      civicApiMock.mock.calls.some((c: any[]) => c[1]?.method === 'PUT')
    ).toBe(false);
  });

  it('shows an error toast when the save fails', async () => {
    installApi({ putSuccess: false });
    const wrapper = mountEdit();
    await flushPromises();
    const vm = wrapper.vm as any;
    vm.updateFieldValue('name', 'x');

    await vm.saveConfiguration();
    await flushPromises();

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
    expect(vm.hasChanges).toBe(true); // failed save stays dirty
  });
});
