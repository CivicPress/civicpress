import { ref, watch, onUnmounted, getCurrentInstance } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { useNuxtApp } from '#app';

interface AutosaveOptions {
  debounceMs?: number;
  onSave: (data: any) => Promise<void>;
  onError?: (error: Error) => void;
  enabled?: boolean;
  /**
   * When true, collaborative mode is enabled and Yjs handles real-time sync.
   * Autosave will trigger periodic snapshots instead of full saves.
   */
  collaborativeMode?: boolean;
  /**
   * Record ID required for collaborative mode to trigger snapshots.
   */
  recordId?: string;
  /**
   * Interval in milliseconds for snapshot triggers in collaborative mode.
   * Defaults to 60000 (1 minute).
   */
  snapshotIntervalMs?: number;
}

export function useAutosave<T>(data: T, options: AutosaveOptions) {
  const {
    debounceMs = 2000,
    onSave,
    onError,
    enabled = true,
    collaborativeMode = false,
    recordId,
    snapshotIntervalMs = 60000,
  } = options;

  // In collaborative mode, Yjs handles real-time sync.
  // Autosave triggers periodic snapshots instead of full saves.
  if (collaborativeMode) {
    const $civicApi = useNuxtApp().$civicApi;
    const isSaving = ref(false);
    const lastSaved = ref<Date | null>(null);
    const error = ref<Error | null>(null);
    let snapshotInterval: ReturnType<typeof setInterval> | null = null;

    const triggerSnapshot = async () => {
      if (!recordId) {
        console.warn(
          'useAutosave: recordId required for collaborative mode snapshots'
        );
        return;
      }

      isSaving.value = true;
      error.value = null;

      try {
        await $civicApi(`/api/v1/records/${recordId}/snapshot`, {
          method: 'POST',
        });
        lastSaved.value = new Date();
      } catch (err) {
        const snapshotError =
          err instanceof Error ? err : new Error(String(err));
        error.value = snapshotError;
        console.error('Failed to trigger snapshot:', err);
        if (onError) {
          onError(snapshotError);
        }
      } finally {
        isSaving.value = false;
      }
    };

    const start = () => {
      if (snapshotInterval) return;
      // Trigger initial snapshot after a short delay
      setTimeout(triggerSnapshot, 5000);
      // Then schedule periodic snapshots
      snapshotInterval = setInterval(triggerSnapshot, snapshotIntervalMs);
    };

    const stop = () => {
      if (snapshotInterval) {
        clearInterval(snapshotInterval);
        snapshotInterval = null;
      }
    };

    // Cleanup on unmount (only if in component context)
    const instance = getCurrentInstance();
    if (instance) {
      onUnmounted(() => {
        stop();
      });
    }

    return {
      isSaving,
      lastSaved,
      error,
      save: triggerSnapshot,
      start,
      stop,
    };
  }

  const isSaving = ref(false);
  const lastSaved = ref<Date | null>(null);
  const error = ref<Error | null>(null);
  const retryCount = ref(0);
  const maxRetries = 3;

  const save = async (value: T) => {
    if (!enabled) return;

    isSaving.value = true;
    error.value = null;

    try {
      await onSave(value);
      lastSaved.value = new Date();
      retryCount.value = 0;
    } catch (err) {
      const saveError = err instanceof Error ? err : new Error(String(err));
      error.value = saveError;

      // Retry with exponential backoff
      if (retryCount.value < maxRetries) {
        retryCount.value++;
        const delay = Math.pow(2, retryCount.value) * 1000; // 2s, 4s, 8s
        setTimeout(() => {
          save(value);
        }, delay);
      } else {
        if (onError) {
          onError(saveError);
        }
      }
    } finally {
      isSaving.value = false;
    }
  };

  const debouncedSave = useDebounceFn(save, debounceMs);

  // Watch for changes and autosave
  let stopWatcher: (() => void) | null = null;

  const start = () => {
    if (!enabled) return;
    stopWatcher = watch(
      () => data,
      (newValue) => {
        debouncedSave(newValue);
      },
      { deep: true }
    );
  };

  const stop = () => {
    if (stopWatcher) {
      stopWatcher();
      stopWatcher = null;
    }
  };

  // Manual save
  const saveNow = async () => {
    await save(data);
  };

  // Cleanup on unmount (only if in component context)
  const instance = getCurrentInstance();
  if (instance) {
    onUnmounted(() => {
      stop();
    });
  }

  return {
    isSaving,
    lastSaved,
    error,
    save: saveNow,
    start,
    stop,
  };
}
