import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRecordLock } from '~/composables/useRecordLock';

// useRecordLock imports useNuxtApp from '#app', which the config aliases to the
// nuxt-imports shim — the shim delegates to global.useNuxtApp, so overriding it
// here controls $civicApi. setup.ts shims useAuthStore().user.username.
const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

// Called outside a component → getCurrentInstance() is null, so the
// onMounted/onUnmounted auto-acquire/release never runs and each method can be
// exercised in isolation.

beforeEach(() => {
  civicApiMock.mockReset();
});

describe('useRecordLock', () => {
  it('acquires the lock and reflects status via checkLock', async () => {
    civicApiMock.mockImplementation((_url: string, opts?: { method?: string }) => {
      if (opts?.method === 'POST') return Promise.resolve({ success: true });
      return Promise.resolve({
        success: true,
        data: { locked: true, lockedBy: 'test-user', lockedAt: 't', expiresAt: 'e' },
      });
    });
    const onLockAcquired = vi.fn();
    const lock = useRecordLock({ recordId: 'r1', onLockAcquired });

    const ok = await lock.acquireLock();

    expect(ok).toBe(true);
    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/r1/lock', {
      method: 'POST',
    });
    expect(lock.lockInfo.value.locked).toBe(true);
    expect(lock.lockInfo.value.lockedBy).toBe('test-user');
    expect(onLockAcquired).toHaveBeenCalled();
    expect(lock.isAcquiring.value).toBe(false);
  });

  it('handles a 409 conflict by recording who holds the lock', async () => {
    civicApiMock.mockRejectedValue({
      statusCode: 409,
      data: { lockedBy: 'someone-else', lockedAt: 't', expiresAt: 'e' },
    });
    const onLockError = vi.fn();
    const lock = useRecordLock({ recordId: 'r1', onLockError });

    const ok = await lock.acquireLock();

    expect(ok).toBe(false);
    expect(lock.lockInfo.value).toMatchObject({
      locked: true,
      lockedBy: 'someone-else',
    });
    expect(lock.error.value).toBeInstanceOf(Error);
    expect(onLockError).toHaveBeenCalled();
  });

  it('releases the lock and clears local state', async () => {
    civicApiMock.mockResolvedValue({ success: true });
    const lock = useRecordLock({ recordId: 'r1' });
    lock.lockInfo.value = {
      locked: true,
      lockedBy: 'test-user',
      lockedAt: 't',
      expiresAt: 'e',
    };

    await lock.releaseLock();

    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/r1/lock', {
      method: 'DELETE',
    });
    expect(lock.lockInfo.value.locked).toBe(false);
    expect(lock.lockInfo.value.lockedBy).toBeNull();
  });

  it('fires onLockLost when a lock held by me disappears', async () => {
    civicApiMock.mockResolvedValue({
      success: true,
      data: { locked: false, lockedBy: null },
    });
    const onLockLost = vi.fn();
    const lock = useRecordLock({ recordId: 'r1', onLockLost });
    // Pretend we currently hold it.
    lock.lockInfo.value = {
      locked: true,
      lockedBy: 'test-user',
      lockedAt: 't',
      expiresAt: 'e',
    };

    await lock.checkLock();

    expect(lock.lockInfo.value.locked).toBe(false);
    expect(onLockLost).toHaveBeenCalled();
  });

  it('refreshLock is a no-op unless the lock is currently held', async () => {
    civicApiMock.mockResolvedValue({ success: true, data: { locked: true } });
    const lock = useRecordLock({ recordId: 'r1' });

    // Not held → no request.
    await lock.refreshLock();
    expect(civicApiMock).not.toHaveBeenCalled();

    // Held → POST (extend) then checkLock (GET).
    lock.lockInfo.value = {
      locked: true,
      lockedBy: 'test-user',
      lockedAt: 't',
      expiresAt: 'e',
    };
    await lock.refreshLock();
    expect(civicApiMock).toHaveBeenCalledWith('/api/v1/records/r1/lock', {
      method: 'POST',
    });
  });
});
