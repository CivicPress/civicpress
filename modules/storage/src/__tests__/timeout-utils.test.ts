/**
 * Unit Tests for Timeout Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  withTimeout,
  getTimeoutForOperation,
  type TimeoutConfig,
} from '../utils/timeout.js';
import { StorageTimeoutError } from '../errors/storage-errors.js';

describe('withTimeout', () => {
  it('should return result when operation completes before timeout', async () => {
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'success';
    };

    const result = await withTimeout(operation, 1000, 'test-operation');

    expect(result).toBe('success');
  });

  it('should throw StorageTimeoutError when operation exceeds timeout', async () => {
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'success';
    };

    await expect(withTimeout(operation, 100, 'test-operation')).rejects.toThrow(
      StorageTimeoutError
    );
  });

  it('should throw StorageTimeoutError with correct timeout value', async () => {
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'success';
    };

    try {
      await withTimeout(operation, 5000, 'upload');
      expect.fail('Should have thrown StorageTimeoutError');
    } catch (error) {
      expect(error).toBeInstanceOf(StorageTimeoutError);
      if (error instanceof StorageTimeoutError) {
        expect(error.context?.timeout).toBe(5000);
        expect(error.context?.operation).toBe('upload');
      }
    }
  });

  it('should propagate non-timeout errors', async () => {
    const operation = async () => {
      throw new Error('Custom error');
    };

    await expect(
      withTimeout(operation, 1000, 'test-operation')
    ).rejects.toThrow('Custom error');
  });

  it('should use default operation name', async () => {
    const operation = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'success';
    };

    try {
      await withTimeout(operation, 100);
      expect.fail('Should have thrown StorageTimeoutError');
    } catch (error) {
      expect(error).toBeInstanceOf(StorageTimeoutError);
      if (error instanceof StorageTimeoutError) {
        expect(error.context?.operation).toBe('operation');
      }
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
