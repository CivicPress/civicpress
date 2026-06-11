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
    saveOnBlur,
    start,
    stop,
  };
}
