import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Register from '~/pages/auth/register.vue';

/**
 * `auth.registration.enabled: false` — the register page replaces its form
 * with a notice. The API refuses the call regardless (403
 * REGISTRATION_DISABLED); this is the page saying so before the attempt.
 */
const registrationEnabled = vi.hoisted(() => ({ value: true }));
vi.mock('~/composables/useAuthOptions', async () => {
  const { ref, computed } = await import('vue');
  return {
    useAuthOptions: () => {
      const flag = ref(registrationEnabled.value);
      return {
        options: ref({ providers: [], registrationEnabled: flag.value }),
        registrationEnabled: computed(() => flag.value),
        load: vi.fn(async () => ({
          providers: [],
          registrationEnabled: flag.value,
        })),
      };
    },
  };
});

// register.vue watches the store's authError; the setup.ts shim has no such
// field, so give it one.
(global as any).useAuthStore = vi.fn(() => ({
  authError: null,
  isAuthenticated: false,
  user: null,
}));

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: { template: '<div><slot /></div>' },
  UCard: { template: '<div><slot /><slot name="footer" /></div>' },
  UForm: { template: '<form data-testid="register-form"><slot /></form>' },
  UFormField: { template: '<div><slot /><slot name="help" /></div>' },
  UInput: { template: '<input />' },
  UButton: { template: '<button><slot /></button>' },
  UIcon: true,
  UProgress: true,
  UAlert: {
    template:
      '<div class="alert" :data-testid="$attrs[\'data-testid\']">{{ title }} {{ description }}</div>',
    props: ['title', 'description'],
  },
  NuxtLink: { template: '<a><slot /></a>' },
};
const mountOptions = { global: { stubs } };

describe('register page and the registration switch', () => {
  it('renders the form while registration is open', () => {
    registrationEnabled.value = true;
    const wrapper = mount(Register, mountOptions);
    expect(wrapper.find('[data-testid="register-form"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="registration-closed"]').exists()).toBe(
      false
    );
  });

  it('replaces the form with a notice when registration is closed', () => {
    registrationEnabled.value = false;
    const wrapper = mount(Register, mountOptions);
    expect(wrapper.find('[data-testid="register-form"]').exists()).toBe(false);
    const notice = wrapper.find('[data-testid="registration-closed"]');
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain('auth.registrationClosed');
  });
});
