/**
 * Unit Tests for Storage Failover Manager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StorageFailoverManager } from '../failover/storage-failover-manager.js';
import { RetryManager } from '../retry/retry-manager.js';
import { Logger } from '@civicpress/core';
import { ProviderUnavailableError } from '../errors/storage-errors.js';
import type { StorageConfig } from '../types/storage.types.js';

describe('StorageFailoverManager', () => {
  let failoverManager: StorageFailoverManager;
  let retryManager: RetryManager;
  let mockLogger: Logger;
  let config: StorageConfig;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    retryManager = new RetryManager(mockLogger);

    config = {
      backend: { type: 'local' },
      active_provider: 'primary',
      failover_providers: ['backup1', 'backup2'],
      providers: {
        primary: { type: 'local', enabled: true },
        backup1: { type: 'local', enabled: true },
        backup2: { type: 'local', enabled: true },
      },
      folders: {},
      metadata: {} as any,
    };

    failoverManager = new StorageFailoverManager(
      retryManager,
      config,
      mockLogger
    );
  });

  afterEach(() => {
    failoverManager.shutdown();
  });

  describe('executeWithFailover - Success Cases', () => {
    it('should execute on primary provider when successful', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await failoverManager.executeWithFailover(
        operation,
        'test-operation'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(operation).toHaveBeenCalledWith('primary');
    });

    it('should failover to backup provider on primary failure', async () => {
      let callCount = 0;
      const operation = vi.fn().mockImplementation((provider: string) => {
        callCount++;
        if (provider === 'primary') {
          throw new Error('Primary failed');
        }
        return Promise.resolve('success');
      });

      const result = await failoverManager.executeWithFailover(
        operation,
        'test-operation'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(operation).toHaveBeenCalledWith('primary');
      expect(operation).toHaveBeenCalledWith('backup1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('succeeded on failover provider'),
        expect.any(Object)
      );
    });

    it('should try failover providers in order', async () => {
      let callCount = 0;
      const operation = vi.fn().mockImplementation((provider: string) => {
        callCount++;
        if (provider === 'primary' || provider === 'backup1') {
          throw new Error(`${provider} failed`);
        }
        return Promise.resolve('success');
      });

      const result = await failoverManager.executeWithFailover(
        operation,
        'test-operation'
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(operation).toHaveBeenNthCalledWith(1, 'primary');
      expect(operation).toHaveBeenNthCalledWith(2, 'backup1');
      expect(operation).toHaveBeenNthCalledWith(3, 'backup2');
    });
  });

  describe('executeWithFailover - All Providers Fail', () => {
    it('should throw ProviderUnavailableError when all providers fail', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('All failed'));

      await expect(
        failoverManager.executeWithFailover(operation, 'test-operation')
      ).rejects.toThrow(ProviderUnavailableError);

      expect(operation).toHaveBeenCalledTimes(3); // primary + 2 backups
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('All providers failed'),
        expect.any(Object)
      );
    });
  });

  describe('Provider Health Tracking', () => {
    it('should mark provider as unhealthy on failure', async () => {
      const operation = vi.fn().mockImplementation((provider: string) => {
        if (provider === 'primary') {
          throw new Error('Primary failed');
        }
        return Promise.resolve('success');
      });

      await failoverManager.executeWithFailover(operation, 'test-operation');

      const health = failoverManager.getProviderHealth('primary');
      expect(health?.healthy).toBe(false);
      expect(health?.lastFailure).toBeDefined();
    });

    it('should mark provider as healthy on success', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await failoverManager.executeWithFailover(operation, 'test-operation');

      const health = failoverManager.getProviderHealth('primary');
      expect(health?.healthy).toBe(true);
    });

    it('should skip unhealthy providers', async () => {
      // First, mark primary as unhealthy
      const operation1 = vi.fn().mockImplementation((provider: string) => {
        if (provider === 'primary') {
          throw new Error('Primary failed');
        }
        return Promise.resolve('success');
      });

      await failoverManager.executeWithFailover(operation1, 'test-operation');

      // Now primary should be unhealthy
      const health = failoverManager.getProviderHealth('primary');
      expect(health?.healthy).toBe(false);

      // Next operation should skip primary
      const operation2 = vi.fn().mockResolvedValue('success');
      await failoverManager.executeWithFailover(operation2, 'test-operation');

      // Should have skipped primary and used backup1
      expect(operation2).toHaveBeenCalledWith('backup1');
    });
  });

  describe('getCurrentProvider', () => {
    it('should return current active provider', () => {
      expect(failoverManager.getCurrentProvider()).toBe('primary');
    });
  });

  describe('getProviderHealth', () => {
    it('should return health status for provider', () => {
      const health = failoverManager.getProviderHealth('primary');
      expect(health).toBeDefined();
      expect(health?.healthy).toBe(true);
    });

    it('should return undefined for unknown provider', () => {
      const health = failoverManager.getProviderHealth('unknown');
      expect(health).toBeUndefined();
    });
  });

  describe('getAllProviderHealth', () => {
    it('should return health status for all providers', () => {
      const allHealth = failoverManager.getAllProviderHealth();

      expect(allHealth.has('primary')).toBe(true);
      expect(allHealth.has('backup1')).toBe(true);
      expect(allHealth.has('backup2')).toBe(true);
    });
  });

  describe('Failover Disabled', () => {
    it('should not failover when disabled', async () => {
      const disabledConfig: StorageConfig = {
        ...config,
        failover_providers: [],
      };

      const disabledManager = new StorageFailoverManager(
        retryManager,
        disabledConfig,
        mockLogger
      );

      const operation = vi.fn().mockRejectedValue(new Error('Failed'));

      await expect(
        disabledManager.executeWithFailover(operation, 'test-operation')
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(1); // Only primary, no failover
      expect(operation).toHaveBeenCalledWith('primary');

      disabledManager.shutdown();
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', () => {
      expect(() => failoverManager.shutdown()).not.toThrow();
    });
  });
});
