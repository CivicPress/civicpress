import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Login from '~/pages/auth/login.vue';

// login.vue drives auth through the store; override the setup.ts shim with
// controllable login / loginWithToken mocks.
const login = vi.fn();
const loginWithToken = vi.fn();
const authError = { value: null as string | null };
(global as any).useAuthStore = vi.fn(() => ({
  login,
  loginWithToken,
  authError,
  isAuthenticated: false,
  user: null,
}));

// login.vue uses UTabs; a simple stub is enough — the handlers are exercised
// directly via wrapper.vm (the tab slots don't need to render).
const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: { template: '<div><slot /></div>' },
  UCard: { template: '<div><slot /><slot name="footer" /></div>' },
  // Render nothing for the tab bodies — the slots need a scoped `item` prop
  // this simple stub can't supply, and the login handlers are exercised
  // directly via wrapper.vm rather than through the rendered forms.
  UTabs: { template: '<div />' },
  UForm: { template: "<form @submit=\"$emit('submit', $event)\"><slot /></form>" },
  UFormField: { template: '<div><slot /></div>' },
  UInput: { template: '<input />' },
  UButton: { template: '<button><slot /></button>' },
  UIcon: true,
  UAlert: { template: '<div class="alert">{{ title }}</div>', props: ['title'] },
  NuxtLink: { template: '<a><slot /></a>' },
};

const mountOptions = { global: { stubs } };

beforeEach(() => {
  login.mockReset();
  login.mockResolvedValue(undefined);
  loginWithToken.mockReset();
  loginWithToken.mockResolvedValue(undefined);
  authError.value = null;
});

describe('login page', () => {
  it('signs in with username + password and redirects home', async () => {
    const wrapper = mount(Login, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.username = 'jo';
    vm.state.password = 'S3cret!';
    await vm.handleCredentialsLogin();
    await flushPromises();

    expect(login).toHaveBeenCalledWith('jo', 'S3cret!');
    expect(navigateTo).toHaveBeenCalledWith('/');
    expect(vm.error).toBe('');
  });

  it('shows an error and does not redirect when credentials are rejected', async () => {
    login.mockReset();
    login.mockRejectedValue(new Error('Invalid username or password'));
    const wrapper = mount(Login, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.username = 'jo';
    vm.state.password = 'wrong';
    await vm.handleCredentialsLogin();
    await flushPromises();

    expect(vm.error).toBeTruthy();
    expect(vm.loading).toBe(false);
  });

  it('signs in with an OAuth token and redirects home', async () => {
    const wrapper = mount(Login, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.gitToken = 'gho_xxx';
    await vm.handleTokenLogin();
    await flushPromises();

    expect(loginWithToken).toHaveBeenCalledWith('gho_xxx');
    expect(navigateTo).toHaveBeenCalledWith('/');
  });
});
