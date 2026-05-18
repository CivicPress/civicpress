import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import UserForm from '~/components/UserForm.vue';

// Composable mocks (Nuxt auto-imports are not resolved in vitest, so we shim
// the two extras UserForm uses on top of the globals already set in
// tests/ui/setup.ts).
const fetchRolesMock = vi.fn().mockResolvedValue(undefined);
const rolesRef = { value: [
  { key: 'admin', name: 'Admin', icon: 'i-lucide-shield', description: 'Admins' },
  { key: 'clerk', name: 'Clerk', icon: 'i-lucide-user', description: 'Clerks' },
] };

global.useUserRoles = vi.fn(() => ({
  fetchRoles: fetchRolesMock,
  roles: rolesRef,
  loading: { value: false },
})) as any;

global.useSecurity = vi.fn(() => ({
  canUserSetPassword: () => true,
  getAuthProviderDisplayName: (p: string) => p,
})) as any;

// UserForm doesn't import these explicitly but it relies on Nuxt-auto-imported
// `useRouter` / `useToast` which `tests/ui/setup.ts` already shims.

const mountOptions = {
  global: {
    stubs: {
      UForm: { template: '<form @submit="$emit(\'submit\', $event)"><slot /></form>' },
      UFormField: { template: '<div><slot /></div>' },
      UInput: { template: '<input />' },
      UTextarea: { template: '<textarea />' },
      USelectMenu: true,
      UCard: { template: '<div><slot /></div>' },
      UButton: true,
      UIcon: true,
      UModal: true,
      UAlert: true,
    },
    mocks: {
      $router: { back: vi.fn() },
    },
  },
};

describe('UserForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts in creation mode (no user prop) with empty form fields', async () => {
    const wrapper = mount(UserForm, {
      props: { user: undefined, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    expect(wrapper.exists()).toBe(true);
    const vm = wrapper.vm as any;
    expect(vm.form.username).toBe('');
    expect(vm.form.email).toBe('');
    expect(vm.form.role).toBe('');
  });

  it('mounts in edit mode and pre-fills form from user prop', async () => {
    const wrapper = mount(UserForm, {
      props: {
        user: {
          id: 1,
          username: 'jdoe',
          email: 'jdoe@example.com',
          name: 'Jane Doe',
          role: 'clerk',
        } as any,
        isEditing: true,
      },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.form.username).toBe('jdoe');
    expect(vm.form.email).toBe('jdoe@example.com');
    expect(vm.form.name).toBe('Jane Doe');
    expect(vm.form.role).toBe('clerk');
  });

  it('emits submit with form values when valid (create mode)', async () => {
    const wrapper = mount(UserForm, {
      props: { user: undefined, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.username = 'newuser';
    vm.form.email = 'new@example.com';
    vm.form.name = 'New User';
    vm.form.role = 'admin';
    vm.form.password = 'S3curePass!';
    vm.form.confirmPassword = 'S3curePass!';

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    const payload = emitted![0][0] as any;
    expect(payload.username).toBe('newuser');
    expect(payload.email).toBe('new@example.com');
    expect(payload.name).toBe('New User');
    expect(payload.role).toBe('admin');
    expect(payload.password).toBe('S3curePass!');
  });

  it('shows validation error for invalid email and does NOT emit submit', async () => {
    const wrapper = mount(UserForm, {
      props: { user: undefined, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.username = 'someuser';
    vm.form.email = 'not-an-email';
    vm.form.role = 'admin';
    vm.form.password = 'S3curePass!';
    vm.form.confirmPassword = 'S3curePass!';

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.emitted('submit')).toBeFalsy();
    // formErrors.email populated
    expect(vm.formErrors.email).toMatch(/valid email/i);
    // and is rendered in the template
    expect(wrapper.text()).toMatch(/valid email/i);
  });

  it('shows validation error when username has invalid characters', async () => {
    const wrapper = mount(UserForm, {
      props: { user: undefined, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.username = 'Has Spaces!';
    vm.form.email = 'good@example.com';
    vm.form.role = 'admin';
    vm.form.password = 'S3curePass!';
    vm.form.confirmPassword = 'S3curePass!';

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(vm.formErrors.username).toMatch(/lowercase letters/i);
  });

  it('shows validation error when passwords do not match', async () => {
    const wrapper = mount(UserForm, {
      props: { user: undefined, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.username = 'pwduser';
    vm.form.email = 'pwd@example.com';
    vm.form.role = 'admin';
    vm.form.password = 'one-password';
    vm.form.confirmPassword = 'different';

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(vm.formErrors.confirmPassword).toMatch(/do not match/i);
  });

  it('emits delete when confirmDelete is invoked (edit + canDelete)', async () => {
    const wrapper = mount(UserForm, {
      props: {
        user: {
          id: 1,
          username: 'old',
          email: 'old@example.com',
          name: 'Old',
          role: 'clerk',
        } as any,
        isEditing: true,
        canDelete: true,
      },
      ...mountOptions,
    });
    await flushPromises();

    // confirmDelete is internal; invoke it via the exposed handler path.
    // The template uses showDeleteModal + a confirm button that calls confirmDelete.
    // We can call it through the vm because Vue exposes script-setup bindings on
    // wrapper.vm when defineExpose isn't used and tests run with happy-dom.
    const vm = wrapper.vm as any;
    await vm.confirmDelete?.();
    await flushPromises();

    expect(wrapper.emitted('delete')).toBeTruthy();
  });

  it('does not require new password fields in edit mode by default', async () => {
    const wrapper = mount(UserForm, {
      props: {
        user: {
          id: 1,
          username: 'edituser',
          email: 'edit@example.com',
          name: 'Edit User',
          role: 'clerk',
        } as any,
        isEditing: true,
      },
      ...mountOptions,
    });
    await flushPromises();

    // No password set, but showPasswordFields is false in edit mode.
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.emitted('submit')).toBeTruthy();
    const payload = wrapper.emitted('submit')![0][0] as any;
    expect(payload.username).toBe('edituser');
    expect(payload.email).toBe('edit@example.com');
    // Password is intentionally absent in edit mode without showPasswordFields.
    expect(payload.password).toBeUndefined();
  });
});
