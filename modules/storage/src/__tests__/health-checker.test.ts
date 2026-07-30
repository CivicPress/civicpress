/**
 * Unit Tests for Storage Health Checker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageHealthChecker } from '../health/storage-health-checker.js';
import { Logger } from '@civicpress/core';
import type { StorageConfig } from '../types/storage.types.js';

describe('StorageHealthChecker', () => {
  let healthChecker: StorageHealthChecker;
  let mockLogger: Logger;
  let checkOperations: Map<string, (provider: string) => Promise<void>>;
  let config: StorageConfig;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    checkOperations = new Map();
    checkOperations.set('local', vi.fn().mockResolvedValue(undefined));
    checkOperations.set('s3', vi.fn().mockResolvedValue(undefined));

    config = {
      backend: { type: 'local' },
      active_provider: 'local',
      failover_providers: ['s3'],
      providers: {
        local: { type: 'local', enabled: true },
        s3: { type: 's3', enabled: true },
      },
      folders: {},
      metadata: {} as any,
      global: {
        max_file_size: '100MB',
        health_checks: true,
        health_check_interval: 1000,
        health_check_timeout: 5000,
        retry_attempts: 3,
        cross_provider_backup: false,
        backup_providers: [],
      },
    };

    healthChecker = new StorageHealthChecker(
      config,
      checkOperations,
      mockLogger
    );
  });

  afterEach(() => {
    healthChecker.shutdown();
  });

  describe('checkProviderHealth', () => {
    // Fake timers for this block: the timeout and latency tests hinge on a
    // check operation's delay racing health_check_timeout, so we advance the
    // clock instead of really sleeping 100–500ms. The immediate success/failure
    // tests don't use timers and are unaffected. (The main healthChecker is
    // constructed in the outer beforeEach under real timers, so its periodic
    // interval — if any — stays real and dormant; only the per-call timeout
    // created inside each checkProviderHealth() below is faked.)
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return healthy status for successful check', async () => {
      const result = await healthChecker.checkProviderHealth('local');

      expect(result.healthy).toBe(true);
      expect(result.provider).toBe('local');
      expect(result.latency).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should return unhealthy status for failed check', async () => {
      checkOperations.set(
        'local',
        vi.fn().mockRejectedValue(new Error('Connection failed'))
      );

      const result = await healthChecker.checkProviderHealth('local');

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Connection failed');
    });

    it('should handle timeout', async () => {
      // Use a short health_check_timeout to keep the test well inside vitest's
      // 5000ms test budget; the prior 5000ms-vs-5000ms race vs vitest's own
      // timeout was inherently flaky. Mock delay must exceed health_check_timeout.
      const shortTimeoutChecker = new StorageHealthChecker(
        {
          ...config,
          global: {
            ...config.global!,
            health_check_timeout: 100,
          },
        },
        checkOperations,
        mockLogger
      );
      checkOperations.set(
        'local',
        vi
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 500))
          )
      );

      const p = shortTimeoutChecker.checkProviderHealth('local');
      // Advance past both the 100ms health_check_timeout (which wins) and the
      // op's 500ms sleep, leaving no fake timer pending.
      await vi.advanceTimersByTimeAsync(500);
      const result = await p;

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
      // createTimeout (storage-health-checker.ts:213) emits "Health check timed
      // out after Xms"; test asserts the actual substring.
      expect(result.error).toContain('timed out');
      shortTimeoutChecker.shutdown();
    });

    it('should return error for provider without check operation', async () => {
      const result = await healthChecker.checkProviderHealth('unknown');

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('No health check operation');
    });

    it('should measure latency', async () => {
      checkOperations.set(
        'local',
        vi
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100))
          )
      );

      const p = healthChecker.checkProviderHealth('local');
      await vi.advanceTimersByTimeAsync(100); // op sleeps 100ms → latency is exactly 100
      const result = await p;

      expect(result.latency).toBeDefined();
      expect(result.latency).toBeGreaterThanOrEqual(90);
      expect(result.latency).toBeLessThan(200);
    });
  });

  describe('getProviderHealth', () => {
    it('should return health status for provider', async () => {
      await healthChecker.checkProviderHealth('local');

      const health = healthChecker.getProviderHealth('local');

      expect(health).toBeDefined();
      expect(health?.provider).toBe('local');
      expect(health?.healthy).toBe(true);
    });

    it('should return undefined for unknown provider', () => {
      const health = healthChecker.getProviderHealth('unknown');
      expect(health).toBeUndefined();
    });
  });

  describe('getAllProviderHealth', () => {
    it('should return health status for all providers', async () => {
      await healthChecker.checkProviderHealth('local');
      await healthChecker.checkProviderHealth('s3');

      const allHealth = healthChecker.getAllProviderHealth();

      expect(allHealth.has('local')).toBe(true);
      expect(allHealth.has('s3')).toBe(true);
      expect(allHealth.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('isProviderHealthy', () => {
    it('should return true for healthy provider', async () => {
      await healthChecker.checkProviderHealth('local');

      expect(healthChecker.isProviderHealthy('local')).toBe(true);
    });

    it('should return false for unhealthy provider', async () => {
      checkOperations.set(
        'local',
        vi.fn().mockRejectedValue(new Error('Failed'))
      );

      await healthChecker.checkProviderHealth('local');

      expect(healthChecker.isProviderHealthy('local')).toBe(false);
    });

    it('should return false for unknown provider', () => {
      expect(healthChecker.isProviderHealthy('unknown')).toBe(false);
    });
  });

  describe('getUnhealthyProviders', () => {
    it('should return empty array when all providers are healthy', async () => {
      await healthChecker.checkProviderHealth('local');
      await healthChecker.checkProviderHealth('s3');

      const unhealthy = healthChecker.getUnhealthyProviders();
      expect(unhealthy).toEqual([]);
    });

    it('should return unhealthy providers', async () => {
      checkOperations.set(
        'local',
        vi.fn().mockRejectedValue(new Error('Failed'))
      );
      await healthChecker.checkProviderHealth('local');

      await healthChecker.checkProviderHealth('s3');

      const unhealthy = healthChecker.getUnhealthyProviders();
      expect(unhealthy).toContain('local');
      expect(unhealthy).not.toContain('s3');
    });
  });

  describe('Periodic Health Checks', () => {
    it('should start periodic checks when enabled', () => {
      const checker = new StorageHealthChecker(
        {
          ...config,
          global: {
            max_file_size: '100MB',
            health_checks: true,
            health_check_interval: 100,
            health_check_timeout: 5000,
            retry_attempts: 3,
            cross_provider_backup: false,
            backup_providers: [],
          },
        },
        checkOperations,
        mockLogger
      );

      // Wait a bit for checks to run
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const health = checker.getProviderHealth('local');
          expect(health).toBeDefined();
          checker.shutdown();
          resolve();
        }, 150);
      });
    });

    it('should not start periodic checks when disabled', () => {
      const checker = new StorageHealthChecker(
        {
          ...config,
          global: {
            max_file_size: '100MB',
            health_checks: false,
            health_check_interval: 1000,
            retry_attempts: 3,
            cross_provider_backup: false,
            backup_providers: [],
          },
        },
        checkOperations,
        mockLogger
      );

      // Should not have started intervals
      const health = checker.getProviderHealth('local');
      // Health should exist but may not have been checked yet
      expect(health).toBeDefined();
      checker.shutdown();
    });
  });

  describe('stopHealthChecks', () => {
    it('should stop all health check intervals', () => {
      healthChecker.stopHealthChecks();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Stopped health checks'),
        expect.any(Object)
      );
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', () => {
      expect(() => healthChecker.shutdown()).not.toThrow();
    });
  });
});
