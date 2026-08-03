import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('~/components/SystemFooter.vue', () => ({
  default: { name: 'SystemFooter', template: '<footer />' },
}));

import UserEdit from '~/pages/settings/users/[username]/edit.vue';

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

let username = 'jo';
(global as any).useRoute = vi.fn(() => ({ params: { username } }));

let currentUser: { username: string; id: number } = { username: 'jo', id: 1 };
let canManage = false;
(global as any).useAuthStore = vi.fn(() => ({
  currentUser,
  hasPermission: (p: string) => (p === 'users:manage' ? canManage : false),
}));

const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));
(global as any).definePageMeta = vi.fn();

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: {
    props: ['title'],
    template: '<div><slot name="right" /></div>',
  },
  UBreadcrumb: { props: ['items'], template: '<nav />' },
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UAlert: {
    props: ['title'],
    template: '<div class="alert">{{ title }}</div>',
  },
  UIcon: true,
  HeaderActions: {
    name: 'HeaderActions',
    props: ['actions'],
    template: '<div />',
  },
  UserForm: {
    name: 'UserForm',
    props: ['user', 'isEditing', 'error', 'saving', 'canDelete'],
    emits: ['submit', 'delete'],
    template: '<div class="user-form" />',
  },
};

const userEnvelope = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: { user: { id: 2, username: 'jo', name: 'Jo Bloggs', ...over } },
});

const mountEdit = () => mount(UserEdit, { global: { stubs } });

beforeEach(() => {
  username = 'jo';
  currentUser = { username: 'jo', id: 1 };
  canManage = false;
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue(userEnvelope());
  toastAdd.mockReset();
});

describe('user edit page', () => {
  it('redirects to /settings when the viewer is neither self nor a manager', async () => {
    username = 'bob';
    currentUser = { username: 'jo', id: 1 };
    canManage = false;
    mountEdit();
    await flushPromises();

    expect(navigateTo).toHaveBeenCalledWith('/settings');
    expect(civicApiMock).not.toHaveBeenCalled();
  });

  it('fetches and renders the user form when editing yourself', async () => {
    username = 'jo';
    currentUser = { username: 'jo', id: 2 };
    const wrapper = mountEdit();
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/users/jo');
    const form = wrapper.findComponent({ name: 'UserForm' });
    expect(form.exists()).toBe(true);
    expect(form.props('user').username).toBe('jo');
  });

  it('lets a manager delete another user but not themselves', async () => {
    // manager editing someone else (ids differ) -> canDelete true
    username = 'bob';
    currentUser = { username: 'jo', id: 1 };
    canManage = true;
    civicApiMock.mockResolvedValue(userEnvelope({ id: 2, username: 'bob' }));
    const other = mountEdit();
    await flushPromises();
    expect(other.findComponent({ name: 'UserForm' }).props('canDelete')).toBe(
      true
    );

    // manager editing themselves (same id) -> canDelete false
    username = 'jo';
    currentUser = { username: 'jo', id: 2 };
    canManage = true;
    civicApiMock.mockResolvedValue(userEnvelope({ id: 2, username: 'jo' }));
    const self = mountEdit();
    await flushPromises();
    expect(self.findComponent({ name: 'UserForm' }).props('canDelete')).toBe(
      false
    );
  });

  it('shows the error state when the fetch fails', async () => {
    civicApiMock.mockReset();
    civicApiMock.mockRejectedValue(new Error('user boom'));
    const wrapper = mountEdit();
    await flushPromises();

    expect((wrapper.vm as any).error).toBe('user boom');
    expect(wrapper.find('.alert').text()).toContain('user boom');
  });

  it('PUTs on submit and shows a success toast', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    civicApiMock.mockClear();

    await wrapper
      .findComponent({ name: 'UserForm' })
      .vm.$emit('submit', { name: 'New Name' });
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/users/jo', {
      method: 'PUT',
      body: { name: 'New Name' },
    });
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'primary' })
    );
  });

  it('sets a form error when the update envelope is unsuccessful', async () => {
    const wrapper = mountEdit();
    await flushPromises();
    civicApiMock.mockReset();
    civicApiMock.mockResolvedValue({ success: false });

    await wrapper
      .findComponent({ name: 'UserForm' })
      .vm.$emit('submit', { name: 'x' });
    await flushPromises();

    expect((wrapper.vm as any).formError).toBeTruthy();
    expect(
      wrapper.findComponent({ name: 'UserForm' }).props('error')
    ).toBeTruthy();
  });

  it('DELETEs on delete and navigates back to the users list', async () => {
    canManage = true;
    username = 'bob';
    currentUser = { username: 'jo', id: 1 };
    civicApiMock.mockResolvedValue(userEnvelope({ id: 2, username: 'bob' }));
    const wrapper = mountEdit();
    await flushPromises();
    civicApiMock.mockClear();
    civicApiMock.mockResolvedValue(userEnvelope({ id: 2, username: 'bob' }));

    await wrapper.findComponent({ name: 'UserForm' }).vm.$emit('delete');
    await flushPromises();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/users/bob', {
      method: 'DELETE',
    });
    expect(navigateTo).toHaveBeenCalledWith('/settings/users');
  });
});
