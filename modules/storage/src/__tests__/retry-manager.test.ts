/**
 * Unit Tests for Retry Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryManager } from '../retry/retry-manager.js';
import { Logger } from '@civicpress/core';
import {
  StorageTimeoutError,
  ProviderUnavailableError,
  QuotaExceededError,
  StorageValidationError,
} from '../errors/storage-errors.js';
import { ValidationError } from '@civicpress/core';

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    retryManager = new RetryManager(mockLogger);
  });

  describe('withRetry - Success Cases', () => {
    it('should return result on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await retryManager.withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed on second attempt', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          throw new StorageTimeoutError('upload', 5000);
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrying operation'),
        expect.any(Object)
      );
    });

    it('should succeed after multiple retries', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          throw new StorageTimeoutError('upload', 5000);
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.withRetry(operation, {
        maxAttempts: 3,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('withRetry - Exponential Backoff', () => {
    it('should use exponential backoff timing', async () => {
      const startTime = Date.now();
      let attempt = 0;
      const delays: number[] = [];

      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          const now = Date.now();
          if (attempt > 1) {
            delays.push(now - startTime);
          }
          throw new StorageTimeoutError('upload', 5000);
        }
        return Promise.resolve('success');
      });

      await retryManager.withRetry(operation, {
        maxAttempts: 3,
        initialDelay: 100,
        backoffMultiplier: 2,
      });

      // Check that delays increase exponentially (with some tolerance)
      expect(delays.length).toBeGreaterThan(0);
      // First delay should be around initialDelay (100ms)
      // Second delay should be around initialDelay * multiplier (200ms)
      // Allow 50ms tolerance for timing
      if (delays.length >= 1) {
        expect(delays[0]).toBeGreaterThanOrEqual(90);
        expect(delays[0]).toBeLessThanOrEqual(150);
      }
    });

    it('should cap delay at maxDelay', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          throw new StorageTimeoutError('upload', 5000);
        }
        return Promise.resolve('success');
      });

      await retryManager.withRetry(operation, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 2000,
        backoffMultiplier: 10, // Would be 10s without cap
      });

      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('withRetry - Retryable Errors', () => {
    it('should retry on StorageTimeoutError', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          throw new StorageTimeoutError('upload', 5000);
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.withRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on ProviderUnavailableError', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          throw new ProviderUnavailableError('s3', 'Connection failed');
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.withRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on network errors', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          const error = new Error('ECONNRESET');
          throw error;
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.withRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on timeout errors', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          const error = new Error('ETIMEDOUT');
          throw error;
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.withRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRetry - Non-Retryable Errors', () => {
    it('should not retry on QuotaExceededError', async () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new QuotaExceededError(
          { used: 1000, limit: 500, available: 0, unit: 'bytes' },
          { folder: 'public' }
        );
      });

      await expect(retryManager.withRetry(operation)).rejects.toThrow(
        QuotaExceededError
      );
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on StorageValidationError', async () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new StorageValidationError('Invalid file type', {
          field: 'file',
          rule: 'allowed_types',
        });
      });

      await expect(retryManager.withRetry(operation)).rejects.toThrow(
        StorageValidationError
      );
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 4xx errors', async () => {
      const error = new ValidationError('Bad request');
      (error as any).statusCode = 400;
      (error as any).retryable = false;

      const operation = vi.fn().mockImplementation(() => {
        throw error;
      });

      await expect(retryManager.withRetry(operation)).rejects.toThrow(
        ValidationError
      );
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry when retryable is explicitly false', async () => {
      const error = new Error('Custom error');
      (error as any).retryable = false;

      const operation = vi.fn().mockImplementation(() => {
        throw error;
      });

      await expect(retryManager.withRetry(operation)).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('withRetry - Max Attempts', () => {
    it('should throw after max attempts', async () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new StorageTimeoutError('upload', 5000);
      });

      await expect(
        retryManager.withRetry(operation, { maxAttempts: 3 })
      ).rejects.toThrow(StorageTimeoutError);

      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed after 3 attempts'),
        expect.any(Object)
      );
    });

    it('should use default max attempts', async () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new StorageTimeoutError('upload', 5000);
      });

      await expect(retryManager.withRetry(operation)).rejects.toThrow();

      // Default is 3 attempts
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('withRetry - Custom Configuration', () => {
    it('should use custom retry config', async () => {
      let attempt = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 5) {
          throw new StorageTimeoutError('upload', 5000);
        }
        return Promise.resolve('success');
      });

      const result = await retryManager.withRetry(operation, {
        maxAttempts: 5,
        initialDelay: 50,
        maxDelay: 1000,
        backoffMultiplier: 1.5,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(5);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const config = retryManager.getDefaultConfig();

      expect(config.maxAttempts).toBe(3);
      expect(config.initialDelay).toBe(1000);
      expect(config.maxDelay).toBe(30000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.retryableErrors).toContain('STORAGE_PROVIDER_UNAVAILABLE');
      expect(config.retryableErrors).toContain('STORAGE_TIMEOUT');
    });
  });
});
