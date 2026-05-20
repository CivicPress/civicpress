/**
 * Phase 2d W2-T14 — FileBrowser.vue characterization tests
 *
 * The original 1,156 LoC `FileBrowser.vue` was decomposed (W2-T14) into:
 *   - FileBrowser.vue (320 LoC shell)
 *   - file-browser/FileBrowserToolbar.vue
 *   - file-browser/FileBrowserList.vue
 *   - file-browser/FileBrowserModals.vue
 *   - composables/useFileBrowser.ts (extracted helpers + actions)
 *
 * Pre-W2 the component had zero direct test coverage. This file pins the
 * extracted composable's behavior so any future tweak to it can't silently
 * break what consumers of FileBrowser depend on.
 *
 * What this pins:
 * 1. Pure helpers — getFileIcon, getFileIconColor, formatFileSize,
 *    formatDate, canPreview (mime-type → icon/color/preview decisions are
 *    the only "policy" in the composable; regressions here are silent)
 * 2. Selection state machine — selectFile, toggleFileSelection,
 *    clearSelection: toggle-on-second-call semantics, idempotency of clear
 * 3. Modal-open helpers — openPreview, openDeleteModal, openBulkDeleteModal:
 *    set the right ref values; bulk-delete is gated on selectedFiles.length
 * 4. debouncedSearch resets currentPage to 1 (a subtle UX contract that's
 *    easy to break if the function is moved)
 *
 * Out of scope (covered by upstream tests / integration via the running app):
 * - loadFiles / downloadFile / confirmDeleteFile / confirmBulkDelete (network)
 * - handleUploadComplete / handleUploadError (toast wiring)
 * - copyToClipboard (clipboard API)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import {
  useFileBrowser,
  type FileInfo,
  type UseFileBrowserDeps,
} from '~/composables/useFileBrowser';

function makeDeps(overrides: Partial<UseFileBrowserDeps> = {}): UseFileBrowserDeps {
  return {
    props: { folder: 'documents' },
    loading: ref(false),
    files: ref<FileInfo[]>([]),
    selectedFiles: ref<string[]>([]),
    previewFile: ref<FileInfo | null>(null),
    fileToDelete: ref<FileInfo | null>(null),
    showUploadModal: ref(false),
    showPreviewModal: ref(false),
    showDeleteModal: ref(false),
    showBulkDeleteModal: ref(false),
    deleting: ref(false),
    currentPage: ref(1),
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    id: 'uuid-1',
    name: 'document.pdf',
    size: 1024,
    mime_type: 'application/pdf',
    path: 'documents/document.pdf',
    url: '/api/v1/storage/files/uuid-1',
    created: '2026-05-20T10:00:00Z',
    modified: '2026-05-20T10:00:00Z',
    ...overrides,
  };
}

describe('useFileBrowser pure helpers — file icon + color (W2-T14 characterization)', () => {
  let api: ReturnType<typeof useFileBrowser>;

  beforeEach(() => {
    api = useFileBrowser(makeDeps());
  });

  it('maps image/* to image icon + blue', () => {
    expect(api.getFileIcon('image/png')).toBe('i-lucide-image');
    expect(api.getFileIconColor('image/png')).toBe('text-blue-500');
  });

  it('maps video/* to video icon + purple', () => {
    expect(api.getFileIcon('video/mp4')).toBe('i-lucide-video');
    expect(api.getFileIconColor('video/mp4')).toBe('text-purple-500');
  });

  it('maps audio/* to music icon + green', () => {
    expect(api.getFileIcon('audio/mpeg')).toBe('i-lucide-music');
    expect(api.getFileIconColor('audio/mpeg')).toBe('text-green-500');
  });

  it('maps PDFs to file-text icon + red', () => {
    expect(api.getFileIcon('application/pdf')).toBe('i-lucide-file-text');
    expect(api.getFileIconColor('application/pdf')).toBe('text-red-500');
  });

  it('maps word/document mimes to file-text icon + blue-600', () => {
    expect(api.getFileIcon('application/msword')).toBe('i-lucide-file-text');
    expect(
      api.getFileIcon(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe('i-lucide-file-text');
    expect(api.getFileIconColor('application/msword')).toBe('text-blue-600');
  });

  it('maps the legacy excel mime to file-spreadsheet icon + green-600', () => {
    expect(api.getFileIcon('application/vnd.ms-excel')).toBe(
      'i-lucide-file-spreadsheet'
    );
    expect(api.getFileIconColor('application/vnd.ms-excel')).toBe(
      'text-green-600'
    );
  });

  it('pins the current document-branch precedence: openxml .xlsx falls into the word/document case because the mime contains "document" (checked before "spreadsheet")', () => {
    // Surfaces a real quirk worth fixing later: .xlsx files render with the
    // Word icon/color because the document-branch runs first. Pinning the
    // current behavior so a later reorder doesn't silently change icons.
    expect(
      api.getFileIcon(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ).toBe('i-lucide-file-text');
    expect(
      api.getFileIconColor(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ).toBe('text-blue-600');
  });

  it('falls back to generic file icon + gray for unrecognized mime', () => {
    expect(api.getFileIcon('application/x-tar')).toBe('i-lucide-file');
    expect(api.getFileIconColor('application/x-tar')).toBe('text-gray-500');
  });
});

describe('useFileBrowser pure helpers — canPreview (W2-T14 characterization)', () => {
  const api = useFileBrowser(makeDeps());

  it('returns true for images, videos, audio, and PDFs', () => {
    expect(api.canPreview(makeFile({ mime_type: 'image/jpeg' }))).toBe(true);
    expect(api.canPreview(makeFile({ mime_type: 'video/mp4' }))).toBe(true);
    expect(api.canPreview(makeFile({ mime_type: 'audio/ogg' }))).toBe(true);
    expect(api.canPreview(makeFile({ mime_type: 'application/pdf' }))).toBe(
      true
    );
  });

  it('returns false for spreadsheets, archives, and other generic types', () => {
    expect(
      api.canPreview(makeFile({ mime_type: 'application/vnd.ms-excel' }))
    ).toBe(false);
    expect(
      api.canPreview(makeFile({ mime_type: 'application/x-tar' }))
    ).toBe(false);
    expect(api.canPreview(makeFile({ mime_type: 'text/plain' }))).toBe(false);
  });

  it('is case-insensitive on the mime-type prefix', () => {
    expect(api.canPreview(makeFile({ mime_type: 'IMAGE/PNG' }))).toBe(true);
  });
});

describe('useFileBrowser pure helpers — formatFileSize (W2-T14 characterization)', () => {
  const api = useFileBrowser(makeDeps());

  it('returns "0 B" for 0 bytes', () => {
    expect(api.formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes under 1 KiB without scaling', () => {
    expect(api.formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes, megabytes, gigabytes with 2-decimal precision', () => {
    expect(api.formatFileSize(1024)).toBe('1 KB');
    expect(api.formatFileSize(1536)).toBe('1.5 KB');
    expect(api.formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(api.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('drops trailing zeros via parseFloat (1.50 → 1.5)', () => {
    expect(api.formatFileSize(1024 * 1.5)).toBe('1.5 KB');
  });
});

describe('useFileBrowser pure helpers — formatDate (W2-T14 characterization)', () => {
  const api = useFileBrowser(makeDeps());

  it('forwards to Date.toLocaleDateString', () => {
    const iso = '2026-05-20T14:30:00Z';
    expect(api.formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
  });
});

describe('useFileBrowser selection state machine (W2-T14 characterization)', () => {
  it('selectFile adds the file path on first call, removes on second (toggle)', () => {
    const deps = makeDeps();
    const api = useFileBrowser(deps);
    const file = makeFile({ path: 'documents/a.pdf' });

    api.selectFile(file);
    expect(deps.selectedFiles.value).toEqual(['documents/a.pdf']);

    api.selectFile(file);
    expect(deps.selectedFiles.value).toEqual([]);
  });

  it('toggleFileSelection delegates to selectFile (same semantics)', () => {
    const deps = makeDeps();
    const api = useFileBrowser(deps);
    const file = makeFile({ path: 'documents/b.png' });

    api.toggleFileSelection(file);
    expect(deps.selectedFiles.value).toEqual(['documents/b.png']);

    api.toggleFileSelection(file);
    expect(deps.selectedFiles.value).toEqual([]);
  });

  it('clearSelection empties selectedFiles and is idempotent', () => {
    const deps = makeDeps({
      selectedFiles: ref(['documents/a.pdf', 'documents/b.png']),
    });
    const api = useFileBrowser(deps);

    api.clearSelection();
    expect(deps.selectedFiles.value).toEqual([]);

    api.clearSelection();
    expect(deps.selectedFiles.value).toEqual([]);
  });
});

describe('useFileBrowser modal helpers (W2-T14 characterization)', () => {
  it('openPreview sets previewFile + showPreviewModal=true', () => {
    const deps = makeDeps();
    const api = useFileBrowser(deps);
    const file = makeFile({ id: 'preview-target' });

    api.openPreview(file);

    expect(deps.previewFile.value?.id).toBe('preview-target');
    expect(deps.showPreviewModal.value).toBe(true);
  });

  it('openDeleteModal sets fileToDelete + showDeleteModal=true', () => {
    const deps = makeDeps();
    const api = useFileBrowser(deps);
    const file = makeFile({ id: 'delete-target' });

    api.openDeleteModal(file);

    expect(deps.fileToDelete.value?.id).toBe('delete-target');
    expect(deps.showDeleteModal.value).toBe(true);
  });

  it('openBulkDeleteModal is a no-op when no files are selected', () => {
    const deps = makeDeps({ selectedFiles: ref([]) });
    const api = useFileBrowser(deps);

    api.openBulkDeleteModal();

    expect(deps.showBulkDeleteModal.value).toBe(false);
  });

  it('openBulkDeleteModal sets showBulkDeleteModal=true when files are selected', () => {
    const deps = makeDeps({ selectedFiles: ref(['documents/a.pdf']) });
    const api = useFileBrowser(deps);

    api.openBulkDeleteModal();

    expect(deps.showBulkDeleteModal.value).toBe(true);
  });
});

describe('useFileBrowser debouncedSearch — page reset (W2-T14 characterization)', () => {
  it('resets currentPage to 1 regardless of starting page', () => {
    const deps = makeDeps({ currentPage: ref(5) });
    const api = useFileBrowser(deps);

    api.debouncedSearch();

    expect(deps.currentPage.value).toBe(1);
  });
});
