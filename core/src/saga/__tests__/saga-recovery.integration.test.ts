/**
 * FA-CORE-001 / FA-CORE-006 — saga recovery + getFailedSagas against a REAL
 * SQLite database.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseService } from '../../database/database-service.js';
import { SagaStateStore } from '../saga-state-store.js';
import { ResourceLockManager } from '../resource-lock.js';
import { SagaRecoveryService } from '../saga-recovery.js';
import type { SagaState } from '../types.js';

describe('Saga recovery (real SQLite)', () => {
  let dir: string;
  let db: DatabaseService;
  let store: SagaStateStore;
  let locks: ResourceLockManager;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'saga-recovery-'));
    db = new DatabaseService({
      type: 'sqlite',
      sqlite: { file: path.join(dir, 'test.db') },
    });
    await db.initialize();
    store = new SagaStateStore(db);
    locks = new ResourceLockManager(db);
  });

  afterEach(async () => {
    await db.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  function makeState(over: Partial<SagaState> = {}): SagaState {
    return {
      id: 'saga-x',
      sagaType: 'CreateRecord',
      context: '{}',
      status: 'executing',
      currentStep: 1,
      stepResults: [],
      startedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago = orphaned
      correlationId: 'corr-x',
      ...over,
    };
  }

  it('FA-CORE-006: getFailedSagas returns ONLY failed, incompletely-compensated sagas', async () => {
    await store.saveState(makeState({ id: 's-exec', status: 'executing' }));
    await store.saveState(makeState({ id: 's-done', status: 'completed' }));
    await store.saveState(makeState({ id: 's-fail', status: 'failed' }));
    await store.saveState(
      makeState({ id: 's-fail-comp', status: 'failed' })
    );
    await store.updateCompensationStatus('s-fail-comp', 'completed');

    const failed = await store.getFailedSagas();
    const ids = failed.map((s) => s.id).sort();
    // The old unparenthesized query wrongly included executing/completed rows;
    // now only the failed-with-incomplete-compensation one.
    expect(ids).toEqual(['s-fail']);
  });

  it('FA-CORE-001: recovery flags an orphaned executing saga and frees its lock', async () => {
    await store.saveState(makeState({ id: 's-orphan', status: 'executing' }));
    // Simulate the lock the crashed saga still holds.
    await locks.acquireLock('record:r-1', 's-orphan', 60_000);
    expect(await locks.getLock('record:r-1')).not.toBeNull();

    const svc = new SagaRecoveryService(store, locks, { stuckTimeoutMs: 1000 });
    const summary = await svc.recover();

    expect(summary.scanned).toBe(1);
    expect(summary.flagged).toBe(1);
    expect(summary.locksReleased).toBe(1);

    // The lock is gone and the saga is no longer stuck 'executing'.
    expect(await locks.getLock('record:r-1')).toBeNull();
    const recovered = await store.getState('s-orphan');
    expect(recovered?.status).toBe('failed');
    expect(recovered?.compensationStatus).toBe('partial');
  });

  it('a registered recoverer can reconcile instead of flagging', async () => {
    await store.saveState(makeState({ id: 's-reco', status: 'executing' }));
    const svc = new SagaRecoveryService(store, locks, { stuckTimeoutMs: 1000 });
    let sawState: SagaState | null = null;
    svc.registerRecoverer('CreateRecord', async (st) => {
      sawState = st;
      return 'recovered';
    });

    const summary = await svc.recover();
    expect(summary.recovered).toBe(1);
    expect(summary.flagged).toBe(0);
    expect(sawState).not.toBeNull();
  });
});
