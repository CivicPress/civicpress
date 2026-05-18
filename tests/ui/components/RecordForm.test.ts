import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RecordForm from '~/components/RecordForm.vue';

// $civicApi mock controllable per test.
const civicApiMock = vi.fn();

beforeEach(() => {
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue({ success: true, data: {} });
});

(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

// Neutralize the record lock composable so edit-mode mounts don't issue
// background API calls. RecordForm imports it from `~/composables/useRecordLock`.
vi.mock('~/composables/useRecordLock', () => ({
  useRecordLock: () => ({
    lockInfo: { value: { locked: false, lockedBy: null } },
    isAcquiring: { value: false },
    error: { value: null },
    acquireLock: vi.fn().mockResolvedValue(true),
    releaseLock: vi.fn().mockResolvedValue(true),
    refreshLock: vi.fn().mockResolvedValue(true),
  }),
}));

// useAutosave is real but its `start()` is gated by props.isEditing + form.id;
// our tests deliberately stay in create mode or skip the autosave entry path.

const mountOptions = {
  global: {
    stubs: {
      // Editor sub-components (heavy) — render an empty div so RecordForm can
      // mount without pulling CodeMirror, RecordSidebar API calls, etc.
      EditorHeader: { template: '<div data-test="editor-header" />' },
      MarkdownEditor: {
        template: '<div data-test="markdown-editor" />',
        // Expose mock command methods so handleToolbarAction is callable.
        methods: {
          executeBold: vi.fn(),
          executeItalic: vi.fn(),
          executeCode: vi.fn(),
          executeHeading: vi.fn(),
          executeBulletList: vi.fn(),
          executeNumberedList: vi.fn(),
          executeBlockquote: vi.fn(),
          executeHorizontalRule: vi.fn(),
          executeLink: vi.fn(),
          executeImage: vi.fn(),
        },
      },
      EditorToolbar: { template: '<div data-test="editor-toolbar" />' },
      PreviewPanel: { template: '<div data-test="preview-panel" />' },
      RecordSidebar: { template: '<div data-test="record-sidebar" />' },

      // Nuxt UI primitives.
      UButton: true,
      UAlert: true,
      UInput: true,
      UModal: true,
      UIcon: true,
    },
  },
};

describe('RecordForm', () => {
  it('mounts in create mode with default form state', async () => {
    const wrapper = mount(RecordForm, {
      props: { record: null, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    expect(wrapper.exists()).toBe(true);
    const vm = wrapper.vm as any;
    expect(vm.form.title).toBe('');
    expect(vm.form.markdownBody).toBe('');
    expect(vm.form.status).toBe('draft');
    // Default type comes from useRecordTypes mock in tests/ui/setup.ts.
    expect(vm.form.type).toBe('bylaw');
  });

  it('respects recordType prop when creating', async () => {
    const wrapper = mount(RecordForm, {
      props: { record: null, isEditing: false, recordType: 'policy' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.form.type).toBe('policy');
  });

  it('loads record data from API in edit mode and populates form', async () => {
    civicApiMock.mockImplementation(async (url: string) => {
      if (url.includes('/transitions')) {
        return { success: true, data: { transitions: ['published'] } };
      }
      if (url.includes('?edit=true')) {
        return {
          success: true,
          data: {
            id: 'rec-1',
            title: 'Bylaw 42',
            type: 'bylaw',
            status: 'draft',
            workflowState: 'draft',
            markdownBody: '# Bylaw 42\n\nBody text.',
            metadata: { tags: ['safety'], description: 'desc' },
            isDraft: true,
            hasUnpublishedChanges: false,
          },
        };
      }
      return { success: true, data: {} };
    });

    const wrapper = mount(RecordForm, {
      props: {
        record: { id: 'rec-1', title: 'old', type: 'bylaw', status: 'draft' } as any,
        isEditing: true,
      },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    // Title is extracted from H1 in markdownBody.
    expect(vm.form.title).toBe('Bylaw 42');
    expect(vm.form.markdownBody).toContain('Body text.');
    expect(vm.form.id).toBe('rec-1');
    expect(vm.form.metadata.tags).toContain('safety');
  });

  it('emits "delete" with record id when handleDelete is invoked', async () => {
    const wrapper = mount(RecordForm, {
      props: {
        record: { id: 'rec-7', title: 'gone', type: 'bylaw', status: 'draft' } as any,
        isEditing: true,
        canDelete: true,
      },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.handleDelete();

    expect(wrapper.emitted('delete')).toBeTruthy();
    expect(wrapper.emitted('delete')![0]).toEqual(['rec-7']);
  });

  it('handleSaveDraft shows validation toast when title is missing', async () => {
    const toastAdd = vi.fn();
    (global as any).useToast = vi.fn(() => ({ add: toastAdd }));

    const wrapper = mount(RecordForm, {
      props: { record: null, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.title = '';
    vm.form.type = 'bylaw';

    await vm.handleSaveDraft();
    await flushPromises();

    expect(toastAdd).toHaveBeenCalled();
    const call = toastAdd.mock.calls.find((c: any[]) =>
      /required/i.test(c[0]?.description || '')
    );
    expect(call).toBeTruthy();
    // No POST should have fired because validation short-circuited.
    expect(civicApiMock).not.toHaveBeenCalledWith(
      '/api/v1/records',
      expect.any(Object)
    );
  });

  it('handleSaveDraft POSTs a new record when in create mode with valid input', async () => {
    civicApiMock.mockImplementation(async (url: string, opts: any) => {
      if (url === '/api/v1/records' && opts?.method === 'POST') {
        return {
          success: true,
          data: { id: 'new-rec', type: opts.body.type, title: opts.body.title },
        };
      }
      return { success: true, data: {} };
    });

    const wrapper = mount(RecordForm, {
      props: { record: null, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.title = 'New Motion';
    vm.form.type = 'bylaw';
    vm.form.markdownBody = 'Body content';

    await vm.handleSaveDraft();
    await flushPromises();

    const postCall = civicApiMock.mock.calls.find(
      ([url, opts]) => url === '/api/v1/records' && opts?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const body = (postCall as any)[1].body;
    expect(body.title).toBe('New Motion');
    expect(body.type).toBe('bylaw');
    // markdown is prepended with title as H1.
    expect(body.content).toContain('# New Motion');
    expect(body.content).toContain('Body content');
  });

  it('exposes form, handleSaveDraft, handlePublish via defineExpose', async () => {
    const wrapper = mount(RecordForm, {
      props: { record: null, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.form).toBeDefined();
    expect(typeof vm.handleSaveDraft).toBe('function');
    expect(typeof vm.handlePublish).toBe('function');
  });

  it('renders editor sub-components in the template', async () => {
    const wrapper = mount(RecordForm, {
      props: { record: null, isEditing: false },
      ...mountOptions,
    });
    await flushPromises();

    expect(wrapper.find('[data-test="editor-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-toolbar"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="markdown-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="record-sidebar"]').exists()).toBe(true);
  });
});
