import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// useRecordDetail imports useAuthStore directly from '~/stores/auth'.
const { fakeStore } = vi.hoisted(() => ({
  fakeStore: { user: { username: 'test-user' }, hasPermission: () => true },
}));
vi.mock('~/stores/auth', () => ({ useAuthStore: () => fakeStore }));

import { useRecordDetail } from '~/composables/useRecordDetail';

const civicApiMock = vi.fn();
const routerPush = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));
(global as any).useRouter = vi.fn(() => ({ push: routerPush, replace: vi.fn() }));
(global as any).useMarkdown = vi.fn(() => ({
  renderMarkdown: (s: string) => s,
}));
(global as any).useRecordUtils = vi.fn(() => ({
  formatDate: (d: unknown) => String(d),
  getStatusColor: () => 'primary',
  getTypeIcon: () => 'i-lucide-file',
  getTypeLabel: (t: string) => t,
  getStatusLabel: (s: string) => s,
  getStatusIcon: () => 'i-lucide-file',
  getStatusConfig: () => ({}),
  normalizeDateString: (d: unknown) => d,
}));

function makeDetail(id = 'noise-control') {
  return useRecordDetail({
    type: 'bylaw',
    id,
    markdownContainer: ref(null),
    t: (k: string) => k,
  });
}

beforeEach(() => {
  civicApiMock.mockReset();
  routerPush.mockReset();
});

describe('useRecordDetail — fetchRecord', () => {
  it('loads the record and strips YAML frontmatter from the content', async () => {
    civicApiMock.mockResolvedValue({
      success: true,
      data: {
        id: 'noise-control',
        title: 'Noise Control',
        type: 'bylaw',
        status: 'published',
        content: '---\ntitle: Noise Control\n---\n\n# Noise Control\n\nBody.',
      },
    });
    const d = makeDetail();

    await d.fetchRecord();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/noise-control');
    expect(d.record.value?.title).toBe('Noise Control');
    expect(d.record.value?.content).not.toContain('---');
    expect(d.record.value?.content).toContain('# Noise Control');
    expect(d.error.value).toBe('');
    expect(d.loading.value).toBe(false);
  });

  it('sets error when the API responds unsuccessfully', async () => {
    civicApiMock.mockResolvedValue({ success: false });
    const d = makeDetail();

    await d.fetchRecord();

    expect(d.record.value).toBeNull();
    expect(d.error.value).toBeTruthy();
    expect(d.loading.value).toBe(false);
  });

  it('sets error when the API call throws', async () => {
    civicApiMock.mockRejectedValue(new Error('boom'));
    const d = makeDetail();

    await d.fetchRecord();

    expect(d.error.value).toBeTruthy();
  });
});

describe('useRecordDetail — handleContentClick (link navigation)', () => {
  it('intercepts an internal record link and routes via the router', () => {
    const d = makeDetail();
    const a = document.createElement('a');
    a.setAttribute('href', '/records/bylaw/other');
    a.setAttribute('data-record-link', 'true');
    document.body.appendChild(a);

    const evt = { target: a, preventDefault: vi.fn() } as unknown as MouseEvent;
    d.handleContentClick(evt);

    expect((evt as any).preventDefault).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith('/records/bylaw/other');
    a.remove();
  });

  it('leaves a non-record-link click alone (no router push)', () => {
    const d = makeDetail();
    const a = document.createElement('a');
    a.setAttribute('href', 'https://example.org');
    document.body.appendChild(a);

    const evt = { target: a, preventDefault: vi.fn() } as unknown as MouseEvent;
    d.handleContentClick(evt);

    expect(routerPush).not.toHaveBeenCalled();
    a.remove();
  });
});

describe('useRecordDetail — statusHistory', () => {
  it('normalizes heterogeneous status-history entry shapes and drops empty ones', async () => {
    civicApiMock.mockResolvedValue({
      success: true,
      data: {
        id: 'x',
        title: 'X',
        type: 'bylaw',
        status: 'published',
        content: 'body',
        metadata: {
          status_history: [
            { status: 'draft', by: 'alice', at: '2026-01-01' },
            { value: 'published', updated_by: 'bob', timestamp: '2026-02-01' },
            { name: '' }, // no status → filtered out
          ],
        },
      },
    });
    const d = makeDetail();
    await d.fetchRecord();

    const hist = d.statusHistory.value;
    expect(hist).toHaveLength(2);
    expect(hist[0]).toMatchObject({
      status: 'draft',
      user: 'alice',
      date: '2026-01-01',
    });
    expect(hist[1]).toMatchObject({
      status: 'published',
      user: 'bob',
      date: '2026-02-01',
    });
  });
});
