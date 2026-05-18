/**
 * Unit tests for StorageFailoverManager.checkProviderRecovery (storage-004
 * closure). Before Phase 2c this method was a no-op debug log. These tests
 * exercise the real wire-up: the per-provider recovery probe is invoked,
 * a successful probe transitions the provider back to healthy, and a
 * failing probe keeps it unhealthy with `lastFailure` refreshed so the
 * next interval re-tries after the configured window.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StorageFailoverManager } from '../failover/storage-failover-manager.js';
import { RetryManager } from '../retry/retry-manager.js';
import { Logger } from '@civicpress/core';
import type { StorageConfig } from '../types/storage.types.js';

describe('StorageFailoverManager.checkProviderRecovery (storage-004 wire)', () => {
  let mockLogger: Logger;
  let retryManager: RetryManager;
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
      failover_providers: ['backup1'],
      providers: {
        primary: { type: 'local', enabled: true },
        backup1: { type: 'local', enabled: true },
      },
      folders: {},
      metadata: {} as any,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes the recovery probe for unhealthy providers and marks them healthy on success', async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const probes = new Map<string, (p: string) => Promise<void>>([
      ['primary', probe],
      ['backup1', probe],
    ]);

    const manager = new StorageFailoverManager(
      retryManager,
      config,
      mockLogger,
      probes
    );

    // Force backup1 into an unhealthy state with a stale lastFailure so the
    // recovery-window gate passes.
    (manager as any).providerHealth.set('backup1', {
      healthy: false,
      lastFailure: new Date(Date.now() - 5 * 60_000),
    });

    // Invoke the private recovery loop directly.
    await (manager as any).checkProviderRecovery();

    expect(probe).toHaveBeenCalledWith('backup1');
    expect(probe).toHaveBeenCalledTimes(1); // only the unhealthy one
    expect(manager.getProviderHealth('backup1')?.healthy).toBe(true);

    manager.shutdown();
  });

  it('leaves the provider unhealthy and refreshes lastFailure when the probe throws', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('still down'));
    const probes = new Map<string, (p: string) => Promise<void>>([
      ['backup1', probe],
    ]);

    const manager = new StorageFailoverManager(
      retryManager,
      config,
      mockLogger,
      probes
    );

    const staleFailure = new Date(Date.now() - 5 * 60_000);
    (manager as any).providerHealth.set('backup1', {
      healthy: false,
      lastFailure: staleFailure,
    });

    await (manager as any).checkProviderRecovery();

    expect(probe).toHaveBeenCalledWith('backup1');
    const health = manager.getProviderHealth('backup1');
    expect(health?.healthy).toBe(false);
    // lastFailure must be refreshed to NOW so the next interval waits a full
    // window before retrying (no tight loop).
    expect(health?.lastFailure?.getTime()).toBeGreaterThan(
      staleFailure.getTime()
    );

    manager.shutdown();
  });

  it('skips the probe when the recovery window has not yet elapsed', async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const probes = new Map<string, (p: string) => Promise<void>>([
      ['backup1', probe],
    ]);

    const manager = new StorageFailoverManager(
      retryManager,
      config,
      mockLogger,
      probes
    );

    // lastFailure is very recent — below the 60 s default recoveryCheckInterval.
    (manager as any).providerHealth.set('backup1', {
      healthy: false,
      lastFailure: new Date(Date.now() - 100),
    });

    await (manager as any).checkProviderRecovery();

    expect(probe).not.toHaveBeenCalled();
    expect(manager.getProviderHealth('backup1')?.healthy).toBe(false);

    manager.shutdown();
  });

  it('is a no-op when no recovery probe is registered for the provider', async () => {
    const manager = new StorageFailoverManager(
      retryManager,
      config,
      mockLogger
      // no probes supplied
    );

    (manager as any).providerHealth.set('backup1', {
      healthy: false,
      lastFailure: new Date(Date.now() - 5 * 60_000),
    });

    // Should not throw and should leave the provider unhealthy.
    await (manager as any).checkProviderRecovery();

    expect(manager.getProviderHealth('backup1')?.healthy).toBe(false);

    manager.shutdown();
  });
});
