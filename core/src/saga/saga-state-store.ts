/**
 * Saga State Store
 *
 * Handles persistence and retrieval of saga execution states for recovery.
 */

import { DatabaseService } from '../database/database-service.js';
import { SagaState, SagaStatus, CompensationStatus } from './types.js';
import { Logger } from '../utils/logger.js';
import { coreError, coreDebug } from '../utils/core-output.js';

const logger = new Logger();

/**
 * Store for saga state persistence
 */
export class SagaStateStore {
  private db: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService;
  }

  /**
   * Save saga state
   */
  async saveState(state: SagaState): Promise<void> {
    try {
      const sql = `
        INSERT OR REPLACE INTO saga_states (
          id, saga_type, saga_version, context, status, current_step,
          step_results, started_at, completed_at, error,
          compensation_status, compensation_completed_at, compensation_error,
          idempotency_key, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db
        .getAdapter()
        .execute(sql, [
          state.id,
          state.sagaType,
          state.sagaVersion || null,
          state.context,
          state.status,
          state.currentStep,
          JSON.stringify(state.stepResults),
          state.startedAt.toISOString(),
          state.completedAt?.toISOString() || null,
          state.error || null,
          state.compensationStatus || null,
          state.compensationCompletedAt?.toISOString() || null,
          state.compensationError || null,
          state.idempotencyKey || null,
          state.correlationId,
        ]);

      coreDebug(
        `Saga state saved: ${state.id} (${state.status})`,
        {
          sagaId: state.id,
          sagaType: state.sagaType,
          status: state.status,
          step: state.currentStep,
        },
        { operation: 'saga:state:save' }
      );
    } catch (error) {
      coreError(
        `Failed to save saga state: ${state.id}`,
        'SAGA_STATE_SAVE_ERROR',
        {
          sagaId: state.id,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:save' }
      );
      throw error;
    }
  }

  /**
   * Get saga state by ID
   */
  async getState(sagaId: string): Promise<SagaState | null> {
    try {
      const rows = await this.db
        .getAdapter()
        .query('SELECT * FROM saga_states WHERE id = ?', [sagaId]);

      if (rows.length === 0) {
        return null;
      }

      return this.rowToState(rows[0]);
    } catch (error) {
      coreError(
        `Failed to get saga state: ${sagaId}`,
        'SAGA_STATE_GET_ERROR',
        {
          sagaId,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:get' }
      );
      throw error;
    }
  }

  /**
   * Get saga state by idempotency key
   */
  async getStateByIdempotencyKey(
    idempotencyKey: string
  ): Promise<SagaState | null> {
    try {
      const rows = await this.db
        .getAdapter()
        .query('SELECT * FROM saga_states WHERE idempotency_key = ?', [
          idempotencyKey,
        ]);

      if (rows.length === 0) {
        return null;
      }

      return this.rowToState(rows[0]);
    } catch (error) {
      coreError(
        `Failed to get saga state by idempotency key: ${idempotencyKey}`,
        'SAGA_STATE_GET_BY_KEY_ERROR',
        {
          idempotencyKey,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:get-by-key' }
      );
      throw error;
    }
  }

  /**
   * Update saga state status
   */
  async updateStatus(
    sagaId: string,
    status: SagaStatus,
    currentStep?: number,
    error?: string
  ): Promise<void> {
    try {
      const updates: string[] = ['status = ?'];
      const params: any[] = [status];

      if (currentStep !== undefined) {
        updates.push('current_step = ?');
        params.push(currentStep);
      }

      if (error !== undefined) {
        updates.push('error = ?');
        params.push(error);
      }

      if (status === 'completed' || status === 'compensated') {
        updates.push('completed_at = ?');
        params.push(new Date().toISOString());
      }

      params.push(sagaId);

      const sql = `UPDATE saga_states SET ${updates.join(', ')} WHERE id = ?`;

      await this.db.getAdapter().execute(sql, params);

      coreDebug(
        `Saga state updated: ${sagaId} -> ${status}`,
        {
          sagaId,
          status,
          currentStep,
        },
        { operation: 'saga:state:update-status' }
      );
    } catch (error) {
      coreError(
        `Failed to update saga state status: ${sagaId}`,
        'SAGA_STATE_UPDATE_ERROR',
        {
          sagaId,
          status,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:update-status' }
      );
      throw error;
    }
  }

  /**
   * Update step results
   */
  async updateStepResults(
    sagaId: string,
    stepResults: string[]
  ): Promise<void> {
    try {
      await this.db
        .getAdapter()
        .execute('UPDATE saga_states SET step_results = ? WHERE id = ?', [
          JSON.stringify(stepResults),
          sagaId,
        ]);
    } catch (error) {
      coreError(
        `Failed to update step results: ${sagaId}`,
        'SAGA_STATE_UPDATE_STEPS_ERROR',
        {
          sagaId,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:update-steps' }
      );
      throw error;
    }
  }

  /**
   * Update compensation status
   */
  async updateCompensationStatus(
    sagaId: string,
    status: CompensationStatus,
    error?: string
  ): Promise<void> {
    try {
      const updates: string[] = ['compensation_status = ?'];
      const params: any[] = [status];

      if (error !== undefined) {
        updates.push('compensation_error = ?');
        params.push(error);
      }

      if (status === 'completed' || status === 'failed') {
        updates.push('compensation_completed_at = ?');
        params.push(new Date().toISOString());
      }

      params.push(sagaId);

      const sql = `UPDATE saga_states SET ${updates.join(', ')} WHERE id = ?`;

      await this.db.getAdapter().execute(sql, params);
    } catch (error) {
      coreError(
        `Failed to update compensation status: ${sagaId}`,
        'SAGA_COMPENSATION_UPDATE_ERROR',
        {
          sagaId,
          status,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:update-compensation' }
      );
      throw error;
    }
  }

  /**
   * Get stuck sagas (executing for too long)
   */
  async getStuckSagas(timeoutMs: number): Promise<SagaState[]> {
    try {
      const timeoutDate = new Date(Date.now() - timeoutMs);
      const rows = await this.db.getAdapter().query(
        `SELECT * FROM saga_states 
         WHERE status = 'executing' 
         AND started_at < ?`,
        [timeoutDate.toISOString()]
      );

      return rows.map((row) => this.rowToState(row));
    } catch (error) {
      coreError(
        'Failed to get stuck sagas',
        'SAGA_STATE_GET_STUCK_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:get-stuck' }
      );
      throw error;
    }
  }

  /**
   * Get failed sagas that need recovery
   */
  async getFailedSagas(): Promise<SagaState[]> {
    try {
      const rows = await this.db.getAdapter().query(
        `SELECT * FROM saga_states 
         WHERE status = 'failed' 
         AND compensation_status IS NULL OR compensation_status != 'completed'`
      );

      return rows.map((row) => this.rowToState(row));
    } catch (error) {
      coreError(
        'Failed to get failed sagas',
        'SAGA_STATE_GET_FAILED_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'saga:state:get-failed' }
      );
      throw error;
    }
  }

  /**
   * Convert database row to SagaState
   */
  private rowToState(row: any): SagaState {
    return {
      id: row.id,
      sagaType: row.saga_type,
      sagaVersion: row.saga_version || undefined,
      context: row.context,
      status: row.status as SagaStatus,
      currentStep: row.current_step,
      stepResults: JSON.parse(row.step_results || '[]'),
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error || undefined,
      compensationStatus: row.compensation_status
        ? (row.compensation_status as CompensationStatus)
        : undefined,
      compensationCompletedAt: row.compensation_completed_at
        ? new Date(row.compensation_completed_at)
        : undefined,
      compensationError: row.compensation_error || undefined,
      idempotencyKey: row.idempotency_key || undefined,
      correlationId: row.correlation_id,
    };
  }
}
