import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MAX_CHECK_TIMEOUT_MS,
  boundedTimeout,
  withDeadline,
} from '../timeout.js';
import { DiagnosticCircuitBreaker } from '../circuit-breaker.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('boundedTimeout', () => {
  it.each([
    [50, 50],
    [1000, 1000],
    [MAX_CHECK_TIMEOUT_MS, MAX_CHECK_TIMEOUT_MS],
  ])('keeps %i', (requested, expected) => {
    expect(boundedTimeout(requested, 30_000)).toBe(expected);
  });

  it.each([MAX_CHECK_TIMEOUT_MS + 1, 2 ** 31, Number.MAX_SAFE_INTEGER])(
    'caps %i at the maximum',
    (requested) => {
      expect(boundedTimeout(requested, 30_000)).toBe(MAX_CHECK_TIMEOUT_MS);
    }
  );

  it.each([
    ['zero', 0],
    ['a negative number', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined', undefined],
    ['null', null],
    ['a string', '5000'],
    ['a list', [5000]],
  ])('falls back for %s', (_label, requested) => {
    // Node turns any of these into a 1 ms timer, so every check "timed out".
    expect(boundedTimeout(requested, 30_000)).toBe(30_000);
  });
});

describe('withDeadline', () => {
  it('settles with the work when it finishes first', async () => {
    await expect(
      withDeadline(Promise.resolve('done'), 1000, () => new Error('late'))
    ).resolves.toBe('done');
  });

  it('rejects with the timeout error when the work is late', async () => {
    const never = new Promise<string>(() => {});

    await expect(
      withDeadline(never, 10, () => new Error('late'))
    ).rejects.toThrow('late');
  });

  it('passes on a rejection from the work', async () => {
    await expect(
      withDeadline(
        Promise.reject(new Error('broke')),
        1000,
        () => new Error('late')
      )
    ).rejects.toThrow('broke');
  });

  it('leaves no timer behind when the work finishes first', async () => {
    // The race used to be left running: a check that took 5 ms held a
    // 30-second timer, its closure, and the process.
    vi.useFakeTimers();

    await withDeadline(
      Promise.resolve('done'),
      30_000,
      () => new Error('late')
    );

    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer behind when the work fails', async () => {
    vi.useFakeTimers();

    await withDeadline(
      Promise.reject(new Error('broke')),
      30_000,
      () => new Error('late')
    ).catch(() => {});

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('DiagnosticCircuitBreaker', () => {
  it('leaves no timer behind after a check that finished in time', async () => {
    vi.useFakeTimers();
    const breaker = new DiagnosticCircuitBreaker();

    await expect(
      breaker.execute('db:connect', async () => 'ok', 30_000)
    ).resolves.toBe('ok');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not arm a timer longer than the maximum', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const breaker = new DiagnosticCircuitBreaker();

    await breaker.execute('db:connect', async () => 'ok', 2 ** 40);

    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay);
    expect(delays).toContain(MAX_CHECK_TIMEOUT_MS);
    expect(Math.max(...(delays as number[]))).toBeLessThanOrEqual(
      MAX_CHECK_TIMEOUT_MS
    );
  });
});
