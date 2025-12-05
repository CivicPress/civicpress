import { ref, watch, onUnmounted, getCurrentInstance } from 'vue';
import { useDebounceFn } from '@vueuse/core';

interface AutosaveOptions {
  debounceMs?: number;
  onSave: (data: any) => Promise<void>;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export function useAutosave<T>(data: T, options: AutosaveOptions) {
  const { debounceMs = 2000, onSave, onError, enabled = true } = options;

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
