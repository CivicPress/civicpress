import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ResetPassword from '~/pages/auth/reset-password.vue';

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

// The reset token comes from the route query; control it per test.
let routeQuery: Record<string, unknown> = {};
(global as any).useRoute = vi.fn(() => ({ query: routeQuery }));

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: { template: '<div><slot /></div>' },
  UCard: { template: '<div><slot /><slot name="footer" /></div>' },
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
  routeQuery = {};
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue({ success: true, data: { sessionsRevoked: true } });
});

describe('reset-password page', () => {
  it('resets with a valid token + matching passwords and shows the success state', async () => {
    routeQuery = { token: 'tok-123' };
    const wrapper = mount(ResetPassword, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.newPassword = 'BrandNewP4ss!';
    vm.state.confirmPassword = 'BrandNewP4ss!';
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token: 'tok-123', newPassword: 'BrandNewP4ss!' },
    });
    expect(vm.done).toBe(true);
    expect(wrapper.text()).toContain('auth.resetPasswordSuccess');
  });

  it('shows the missing-token state and no form when the link has no token', async () => {
    routeQuery = {};
    const wrapper = mount(ResetPassword, mountOptions);
    const vm = wrapper.vm as any;

    expect(vm.token).toBe('');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('auth.resetPasswordMissingToken');
  });

  it('blocks submit and flags mismatched passwords', async () => {
    routeQuery = { token: 'tok-123' };
    const wrapper = mount(ResetPassword, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.newPassword = 'BrandNewP4ss!';
    vm.state.confirmPassword = 'Different1!';
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(civicApiMock).not.toHaveBeenCalled();
    expect(vm.error).toContain('auth.passwordsDoNotMatch');
    expect(vm.done).toBe(false);
  });

  it('does not submit a too-short password', async () => {
    routeQuery = { token: 'tok-123' };
    const wrapper = mount(ResetPassword, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.newPassword = 'short';
    vm.state.confirmPassword = 'short';
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(civicApiMock).not.toHaveBeenCalled();
    expect(vm.done).toBe(false);
  });

  it('surfaces the server message on an invalid/expired token', async () => {
    routeQuery = { token: 'stale' };
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue({
      data: { error: { message: 'This password reset link is invalid or has expired.' } },
    });
    const wrapper = mount(ResetPassword, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.newPassword = 'BrandNewP4ss!';
    vm.state.confirmPassword = 'BrandNewP4ss!';
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(vm.done).toBe(false);
    expect(vm.error).toMatch(/invalid or has expired/i);
  });
});
