/**
 * Saga Recovery
 *
 * Handles recovery of failed and stuck sagas.
 */

import { SagaStateStore } from './saga-state-store.js';
import { SagaState, SagaStatus } from './types.js';
import { SagaRecoveryError } from './errors.js';
import { Logger } from '../utils/logger.js';
import {
  coreDebug,
  coreError,
  coreInfo,
  coreWarn,
} from '../utils/core-output.js';

const logger = new Logger();

/**
 * Saga recovery configuration
 */
export interface SagaRecoveryConfig {
  /** Timeout for stuck sagas (ms) */
  stuckSagaTimeout?: number;
  /** Maximum retry attempts for failed sagas */
  maxRetryAttempts?: number;
  /** Retry delay (ms) */
  retryDelay?: number;
}

/**
 * Saga recovery manager
 */
export class SagaRecovery {
  private stateStore: SagaStateStore;
  private config: Required<SagaRecoveryConfig>;

  constructor(stateStore: SagaStateStore, config: SagaRecoveryConfig = {}) {
    this.stateStore = stateStore;
    this.config = {
      stuckSagaTimeout: config.stuckSagaTimeout || 300000, // 5 minutes
      maxRetryAttempts: config.maxRetryAttempts || 3,
      retryDelay: config.retryDelay || 60000, // 1 minute
    };
  }

  /**
   * Recover stuck sagas (executing for too long)
   */
  async recoverStuckSagas(): Promise<number> {
    try {
      const stuckSagas = await this.stateStore.getStuckSagas(
        this.config.stuckSagaTimeout
      );

      if (stuckSagas.length === 0) {
        return 0;
      }

      coreInfo(`Found ${stuckSagas.length} stuck sagas to recover`, {
        count: stuckSagas.length,
        timeout: this.config.stuckSagaTimeout,
      });

      let recovered = 0;
      for (const saga of stuckSagas) {
        try {
          await this.markSagaAsFailed(
            saga.id,
            `Saga stuck in executing state for more than ${this.config.stuckSagaTimeout}ms`
          );
          recovered++;
        } catch (error) {
          coreError(
            `Failed to recover stuck saga: ${saga.id}`,
            'SAGA_RECOVERY_ERROR',
            {
              sagaId: saga.id,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      coreInfo(`Recovered ${recovered} stuck sagas`, {
        recovered,
        total: stuckSagas.length,
      });

      return recovered;
    } catch (error) {
      coreError('Failed to recover stuck sagas', 'SAGA_RECOVERY_ERROR', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Recover failed sagas (attempt compensation if needed)
   */
  async recoverFailedSagas(): Promise<number> {
    try {
      const failedSagas = await this.stateStore.getFailedSagas();

      if (failedSagas.length === 0) {
        return 0;
      }

      coreInfo(`Found ${failedSagas.length} failed sagas to recover`, {
        count: failedSagas.length,
      });

      let recovered = 0;
      for (const saga of failedSagas) {
        try {
          // Check if compensation is needed
          if (
            !saga.compensationStatus ||
            saga.compensationStatus === 'pending' ||
            saga.compensationStatus === 'partial'
          ) {
            coreWarn(`Failed saga requires compensation: ${saga.id}`, {
              sagaId: saga.id,
              sagaType: saga.sagaType,
              compensationStatus: saga.compensationStatus,
            });
            // Note: Actual compensation would need saga instance
            // This is a placeholder for recovery logic
          }

          // Mark as requiring manual intervention if compensation failed
          if (saga.compensationStatus === 'failed') {
            await this.markSagaAsRequiringIntervention(saga.id);
          }

          recovered++;
        } catch (error) {
          coreError(
            `Failed to recover failed saga: ${saga.id}`,
            'SAGA_RECOVERY_ERROR',
            {
              sagaId: saga.id,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      coreInfo(`Processed ${recovered} failed sagas`, {
        recovered,
        total: failedSagas.length,
      });

      return recovered;
    } catch (error) {
      coreError('Failed to recover failed sagas', 'SAGA_RECOVERY_ERROR', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark saga as failed
   */
  private async markSagaAsFailed(
    sagaId: string,
    reason: string
  ): Promise<void> {
    await this.stateStore.updateStatus(sagaId, 'failed', undefined, reason);

    coreDebug(`Marked saga as failed: ${sagaId}`, {
      sagaId,
      reason,
    });
  }

  /**
   * Mark saga as requiring manual intervention
   */
  private async markSagaAsRequiringIntervention(sagaId: string): Promise<void> {
    // Update error message to indicate manual intervention needed
    const state = await this.stateStore.getState(sagaId);
    if (state) {
      const errorMessage = state.error
        ? `${state.error} [MANUAL_INTERVENTION_REQUIRED]`
        : 'Manual intervention required';
      await this.stateStore.updateStatus(
        sagaId,
        'failed',
        undefined,
        errorMessage
      );
    }

    coreWarn(`Saga requires manual intervention: ${sagaId}`, {
      sagaId,
    });
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(): Promise<{
    stuckCount: number;
    failedCount: number;
    totalRecoverable: number;
  }> {
    try {
      const stuckSagas = await this.stateStore.getStuckSagas(
        this.config.stuckSagaTimeout
      );
      const failedSagas = await this.stateStore.getFailedSagas();

      return {
        stuckCount: stuckSagas.length,
        failedCount: failedSagas.length,
        totalRecoverable: stuckSagas.length + failedSagas.length,
      };
    } catch (error) {
      coreError(
        'Failed to get recovery statistics',
        'SAGA_RECOVERY_STATS_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      throw error;
    }
  }
}
