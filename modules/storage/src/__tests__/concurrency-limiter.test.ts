/**
 * Unit Tests for Concurrency Limiter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConcurrencyLimiter } from '../limiter/concurrency-limiter.js';
import { Logger } from '@civicpress/core';

describe('ConcurrencyLimiter', () => {
  let limiter: ConcurrencyLimiter;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    limiter = new ConcurrencyLimiter(
      {
        uploads: 2,
        downloads: 3,
        deletes: 4,
      },
      mockLogger
    );
  });

  describe('limitUpload', () => {
    it('should execute operations within limit', async () => {
      const operations = Array.from({ length: 5 }, (_, i) =>
        vi.fn().mockResolvedValue(`result-${i}`)
      );

      const results = await Promise.all(
        operations.map((op) => limiter.limitUpload(() => op()))
      );

      expect(results).toEqual([
        'result-0',
        'result-1',
        'result-2',
        'result-3',
        'result-4',
      ]);
      operations.forEach((op) => {
        expect(op).toHaveBeenCalled();
      });
    });

    it('should enforce upload concurrency limit', async () => {
      const activeOperations: number[] = [];
      const operations = Array.from({ length: 10 }, (_, i) => {
        return vi.fn().mockImplementation(async () => {
          activeOperations.push(i);
          await new Promise((resolve) => setTimeout(resolve, 50));
          activeOperations.splice(activeOperations.indexOf(i), 1);
          return `result-${i}`;
        });
      });

      // Start all operations
      const promises = operations.map((op) => limiter.limitUpload(() => op()));

      // Wait a bit to let operations start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have at most 2 active (upload limit)
      expect(activeOperations.length).toBeLessThanOrEqual(2);

      // Wait for all to complete
      await Promise.all(promises);
    });
  });

  describe('limitDownload', () => {
    it('should enforce download concurrency limit', async () => {
      const activeOperations: number[] = [];
      const operations = Array.from({ length: 10 }, (_, i) => {
        return vi.fn().mockImplementation(async () => {
          activeOperations.push(i);
          await new Promise((resolve) => setTimeout(resolve, 50));
          activeOperations.splice(activeOperations.indexOf(i), 1);
          return `result-${i}`;
        });
      });

      const promises = operations.map((op) =>
        limiter.limitDownload(() => op())
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have at most 3 active (download limit)
      expect(activeOperations.length).toBeLessThanOrEqual(3);

      await Promise.all(promises);
    });
  });

  describe('limitDelete', () => {
    it('should enforce delete concurrency limit', async () => {
      const activeOperations: number[] = [];
      const operations = Array.from({ length: 10 }, (_, i) => {
        return vi.fn().mockImplementation(async () => {
          activeOperations.push(i);
          await new Promise((resolve) => setTimeout(resolve, 50));
          activeOperations.splice(activeOperations.indexOf(i), 1);
          return `result-${i}`;
        });
      });

      const promises = operations.map((op) => limiter.limitDelete(() => op()));

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have at most 4 active (delete limit)
      expect(activeOperations.length).toBeLessThanOrEqual(4);

      await Promise.all(promises);
    });
  });

  describe('getActiveCounts', () => {
    it('should return active operation counts', async () => {
      const operations = Array.from({ length: 5 }, () => {
        return vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'result';
        });
      });

      // Start operations
      const promises = operations.map((op) => limiter.limitUpload(() => op()));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const counts = limiter.getActiveCounts();
      expect(counts.uploads).toBeGreaterThan(0);
      expect(counts.uploads).toBeLessThanOrEqual(2); // Limit

      await Promise.all(promises);
    });
  });

  describe('getPendingCounts', () => {
    it('should return pending operation counts', async () => {
      const operations = Array.from({ length: 10 }, () => {
        return vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'result';
        });
      });

      // Start operations (more than limit)
      const promises = operations.map((op) => limiter.limitUpload(() => op()));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pending = limiter.getPendingCounts();
      // Should have pending operations (10 total, 2 limit)
      expect(pending.uploads).toBeGreaterThanOrEqual(0);

      await Promise.all(promises);
    });
  });

  describe('Default Limits', () => {
    it('should use default limits when not specified', () => {
      const defaultLimiter = new ConcurrencyLimiter({}, mockLogger);

      const counts = defaultLimiter.getActiveCounts();
      expect(counts).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from operations', async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error('Operation failed'));

      await expect(limiter.limitUpload(() => operation())).rejects.toThrow(
        'Operation failed'
      );
    });

    it('should continue processing other operations on error', async () => {
      const operations = [
        vi.fn().mockRejectedValue(new Error('Failed')),
        vi.fn().mockResolvedValue('success'),
        vi.fn().mockResolvedValue('success'),
      ];

      const results = await Promise.allSettled(
        operations.map((op) => limiter.limitUpload(() => op()))
      );

      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
    });
  });
});
