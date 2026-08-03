import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// The generic /records/new create page: a thin RecordForm wrapper (role-gated,
// seeded from ?type=), no API. RecordForm + SystemFooter are explicitly imported.
vi.mock('~/components/RecordForm.vue', () => ({
  default: {
    name: 'RecordForm',
    props: ['recordType', 'isEditing', 'saving', 'error'],
    template: '<div class="record-form" />',
  },
}));
vi.mock('~/components/SystemFooter.vue', () => ({
  default: { name: 'SystemFooter', template: '<footer />' },
}));

import NewRecord from '~/pages/records/new.vue';

let query: Record<string, string> = {};
(global as any).useRoute = vi.fn(() => ({ query }));

let role: string | undefined = 'admin';
(global as any).useAuthStore = vi.fn(() => ({
  currentUser: role ? { role } : undefined,
}));

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: {
    template: '<div><slot name="title" /><slot name="description" /></div>',
  },
  UBreadcrumb: { props: ['items'], template: '<nav />' },
  UAlert: {
    props: ['title', 'description'],
    template: '<div class="alert">{{ title }} {{ description }}</div>',
  },
};

const mountOptions = { global: { stubs } };

beforeEach(() => {
  query = {};
  role = 'admin';
});

describe('records new (generic create) page', () => {
  it('seeds RecordForm from ?type= for an authorized user', () => {
    query = { type: 'resolution' };
    const wrapper = mount(NewRecord, mountOptions);
    const form = wrapper.findComponent({ name: 'RecordForm' });
    expect(form.exists()).toBe(true);
    expect(form.props('recordType')).toBe('resolution');
    expect(form.props('isEditing')).toBe(false);
  });

  it('passes a null record type when no ?type= is present', () => {
    const wrapper = mount(NewRecord, mountOptions);
    expect(
      wrapper.findComponent({ name: 'RecordForm' }).props('recordType')
    ).toBe(null);
  });

  it('allows a clerk', () => {
    role = 'clerk';
    const wrapper = mount(NewRecord, mountOptions);
    expect(wrapper.findComponent({ name: 'RecordForm' }).exists()).toBe(true);
  });

  it('shows access-denied and no form for a non-privileged role', () => {
    role = 'public';
    const wrapper = mount(NewRecord, mountOptions);
    expect(wrapper.findComponent({ name: 'RecordForm' }).exists()).toBe(false);
    expect(wrapper.text()).toContain('records.accessDenied');
  });
});
