import { ref, watch, onUnmounted, getCurrentInstance } from 'vue';
import { useDebounceFn } from '@vueuse/core';

interface AutosaveOptions {
  debounceMs?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: any) => Promise<void>;
  onError?: (error: Error) => void;
  enabled?: boolean;
  /**
   * When true, the deep watcher does NOT fire the debounced save on data
   * changes. Saving is still callable via the returned `save()` (explicit)
   * and `saveOnBlur()` (editor blur).
   *
   * Rationale (spec §5.4): in collaborative editing the realtime server owns
   * periodic Markdown writeback (RecordRoomHandler.snapshot), so per-keystroke
   * client autosave would race PUTs across collaborators. In collab mode the
   * client autosave shifts from the primary path to a defense-in-depth backstop
   * triggered on blur and on explicit save.
   */
  collaborativeMode?: boolean;
}

export function useAutosave<T>(data: T, options: AutosaveOptions) {
  const {
    debounceMs = 2000,
    onSave,
    onError,
    enabled = true,
    collaborativeMode = false,
  } = options;

  const isSaving = ref(false);
  const lastSaved = ref<Date | null>(null);
  const error = ref<Error | null>(null);
  const retryCount = ref(0);
  const maxRetries = 3;

  // Pending backoff-retry timers, plus a latch marking the composable torn
  // down. Unmount cleanup previously called stop(), which only detaches the
  // deep watcher: an in-flight retry chain (2s/4s/8s) and an already-scheduled
  // debounced save both survived it and could fire AFTER the component was
  // gone, PUTting stale form state over a record the user had navigated away
  // from. Every save path now short-circuits once disposed.
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;

  const save = async (value: T) => {
    if (!enabled || disposed) return;

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
      if (retryCount.value < maxRetries && !disposed) {
        retryCount.value++;
        const delay = Math.pow(2, retryCount.value) * 1000; // 2s, 4s, 8s
        const timer = setTimeout(() => {
          retryTimers.delete(timer);
          save(value);
        }, delay);
        retryTimers.add(timer);
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
    // In collaborative mode the realtime server owns periodic writeback, so
    // the change-driven debounced save is intentionally disabled. Explicit
    // save() and saveOnBlur() remain available as a backstop.
    if (collaborativeMode) return;
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

  // Fires on editor blur. In collaborative mode this is the defense-in-depth
  // backstop alongside explicit save(); in default mode it is an additional
  // immediate flush on blur.
  const saveOnBlur = async () => {
    await save(data);
  };

  /**
   * Tear down every scheduled write: detach the watcher, cancel outstanding
   * backoff retries, and latch `disposed` so a debounced save whose timer has
   * already elapsed still cannot reach onSave.
   */
  const dispose = () => {
    disposed = true;
    stop();
    for (const timer of retryTimers) {
      clearTimeout(timer);
    }
    retryTimers.clear();
  };

  // Cleanup on unmount (only if in component context)
  const instance = getCurrentInstance();
  if (instance) {
    onUnmounted(dispose);
  }

  return {
    isSaving,
    lastSaved,
    error,
    save: saveNow,
    saveOnBlur,
    start,
    stop,
    dispose,
  };
}
