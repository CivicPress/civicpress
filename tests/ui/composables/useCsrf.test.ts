import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCsrf } from '~/composables/useCsrf';

// useCsrf is client-guarded (import.meta.client) — the nuxtImportMeta plugin in
// vitest.config.ui.mjs rewrites that to true so the client code actually runs.
(global as any).useRuntimeConfig = vi.fn(() => ({
  public: { civicApiUrl: 'http://api.test' },
}));
const fetchMock = vi.fn();
(global as any).fetch = fetchMock;

const store = global.localStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  fetchMock.mockReset();
  store.getItem.mockReturnValue(null);
  store.setItem.mockReset();
  store.removeItem.mockReset();
});

describe('useCsrf', () => {
  it('reads the token from localStorage', () => {
    store.getItem.mockReturnValue('stored-tok');
    expect(useCsrf().getCsrfToken()).toBe('stored-tok');
    expect(store.getItem).toHaveBeenCalledWith('civic_csrf_token');
  });

  it('fetches, stores, and returns a fresh token', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ success: true, data: { token: 'fresh-tok' } }),
    });
    const tok = await useCsrf().fetchCsrfToken();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/auth/csrf-token'
    );
    expect(store.setItem).toHaveBeenCalledWith('civic_csrf_token', 'fresh-tok');
    expect(tok).toBe('fresh-tok');
  });

  it('returns null (and stores nothing) on an unsuccessful response', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: false }) });
    expect(await useCsrf().fetchCsrfToken()).toBeNull();
    expect(store.setItem).not.toHaveBeenCalled();
  });

  it('returns null when the fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(await useCsrf().fetchCsrfToken()).toBeNull();
  });

  it('ensureCsrfToken returns the existing token without fetching', async () => {
    store.getItem.mockReturnValue('existing-tok');
    expect(await useCsrf().ensureCsrfToken()).toBe('existing-tok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ensureCsrfToken fetches when nothing is stored', async () => {
    store.getItem.mockReturnValue(null);
    fetchMock.mockResolvedValue({
      json: async () => ({ success: true, data: { token: 'new-tok' } }),
    });
    expect(await useCsrf().ensureCsrfToken()).toBe('new-tok');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('clears the stored token', () => {
    useCsrf().clearCsrfToken();
    expect(store.removeItem).toHaveBeenCalledWith('civic_csrf_token');
  });
});
