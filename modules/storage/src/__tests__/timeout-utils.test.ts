/**
 * Unit Tests for Timeout Utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withTimeout,
  getTimeoutForOperation,
  type TimeoutConfig,
} from '../utils/timeout.js';
import { StorageTimeoutError } from '../errors/storage-errors.js';

describe('withTimeout', () => {
  // Fake timers: withTimeout races the operation against a setTimeout, so the
  // outcome is decided by advancing the clock rather than by real 50–200ms
  // sleeps out-racing each other. Each test starts the call, attaches its
  // handler, THEN advances — so the pending rejection is always handled (no
  // unhandled-rejection window) and the winner is deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result when operation completes before timeout', async () => {
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'success';
    };

    const p = withTimeout(operation, 1000, 'test-operation');
    await vi.advanceTimersByTimeAsync(50); // operation (50ms) beats the 1000ms timeout

    expect(await p).toBe('success');
  });

  it('should throw StorageTimeoutError when operation exceeds timeout', async () => {
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'success';
    };

    const assertion = expect(
      withTimeout(operation, 100, 'test-operation')
    ).rejects.toThrow(StorageTimeoutError);
    await vi.advanceTimersByTimeAsync(100); // the 100ms timeout beats the 200ms operation
    await assertion;
  });

  it('should throw StorageTimeoutError with correct timeout value', async () => {
    // Operation delay must exceed the timeout for the timeout to fire; the
    // prior config (200ms operation vs 5000ms timeout) meant the operation
    // always completed before the timeout, so expect.fail() was reached and
    // AssertionError got caught by the catch block (a latent stale test that
    // the bug-5 source fix surfaced — the assertion would have always failed).
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'success';
    };

    // `.catch((e) => e)` attaches the handler up front (turning the rejection
    // into a resolved value), so advancing the clock cannot surface an
    // unhandled rejection before we inspect the error.
    const settled = withTimeout(operation, 100, 'upload').catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    const error = await settled;

    expect(error).toBeInstanceOf(StorageTimeoutError);
    if (error instanceof StorageTimeoutError) {
      expect(error.context?.timeout).toBe(100);
      expect(error.context?.operation).toBe('upload');
    }
  });

  it('should propagate non-timeout errors', async () => {
    const operation = async () => {
      throw new Error('Custom error');
    };

    // The operation rejects on the microtask queue before the timeout timer,
    // so no clock advance is needed.
    await expect(
      withTimeout(operation, 1000, 'test-operation')
    ).rejects.toThrow('Custom error');
  });

  it('should use default operation name', async () => {
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'success';
    };

    const settled = withTimeout(operation, 100).catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    const error = await settled;

    expect(error).toBeInstanceOf(StorageTimeoutError);
    if (error instanceof StorageTimeoutError) {
      expect(error.context?.operation).toBe('operation');
    }
  });
});

describe('getTimeoutForOperation', () => {
  it('should return upload timeout when specified', () => {
    const config: TimeoutConfig = {
      upload: 300000,
      default: 60000,
    };

    const timeout = getTimeoutForOperation('upload', config);
    expect(timeout).toBe(300000);
  });

  it('should return download timeout when specified', () => {
    const config: TimeoutConfig = {
      download: 600000,
      default: 60000,
    };

    const timeout = getTimeoutForOperation('download', config);
    expect(timeout).toBe(600000);
  });

  it('should return delete timeout when specified', () => {
    const config: TimeoutConfig = {
      delete: 30000,
      default: 60000,
    };

    const timeout = getTimeoutForOperation('delete', config);
    expect(timeout).toBe(30000);
  });

  it('should return list timeout when specified', () => {
    const config: TimeoutConfig = {
      list: 30000,
      default: 60000,
    };

    const timeout = getTimeoutForOperation('list', config);
    expect(timeout).toBe(30000);
  });

  it('should fall back to default timeout when operation-specific not set', () => {
    const config: TimeoutConfig = {
      default: 120000,
    };

    const timeout = getTimeoutForOperation('upload', config);
    expect(timeout).toBe(120000);
  });

  it('should use default timeout values when config is empty', () => {
    const config: TimeoutConfig = {};

    expect(getTimeoutForOperation('upload', config)).toBe(300000); // 5 minutes
    expect(getTimeoutForOperation('download', config)).toBe(600000); // 10 minutes
    expect(getTimeoutForOperation('delete', config)).toBe(30000); // 30 seconds
    expect(getTimeoutForOperation('list', config)).toBe(30000); // 30 seconds
  });

  it('should prefer operation-specific over default', () => {
    const config: TimeoutConfig = {
      upload: 200000,
      default: 100000,
    };

    const timeout = getTimeoutForOperation('upload', config);
    expect(timeout).toBe(200000); // Should use upload, not default
  });
});
