import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ForgotPassword from '~/pages/auth/forgot-password.vue';

// $civicApi is destructured from useNuxtApp() in the page's setup; control it
// per test (same approach as tests/ui/components/RecordForm.test.ts).
const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

// Slot-rendering stubs so the form + fields land in the DOM and the UForm
// @submit fires handleSubmit (see tests/ui/components/UserForm.test.ts).
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
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue({ success: true, data: {} });
});

describe('forgot-password page', () => {
  it('POSTs the identifier and shows the confirmation state on success', async () => {
    const wrapper = mount(ForgotPassword, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.identifier = 'jo@example.org';
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'jo@example.org' },
    });
    expect(vm.submitted).toBe(true);
    // The form is replaced by the confirmation copy.
    expect(wrapper.text()).toContain('auth.forgotPasswordSent');
  });

  it('does not submit a blank identifier', async () => {
    const wrapper = mount(ForgotPassword, mountOptions);

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(civicApiMock).not.toHaveBeenCalled();
    expect((wrapper.vm as any).submitted).toBe(false);
  });

  it('trims the identifier before posting', async () => {
    const wrapper = mount(ForgotPassword, mountOptions);
    (wrapper.vm as any).state.identifier = '  spaced-out  ';

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'spaced-out' },
    });
  });

  it('surfaces an error and stays on the form when the request throws', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('network down'));
    const wrapper = mount(ForgotPassword, mountOptions);
    const vm = wrapper.vm as any;

    vm.state.identifier = 'jo';
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(vm.submitted).toBe(false);
    expect(vm.error).toBeTruthy();
    expect(vm.loading).toBe(false);
  });
});
