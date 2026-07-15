/**
 * FA-CORE-001 — saga crash recovery.
 */

import { describe, it, expect, vi } from 'vitest';
import { SagaRecoveryService } from '../saga/saga-recovery.js';
import type { SagaState } from '../saga/types.js';

function state(over: Partial<SagaState> = {}): SagaState {
  return {
    id: 'saga-1',
    sagaType: 'CreateRecord',
    context: '{}',
    status: 'executing',
    currentStep: 1,
    stepResults: [],
    startedAt: new Date(0),
    correlationId: 'c1',
    ...over,
  };
}

function fakeStore(stuck: SagaState[], failed: SagaState[] = []) {
  return {
    getStuckSagas: vi.fn(async () => stuck),
    getFailedSagas: vi.fn(async () => failed),
    updateStatus: vi.fn(async () => {}),
    updateCompensationStatus: vi.fn(async () => {}),
  } as any;
}

function fakeLocks() {
  return {
    releaseAllForSaga: vi.fn(async () => 1),
  } as any;
}

describe('SagaRecoveryService (FA-CORE-001)', () => {
  it('flags an orphaned executing saga: releases locks, marks failed + partial', async () => {
    const store = fakeStore([state()]);
    const locks = fakeLocks();
    const svc = new SagaRecoveryService(store, locks);

    const summary = await svc.recover();

    expect(summary).toMatchObject({
      scanned: 1,
      flagged: 1,
      recovered: 0,
      locksReleased: 1,
    });
    expect(locks.releaseAllForSaga).toHaveBeenCalledWith('saga-1');
    expect(store.updateStatus).toHaveBeenCalledWith(
      'saga-1',
      'failed',
      1,
      expect.stringContaining('Orphaned')
    );
    expect(store.updateCompensationStatus).toHaveBeenCalledWith(
      'saga-1',
      'partial'
    );
  });

  it('runs a registered recoverer and counts a recovery (no flag)', async () => {
    const store = fakeStore([state()]);
    const locks = fakeLocks();
    const svc = new SagaRecoveryService(store, locks);
    const recoverer = vi.fn(async () => 'recovered' as const);
    svc.registerRecoverer('CreateRecord', recoverer);

    const summary = await svc.recover();

    expect(recoverer).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ recovered: 1, flagged: 0 });
    // Locks still released even when a recoverer handles it.
    expect(locks.releaseAllForSaga).toHaveBeenCalled();
    // Not flagged → no failed-status write.
    expect(store.updateStatus).not.toHaveBeenCalled();
  });

  it('falls back to flag when a recoverer returns "flagged"', async () => {
    const store = fakeStore([state()]);
    const svc = new SagaRecoveryService(store, fakeLocks());
    svc.registerRecoverer('CreateRecord', async () => 'flagged');

    const summary = await svc.recover();
    expect(summary).toMatchObject({ recovered: 0, flagged: 1 });
  });

  it('de-dupes a saga appearing in both stuck and failed lists', async () => {
    const s = state();
    const store = fakeStore([s], [s]);
    const svc = new SagaRecoveryService(store, fakeLocks());

    const summary = await svc.recover();
    expect(summary.scanned).toBe(1);
  });

  it('continues after a per-saga recoverer throws (still flags it)', async () => {
    const store = fakeStore([state({ id: 'a' }), state({ id: 'b' })]);
    const svc = new SagaRecoveryService(store, fakeLocks());
    svc.registerRecoverer('CreateRecord', async (st) => {
      if (st.id === 'a') throw new Error('boom');
      return 'recovered';
    });

    const summary = await svc.recover();
    expect(summary.scanned).toBe(2);
    expect(summary.flagged).toBe(1); // 'a' fell back to flag
    expect(summary.recovered).toBe(1); // 'b'
  });

  it('is a no-op when nothing is orphaned', async () => {
    const store = fakeStore([]);
    const svc = new SagaRecoveryService(store, fakeLocks());
    const summary = await svc.recover();
    expect(summary).toEqual({
      scanned: 0,
      recovered: 0,
      flagged: 0,
      locksReleased: 0,
    });
  });

  it('never throws when the scan itself fails', async () => {
    const store = {
      getStuckSagas: vi.fn(async () => {
        throw new Error('db down');
      }),
      getFailedSagas: vi.fn(async () => []),
    } as any;
    const svc = new SagaRecoveryService(store, fakeLocks());
    await expect(svc.recover()).resolves.toMatchObject({ scanned: 0 });
  });
});
