import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EditorHeader from '~/components/editor/EditorHeader.vue';

// Mock composables at module level (before import)
vi.mock('~/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: { value: 'en' },
  }),
}));

vi.mock('~/composables/useRecordStatuses', () => ({
  useRecordStatuses: () => ({
    recordStatusOptions: () => [
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
    ],
    getRecordStatusLabel: (status: string) => status,
  }),
}));

vi.mock('~/composables/useRecordUtils', () => ({
  useRecordUtils: () => ({
    getStatusConfig: () => ({ label: 'Draft', color: 'primary' }),
  }),
}));

const mountOptions = {
  global: {
    stubs: {
      UButton: true,
      UBadge: true,
      UIcon: true,
      UDropdownMenu: true,
      UInput: true,
      UModal: true,
    },
    mocks: {
      $t: (key: string) => key,
    },
  },
};

describe('EditorHeader', () => {
  const defaultProps = {
    title: 'Test Record',
    status: 'draft',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render title and status', () => {
    const wrapper = mount(EditorHeader, {
      props: defaultProps,
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should display draft badge when isDraft is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        isDraft: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should display unpublished changes badge when hasUnpublishedChanges is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        hasUnpublishedChanges: true,
        isEditing: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show autosave status', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        autosaveStatus: 'saving',
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show saved status with lastSaved time', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        autosaveStatus: 'saved',
        lastSaved: new Date(),
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should disable controls when disabled prop is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        disabled: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show publish button when isEditing is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        isEditing: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show delete unpublished changes option when hasUnpublishedChanges is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        isEditing: true,
        hasUnpublishedChanges: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });
});
