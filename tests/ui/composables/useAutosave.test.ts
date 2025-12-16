import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
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
