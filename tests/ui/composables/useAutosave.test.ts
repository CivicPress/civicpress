import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useAutosave } from '~/composables/useAutosave';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize with correct default values', () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { isSaving, lastSaved, error } = useAutosave(data, { onSave });

    expect(isSaving.value).toBe(false);
    expect(lastSaved.value).toBe(null);
    expect(error.value).toBe(null);
  });

  it('should debounce save calls', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { start } = useAutosave(data, { onSave, debounceMs: 1000 });

    start();

    // Trigger multiple changes
    data.value = { title: 'Test 1' };
    data.value = { title: 'Test 2' };
    data.value = { title: 'Test 3' };

    // Fast-forward time to trigger debounced save
    await vi.advanceTimersByTimeAsync(1000);

    // Should only be called once due to debouncing
    expect(onSave).toHaveBeenCalledTimes(1);
    // The save function receives the ref (watch passes ref)
    const callArg = onSave.mock.calls[0][0];
    // Check if it's a ref or the value
    const value = callArg?.value !== undefined ? callArg.value : callArg;
    expect(value.title).toBe('Test 3');
  });

  it('should set isSaving state during save', async () => {
    const data = ref({ title: 'Test' });
    let resolveSave: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );

    const { isSaving, start } = useAutosave(data, { onSave });

    start();
    data.value = { title: 'Updated' };
    await vi.advanceTimersByTimeAsync(2000);

    // Should be saving
    expect(isSaving.value).toBe(true);

    // Resolve save
    resolveSave!();
    await vi.runAllTimersAsync();

    // Should no longer be saving
    expect(isSaving.value).toBe(false);
  });

  it('should update lastSaved after successful save', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { lastSaved, start } = useAutosave(data, { onSave });

    start();
    data.value = { title: 'Updated' };
    await vi.advanceTimersByTimeAsync(2000);

    expect(lastSaved.value).not.toBe(null);
    expect(lastSaved.value).toBeInstanceOf(Date);
  });

  it('should handle save errors', async () => {
    const data = ref({ title: 'Test' });
    const saveError = new Error('Save failed');
    const onSave = vi.fn().mockRejectedValue(saveError);

    const { error, start } = useAutosave(data, { onSave });

    start();
    data.value = { title: 'Updated' };
    await vi.advanceTimersByTimeAsync(2000);

    expect(error.value).toEqual(saveError);
  });

  it('should stop autosave when stop is called', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { stop, start } = useAutosave(data, { onSave });

    start();
    stop();

    data.value = { title: 'Updated' };
    await vi.advanceTimersByTimeAsync(2000);

    // Should not save after stop
    expect(onSave).not.toHaveBeenCalled();
  });

  it('should allow manual save via save function', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const autosave = useAutosave(data, { onSave });

    // Call the save function directly (it passes data ref)
    await autosave.save();

    expect(onSave).toHaveBeenCalledTimes(1);
    // save() passes data, which is a ref
    const callArg = onSave.mock.calls[0][0];
    const value = callArg?.value !== undefined ? callArg.value : callArg;
    expect(value.title).toBe('Test');
  });

  it('should respect enabled flag', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { start } = useAutosave(data, { onSave, enabled: false });

    start();
    data.value = { title: 'Updated' };
    await vi.advanceTimersByTimeAsync(2000);

    // Should not save when disabled
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('useAutosave — collaborativeMode', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('default mode: deep watcher triggers debouncedSave on change', async () => {
    const data = ref({ field: 'a' });
    const { start, stop } = useAutosave(data, { onSave, debounceMs: 0 });

    start();
    data.value.field = 'b';
    await nextTick();
    await new Promise((r) => setTimeout(r, 5));

    expect(onSave).toHaveBeenCalled();
    stop();
  });

  it('collaborativeMode: deep watcher does NOT trigger save on change', async () => {
    const data = ref({ field: 'a' });
    const { start, stop } = useAutosave(data, {
      onSave,
      debounceMs: 0,
      collaborativeMode: true,
    });

    start();
    data.value.field = 'b';
    await nextTick();
    await new Promise((r) => setTimeout(r, 50));

    expect(onSave).not.toHaveBeenCalled();
    stop();
  });

  it('collaborativeMode: explicit save() still fires onSave', async () => {
    const data = ref({ field: 'a' });
    const { save } = useAutosave(data, {
      onSave,
      collaborativeMode: true,
    });

    await save();

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('collaborativeMode: saveOnBlur() fires onSave', async () => {
    const data = ref({ field: 'a' });
    const { saveOnBlur } = useAutosave(data, {
      onSave,
      collaborativeMode: true,
    });

    await saveOnBlur();

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('saveOnBlur is exported in default (non-collab) mode too', async () => {
    const data = ref({ field: 'a' });
    const { saveOnBlur } = useAutosave(data, { onSave });

    expect(typeof saveOnBlur).toBe('function');
    await saveOnBlur();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

/**
 * Teardown. `stop()` only detaches the deep watcher — it does not cancel work
 * that is already scheduled. Unmount cleanup used to call just `stop()`, so an
 * in-flight exponential-backoff retry chain (2s/4s/8s) or an already-armed
 * debounced save could still fire after the component was gone and PUT stale
 * form state over a record the user had navigated away from.
 */
describe('useAutosave — teardown cancels scheduled writes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('cancels pending backoff retries on dispose', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'));

    const { start, dispose } = useAutosave(data, { onSave, debounceMs: 1000 });

    start();
    data.value = { title: 'Updated' };

    // First attempt runs and fails, arming the 2s backoff retry.
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSave).toHaveBeenCalledTimes(1);

    dispose();

    // Before the fix the retry chain kept firing long after teardown.
    await vi.advanceTimersByTimeAsync(30000);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not run an already-armed debounced save after dispose', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { start, dispose } = useAutosave(data, { onSave, debounceMs: 1000 });

    start();
    data.value = { title: 'Updated' };

    // Debounce armed but not yet elapsed when the component goes away.
    await vi.advanceTimersByTimeAsync(500);
    dispose();
    await vi.advanceTimersByTimeAsync(30000);

    expect(onSave).not.toHaveBeenCalled();
  });

  it('ignores explicit save() calls made after dispose', async () => {
    const data = ref({ title: 'Test' });
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { save, saveOnBlur, dispose } = useAutosave(data, { onSave });

    dispose();
    await save();
    await saveOnBlur();

    expect(onSave).not.toHaveBeenCalled();
  });
});
