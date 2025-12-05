import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { useNuxtApp } from '#app';

interface LockInfo {
  locked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  expiresAt: string | null;
}

interface UseRecordLockOptions {
  recordId: string;
  lockDurationMinutes?: number;
  pollIntervalMs?: number;
  onLockAcquired?: () => void;
  onLockLost?: () => void;
  onLockError?: (error: Error) => void;
}

export function useRecordLock(options: UseRecordLockOptions) {
  const {
    recordId,
    lockDurationMinutes = 30,
    pollIntervalMs = 30000, // 30 seconds
    onLockAcquired,
    onLockLost,
    onLockError,
  } = options;

  const lockInfo = ref<LockInfo>({
    locked: false,
    lockedBy: null,
    lockedAt: null,
    expiresAt: null,
  });

  const isAcquiring = ref(false);
  const error = ref<Error | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  const $civicApi = useNuxtApp().$civicApi;

  // Acquire lock
  const acquireLock = async () => {
    if (!recordId) return false;

    isAcquiring.value = true;
    error.value = null;

    try {
      const response = (await $civicApi(`/api/v1/records/${recordId}/lock`, {
        method: 'POST',
      })) as any;

      if (response?.success) {
        await checkLock();
        if (onLockAcquired) {
          onLockAcquired();
        }
        return true;
      }
      return false;
    } catch (err) {
      const lockError = err instanceof Error ? err : new Error(String(err));
      error.value = lockError;

      // Check if it's a lock conflict
      if ((err as any)?.statusCode === 409) {
        const lockData = (err as any)?.data;
        if (lockData) {
          lockInfo.value = {
            locked: true,
            lockedBy: lockData.lockedBy || null,
            lockedAt: lockData.lockedAt || null,
            expiresAt: lockData.expiresAt || null,
          };
        }
      }

      if (onLockError) {
        onLockError(lockError);
      }
      return false;
    } finally {
      isAcquiring.value = false;
    }
  };

  // Release lock
  const releaseLock = async () => {
    if (!recordId) return;

    try {
      await $civicApi(`/api/v1/records/${recordId}/lock`, {
        method: 'DELETE',
      });

      lockInfo.value = {
        locked: false,
        lockedBy: null,
        lockedAt: null,
        expiresAt: null,
      };
    } catch (err) {
      console.error('Failed to release lock:', err);
    }
  };

  // Check lock status
  const checkLock = async () => {
    if (!recordId) return;

    try {
      const response = (await $civicApi(
        `/api/v1/records/${recordId}/lock`
      )) as any;

      if (response?.success && response?.data) {
        const data = response.data;
        const wasLocked = lockInfo.value.locked;
        const authStore = useAuthStore();
        const wasLockedByMe =
          lockInfo.value.lockedBy ===
          (authStore.user?.username || authStore.user?.id?.toString());

        lockInfo.value = {
          locked: data.locked || false,
          lockedBy: data.lockedBy,
          lockedAt: data.lockedAt,
          expiresAt: data.expiresAt,
        };

        // Check if we lost the lock
        if (wasLocked && wasLockedByMe && !data.locked) {
          if (onLockLost) {
            onLockLost();
          }
        }
      }
    } catch (err) {
      console.error('Failed to check lock:', err);
    }
  };

  // Refresh lock (extend expiration)
  const refreshLock = async () => {
    if (!recordId || !lockInfo.value.locked) return;

    try {
      await $civicApi(`/api/v1/records/${recordId}/lock`, {
        method: 'POST',
      });
      await checkLock();
    } catch (err) {
      console.error('Failed to refresh lock:', err);
    }
  };

  // Start polling for lock status
  const startPolling = () => {
    if (pollInterval) return;

    pollInterval = setInterval(() => {
      checkLock();
    }, pollIntervalMs);
  };

  // Stop polling
  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  // Start refreshing lock
  const startRefreshing = () => {
    if (refreshInterval) return;

    refreshInterval = setInterval(() => {
      refreshLock();
    }, pollIntervalMs);
  };

  // Stop refreshing
  const stopRefreshing = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };

  // Initialize on mount (only if in component context)
  const instance = getCurrentInstance();
  if (instance) {
    onMounted(async () => {
      await acquireLock();
      startPolling();
      startRefreshing();
    });

    // Cleanup on unmount
    onUnmounted(async () => {
      stopPolling();
      stopRefreshing();
      await releaseLock();
    });
  }

  return {
    lockInfo,
    isAcquiring,
    error,
    acquireLock,
    releaseLock,
    checkLock,
    refreshLock,
    startPolling,
    stopPolling,
  };
}
