/**
 * Saga crash-recovery (FA-CORE-001).
 *
 * Sagas persist their state, but nothing consumed `getStuckSagas` /
 * `getFailedSagas`: a process that died between the SQLite write (step 1) and
 * the git commit (step 3) left the saga row stuck `executing` FOREVER, its
 * resource locks held forever, and SQLite + git silently divergent.
 *
 * This service runs at startup. For every saga orphaned by a prior crash
 * (executing past a generous threshold, or failed with incomplete
 * compensation) it:
 *   1. releases the saga's resource locks (so the record is no longer pinned);
 *   2. runs a per-saga-type recoverer if one is registered (roll-forward or
 *      roll-back reconciliation the saga author supplies);
 *   3. otherwise transitions the saga out of the permanent `executing` limbo
 *      into `failed` (compensation `partial`) and logs LOUDLY with the id,
 *      type, and last step so an operator can reconcile the SQLite/git split.
 *
 * Full automatic SQLite↔git reconciliation for arbitrary saga types needs the
 * in-code saga definition and is left to per-type recoverers; the default is
 * fail-safe (surface + unpin, never silently drop data).
 */

import type { SagaStateStore } from './saga-state-store.js';
import type { ResourceLockManager } from './resource-lock.js';
import type { SagaState } from './types.js';
import { coreInfo, coreWarn, coreError } from '../utils/core-output.js';

/** Outcome a per-type recoverer reports. */
export type SagaRecoveryOutcome = 'recovered' | 'flagged';

/** A per-saga-type recovery handler; may reconcile then return 'recovered'. */
export type SagaRecoverer = (
  state: SagaState
) => Promise<SagaRecoveryOutcome>;

export interface SagaRecoveryOptions {
  /**
   * A saga still `executing` older than this is treated as orphaned by a dead
   * process (a live process's in-flight sagas are younger). Default 10 min.
   */
  stuckTimeoutMs?: number;
}

export interface SagaRecoverySummary {
  scanned: number;
  recovered: number;
  flagged: number;
  locksReleased: number;
}

export class SagaRecoveryService {
  private readonly recoverers = new Map<string, SagaRecoverer>();
  private readonly stuckTimeoutMs: number;

  constructor(
    private readonly stateStore: SagaStateStore,
    private readonly lockManager: ResourceLockManager,
    options: SagaRecoveryOptions = {}
  ) {
    this.stuckTimeoutMs = options.stuckTimeoutMs ?? 10 * 60 * 1000;
  }

  /** Register a reconciliation handler for a saga type. */
  registerRecoverer(sagaType: string, recoverer: SagaRecoverer): void {
    this.recoverers.set(sagaType, recoverer);
  }

  /**
   * Scan for orphaned sagas and recover/flag them. Never throws — recovery
   * must not block startup; a per-saga failure is logged and the scan
   * continues.
   */
  async recover(): Promise<SagaRecoverySummary> {
    const summary: SagaRecoverySummary = {
      scanned: 0,
      recovered: 0,
      flagged: 0,
      locksReleased: 0,
    };

    let orphaned: SagaState[];
    try {
      const [stuck, failed] = await Promise.all([
        this.stateStore.getStuckSagas(this.stuckTimeoutMs),
        this.stateStore.getFailedSagas(),
      ]);
      // De-dupe (a saga could appear in both lists across a race).
      const byId = new Map<string, SagaState>();
      for (const s of [...stuck, ...failed]) byId.set(s.id, s);
      orphaned = [...byId.values()];
    } catch (error) {
      coreError(
        error instanceof Error ? error : new Error(String(error)),
        'SAGA_RECOVERY_SCAN_FAILED',
        {},
        { operation: 'saga:recovery:scan' }
      );
      return summary;
    }

    if (orphaned.length === 0) return summary;

    coreWarn('Saga recovery: orphaned sagas found from a prior run', {
      operation: 'saga:recovery:found',
      count: orphaned.length,
    });

    for (const state of orphaned) {
      summary.scanned++;
      try {
        summary.locksReleased += await this.lockManager.releaseAllForSaga(
          state.id
        );

        const recoverer = this.recoverers.get(state.sagaType);
        if (recoverer) {
          const outcome = await recoverer(state);
          if (outcome === 'recovered') {
            summary.recovered++;
            continue;
          }
        }

        // Default: unpin the permanent 'executing' limbo + surface for review.
        await this.flagForReview(state);
        summary.flagged++;
      } catch (error) {
        coreError(
          error instanceof Error ? error : new Error(String(error)),
          'SAGA_RECOVERY_ITEM_FAILED',
          { sagaId: state.id, sagaType: state.sagaType },
          { operation: 'saga:recovery:item' }
        );
        // Best-effort flag so it doesn't stay stuck executing.
        await this.flagForReview(state).catch(() => {});
        summary.flagged++;
      }
    }

    coreInfo('Saga recovery complete', {
      operation: 'saga:recovery:complete',
      ...summary,
    });
    return summary;
  }

  private async flagForReview(state: SagaState): Promise<void> {
    if (state.status === 'executing') {
      await this.stateStore.updateStatus(
        state.id,
        'failed',
        state.currentStep,
        state.error ??
          'Orphaned by a crashed process before completion (recovered at startup)'
      );
    }
    await this.stateStore.updateCompensationStatus(state.id, 'partial');
    coreWarn(
      'Saga flagged for manual review — SQLite and git may be divergent',
      {
        operation: 'saga:recovery:flagged',
        sagaId: state.id,
        sagaType: state.sagaType,
        lastStep: state.currentStep,
      }
    );
  }
}
