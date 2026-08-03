import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

/**
 * EditorAttachments now offers a real drag-and-drop / click upload (via the
 * reused FileUpload dropzone) in addition to linking existing storage files.
 * These tests pin the upload wiring: the dropzone targets the record-type
 * folder (public fallback), uploaded files are mapped into the record's
 * attachment shape and emitted, and the dropzone is hidden while the record is
 * locked (disabled). FileUpload / FileBrowserPopover and the i18n + attachment-
 * type composables are stubbed so we exercise EditorAttachments in isolation.
 */
vi.mock('~/composables/useTypedI18n', () => ({
  useTypedI18n: () => ({
    t: (k: string) => k,
    tPlural: (k: string, n: number) => `${k}:${n}`,
  }),
}));

vi.mock('~/composables/useAttachmentTypes', () => ({
  useAttachmentTypes: () => ({
    getAttachmentTypeOptions: () => [
      { label: 'Reference', value: 'reference' },
    ],
    fetchAttachmentTypes: vi.fn(),
  }),
}));

// Inline stub inside the (hoisted) factory — a top-level const would be
// referenced before initialization. Tests locate it by component name.
vi.mock('~/components/storage/FileUpload.vue', () => ({
  default: {
    name: 'FileUpload',
    props: ['folder', 'multiple'],
    emits: ['upload-complete', 'upload-error'],
    template: '<div class="file-upload-stub" :data-folder="folder"></div>',
  },
}));
vi.mock('~/components/storage/FileBrowserPopover.vue', () => ({
  default: { name: 'FileBrowserPopover', template: '<div />' },
}));

import EditorAttachments from '~/components/editor/EditorAttachments.vue';

const mountAttachments = (props: Record<string, unknown> = {}) =>
  mount(EditorAttachments, {
    props: { attachedFiles: [], ...props },
    global: {
      stubs: {
        UPopover: { template: '<div><slot /><slot name="content" /></div>' },
        UButton: true,
        UFormField: { template: '<div><slot /></div>' },
        USelectMenu: true,
        UInput: true,
        UIcon: true,
      },
    },
  });

const findUpload = (wrapper: ReturnType<typeof mountAttachments>) =>
  wrapper.findComponent({ name: 'FileUpload' });

describe('EditorAttachments — upload', () => {
  it('renders the upload dropzone targeting the record-type folder', () => {
    const wrapper = mountAttachments({ recordType: 'bylaw' });
    const upload = findUpload(wrapper);
    expect(upload.exists()).toBe(true);
    expect(upload.props('folder')).toBe('bylaw');
  });

  it('falls back to the public folder when no record type is given', () => {
    const wrapper = mountAttachments({});
    expect(findUpload(wrapper).props('folder')).toBe('public');
  });

  it('attaches uploaded files mapped into the record attachment shape', async () => {
    const wrapper = mountAttachments({
      attachedFiles: [],
      recordType: 'bylaw',
    });
    findUpload(wrapper).vm.$emit('upload-complete', [
      {
        id: 'uuid-1',
        name: 'plan.pdf',
        size: 10,
        type: 'application/pdf',
        url: 'http://x/uuid-1',
        path: 'bylaw/plan.pdf',
      },
    ]);
    await nextTick();

    const emitted = wrapper.emitted('update:attachedFiles');
    expect(emitted).toBeTruthy();
    const files = emitted![emitted!.length - 1][0];
    expect(files).toEqual([
      {
        id: 'uuid-1',
        path: 'bylaw/plan.pdf',
        original_name: 'plan.pdf',
        description: '',
        category: 'reference',
      },
    ]);
  });

  it('appends uploads to any already-attached files', async () => {
    const existing = [
      {
        id: 'old',
        path: 'public/old.md',
        original_name: 'old.md',
        description: '',
        category: 'reference',
      },
    ];
    const wrapper = mountAttachments({ attachedFiles: existing });
    findUpload(wrapper).vm.$emit('upload-complete', [
      {
        id: 'new',
        name: 'new.png',
        size: 1,
        type: 'image/png',
        url: 'u',
        path: 'public/new.png',
      },
    ]);
    await nextTick();

    const emitted = wrapper.emitted('update:attachedFiles');
    const files = emitted![emitted!.length - 1][0] as Array<{ id: string }>;
    expect(files.map((f) => f.id)).toEqual(['old', 'new']);
  });

  it('hides the dropzone when disabled and shows the empty note', () => {
    const wrapper = mountAttachments({ disabled: true, attachedFiles: [] });
    expect(findUpload(wrapper).exists()).toBe(false);
    expect(wrapper.text()).toContain('records.attachments.noFilesAttached');
  });
});
