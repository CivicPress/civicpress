import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRecordEditorActions } from '~/composables/useRecordEditorActions';

// Capture $civicApi + toast (the composable reads both at construction).
const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));
const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));

function makeDeps(
  formOverrides: Record<string, unknown> = {},
  propsOverrides: Record<string, unknown> = {}
) {
  const form = reactive({
    id: '',
    title: '',
    type: '',
    status: 'draft',
    workflowState: 'draft',
    markdownBody: 'Body text',
    metadata: {},
    tags: [],
    description: '',
    geography: null,
    attachedFiles: [],
    linkedRecords: [],
    linkedGeographyFiles: [],
    ...formOverrides,
  });
  const isDraft = ref(false);
  const autosave = { start: vi.fn(), stop: vi.fn() };
  const emit = vi.fn();
  const deps = {
    form,
    props: { isEditing: false, ...propsOverrides },
    emit,
    allowedTransitions: ref([]),
    isDraft,
    hasUnpublishedChanges: ref(false),
    autosave,
    lockComposable: () => null,
    autosaveStatus: ref('idle'),
    lastSaved: ref(null),
    recordAuthor: ref(''),
    recordUpdatedAt: ref(''),
    editorRef: ref(null),
    sidebarRef: ref(null),
    startAutosave: vi.fn(),
  };
  return { deps, form, isDraft, autosave, emit };
}

beforeEach(() => {
  civicApiMock.mockReset();
  civicApiMock.mockResolvedValue({ success: true, data: {} });
  toastAdd.mockReset();
});

describe('useRecordEditorActions', () => {
  it('handleSaveDraft rejects a record missing title/type without calling the API', async () => {
    const { deps } = makeDeps({ title: '', type: '' });
    const { handleSaveDraft } = useRecordEditorActions(deps as any);

    await handleSaveDraft();

    expect(civicApiMock).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
  });

  it('handleSaveDraft creates a new record, adopts its id, and navigates to edit', async () => {
    civicApiMock.mockResolvedValue({ success: true, data: { id: 'new-1' } });
    const { deps, form, isDraft } = makeDeps({ title: 'A Bylaw', type: 'bylaw' });
    const { handleSaveDraft } = useRecordEditorActions(deps as any);

    await handleSaveDraft();

    expect(civicApiMock).toHaveBeenCalledWith(
      '/api/v1/records',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ title: 'A Bylaw', type: 'bylaw' }),
      })
    );
    expect(form.id).toBe('new-1');
    expect(isDraft.value).toBe(true);
    expect(navigateTo).toHaveBeenCalledWith('/records/bylaw/new-1/edit');
  });

  it('handleSaveDraft updates an existing draft via PUT', async () => {
    // PUT then a ?edit=true refresh GET; both resolve.
    civicApiMock.mockImplementation((url: string) =>
      url.includes('?edit=true')
        ? Promise.resolve({ success: true, data: { author: 'me', updated_at: 't' } })
        : Promise.resolve({ success: true })
    );
    const { deps } = makeDeps(
      { id: 'r1', title: 'Edited', type: 'bylaw' },
      { isEditing: true }
    );
    const { handleSaveDraft } = useRecordEditorActions(deps as any);

    await handleSaveDraft();

    expect(civicApiMock).toHaveBeenCalledWith(
      '/api/v1/records/r1/draft',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('handlePublish publishes, clears draft state, stops autosave, and navigates to view', async () => {
    civicApiMock.mockResolvedValue({ success: true });
    const { deps, isDraft, autosave } = makeDeps({
      id: 'r1',
      type: 'bylaw',
      status: 'published',
    });
    const { handlePublish } = useRecordEditorActions(deps as any);

    await handlePublish();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/r1/publish', {
      method: 'POST',
      body: { status: 'published' },
    });
    expect(isDraft.value).toBe(false);
    expect(autosave.stop).toHaveBeenCalled();
    expect(navigateTo).toHaveBeenCalledWith('/records/bylaw/r1');
  });

  it('handlePublish refuses without a record id', async () => {
    const { deps } = makeDeps({ id: '' });
    const { handlePublish } = useRecordEditorActions(deps as any);

    await handlePublish();

    expect(civicApiMock).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' })
    );
  });

  it('handleDelete emits delete with the record id', () => {
    const { deps, emit } = makeDeps({}, { record: { id: 'r9' } });
    const { handleDelete } = useRecordEditorActions(deps as any);

    handleDelete();

    expect(emit).toHaveBeenCalledWith('delete', 'r9');
  });
});
