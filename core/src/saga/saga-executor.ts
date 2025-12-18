/**
 * Saga Executor
 *
 * Core orchestration engine for executing sagas with full lifecycle management.
 */

import {
  Saga,
  SagaContext,
  SagaStep,
  SagaExecutionResult,
  CompensationResult,
  SagaState,
  SagaStatus,
  CompensationStatus,
} from './types.js';
import { SagaStateStore } from './saga-state-store.js';
import { IdempotencyManager } from './idempotency.js';
import { ResourceLockManager } from './resource-lock.js';
import {
  SagaStepError,
  SagaCompensationError,
  SagaContextError,
  SagaTimeoutError,
  UncompensatableFailureError,
} from './errors.js';
import { Logger } from '../utils/logger.js';
import {
  coreDebug,
  coreError,
  coreInfo,
  coreWarn,
} from '../utils/core-output.js';
/**
 * Generate unique saga ID
 */
function generateSagaId(): string {
  return `saga_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

const logger = new Logger();

/**
 * Saga executor configuration
 */
export interface SagaExecutorConfig {
  /** Default timeout for saga execution (ms) */
  defaultTimeout?: number;
  /** Default timeout for individual steps (ms) */
  defaultStepTimeout?: number;
  /** Resource lock timeout (ms) */
  lockTimeout?: number;
  /** Idempotency TTL (ms) */
  idempotencyTtl?: number;
  /** Whether to persist state before each step */
  persistState?: boolean;
}

/**
 * Saga executor
 * Orchestrates saga execution with full lifecycle management
 */
export class SagaExecutor {
  private stateStore: SagaStateStore;
  private idempotencyManager: IdempotencyManager;
  private lockManager: ResourceLockManager;
  private config: Required<SagaExecutorConfig>;

  constructor(
    stateStore: SagaStateStore,
    idempotencyManager: IdempotencyManager,
    lockManager: ResourceLockManager,
    config: SagaExecutorConfig = {}
  ) {
    this.stateStore = stateStore;
    this.idempotencyManager = idempotencyManager;
    this.lockManager = lockManager;
    this.config = {
      defaultTimeout: config.defaultTimeout || 300000, // 5 minutes
      defaultStepTimeout: config.defaultStepTimeout || 60000, // 1 minute
      lockTimeout: config.lockTimeout || 30000, // 30 seconds
      idempotencyTtl: config.idempotencyTtl || 24 * 60 * 60 * 1000, // 24 hours
      persistState: config.persistState !== false, // Default true
    };
  }

  /**
   * Execute a saga
   */
  async execute<TContext extends SagaContext, TResult>(
    saga: Saga<TContext, TResult>,
    context: TContext
  ): Promise<SagaExecutionResult<TResult>> {
    const startTime = Date.now();
    const sagaId = generateSagaId();

    // Generate idempotency key if not provided
    if (!context.idempotencyKey) {
      context.idempotencyKey = IdempotencyManager.generateIdempotencyKey(
        saga.name,
        context
      );
    }

    // Check idempotency
    const cachedResult =
      await this.idempotencyManager.checkIdempotency<TResult>(
        context.idempotencyKey,
        context.correlationId
      );

    if (cachedResult) {
      coreInfo(`Returning cached saga result: ${saga.name}`, {
        sagaId,
        sagaName: saga.name,
        idempotencyKey: context.idempotencyKey,
      });
      return cachedResult;
    }

    // Validate context
    if (saga.validateContext) {
      const validation = saga.validateContext(context);
      if (!validation.valid) {
        throw new SagaContextError(
          saga.name,
          context,
          validation.errors || ['Unknown validation error']
        );
      }
    }

    // Get resource key for locking
    const resourceKey = this.getResourceKey(saga.name, context);
    let lock = null;

    try {
      // Acquire resource lock
      if (resourceKey) {
        lock = await this.lockManager.acquireLock(
          resourceKey,
          sagaId,
          this.config.lockTimeout
        );
      }

      // Create initial state
      const initialState: SagaState = {
        id: sagaId,
        sagaType: saga.name,
        sagaVersion: saga.version,
        context: JSON.stringify(context),
        status: 'executing',
        currentStep: 0,
        stepResults: [],
        startedAt: new Date(),
        idempotencyKey: context.idempotencyKey,
        correlationId: context.correlationId,
      };

      // Persist initial state
      if (this.config.persistState) {
        await this.stateStore.saveState(initialState);
      }

      // Execute saga with timeout
      const result = await Promise.race([
        this.executeSaga(saga, context, sagaId),
        this.createSagaTimeout(saga.name, sagaId),
      ]);

      const duration = Date.now() - startTime;

      // Update state to completed
      if (this.config.persistState) {
        await this.stateStore.updateStatus(sagaId, 'completed');
      }

      coreInfo(`Saga completed successfully: ${saga.name}`, {
        sagaId,
        sagaName: saga.name,
        duration,
        steps: saga.steps.length,
      });

      return {
        result,
        sagaId,
        duration,
        compensated: false,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle timeout error
      if (error instanceof SagaTimeoutError) {
        await this.stateStore.updateStatus(
          sagaId,
          'failed',
          undefined,
          error.message
        );
        throw error;
      }

      // Handle step error - need to compensate
      if (error instanceof SagaStepError) {
        const compensationResult = await this.compensate(
          saga,
          context,
          sagaId,
          error.step,
          error
        );

        await this.stateStore.updateStatus(
          sagaId,
          'failed',
          undefined,
          error.message
        );

        if (compensationResult.requiresManualIntervention) {
          coreError(
            `Saga failed and requires manual intervention: ${saga.name}`,
            'SAGA_MANUAL_INTERVENTION_REQUIRED',
            {
              sagaId,
              sagaName: saga.name,
              failedStep: error.step,
              compensationResult,
            }
          );
        }

        throw error;
      }

      // Other errors
      await this.stateStore.updateStatus(
        sagaId,
        'failed',
        undefined,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    } finally {
      // Release resource lock
      if (lock && resourceKey) {
        try {
          await this.lockManager.releaseLock(resourceKey, sagaId);
        } catch (error) {
          coreWarn(`Failed to release lock: ${resourceKey}`, {
            resourceKey,
            sagaId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Execute saga steps
   */
  private async executeSaga<TContext extends SagaContext, TResult>(
    saga: Saga<TContext, TResult>,
    context: TContext,
    sagaId: string
  ): Promise<TResult> {
    const stepResults: any[] = [];
    let currentStepIndex = 0;

    try {
      for (let i = 0; i < saga.steps.length; i++) {
        currentStepIndex = i;
        const step = saga.steps[i];

        coreDebug(
          `Executing saga step: ${step.name} (${i + 1}/${saga.steps.length})`,
          {
            sagaId,
            sagaName: saga.name,
            stepName: step.name,
            stepIndex: i,
          }
        );

        // Update state before step execution
        if (this.config.persistState) {
          await this.stateStore.updateStatus(sagaId, 'executing', i);
          await this.stateStore.updateStepResults(
            sagaId,
            stepResults.map((r) => JSON.stringify(r))
          );
        }

        // Execute step with timeout
        const stepTimeout = step.timeout || this.config.defaultStepTimeout;
        const stepResult = await Promise.race([
          step.execute(context),
          this.createStepTimeout(step.name, stepTimeout, sagaId),
        ]);

        stepResults.push(stepResult);

        // Update step results
        if (this.config.persistState) {
          await this.stateStore.updateStepResults(
            sagaId,
            stepResults.map((r) => JSON.stringify(r))
          );
        }

        coreDebug(`Saga step completed: ${step.name}`, {
          sagaId,
          stepName: step.name,
          stepIndex: i,
        });
      }

      // Return final result (last step result)
      return stepResults[stepResults.length - 1] as TResult;
    } catch (error) {
      // Update state with current step
      if (this.config.persistState) {
        await this.stateStore.updateStatus(
          sagaId,
          'failed',
          currentStepIndex,
          error instanceof Error ? error.message : String(error)
        );
      }

      // Wrap error in SagaStepError if not already
      if (error instanceof SagaStepError) {
        throw error;
      }

      const step = saga.steps[currentStepIndex];
      throw new SagaStepError(
        step?.name || `step-${currentStepIndex}`,
        context,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Compensate for failed saga
   */
  private async compensate<TContext extends SagaContext>(
    saga: Saga<TContext, any>,
    context: TContext,
    sagaId: string,
    failedStepName: string,
    originalError: SagaStepError
  ): Promise<CompensationResult> {
    const failedStepIndex = saga.steps.findIndex(
      (s) => s.name === failedStepName
    );
    if (failedStepIndex === -1) {
      return {
        success: false,
        failedSteps: [],
        requiresManualIntervention: true,
        error: `Failed step '${failedStepName}' not found in saga`,
      };
    }

    // Update compensation status
    if (this.config.persistState) {
      await this.stateStore.updateCompensationStatus(sagaId, 'executing');
    }

    const result: CompensationResult = {
      success: true,
      failedSteps: [],
      requiresManualIntervention: false,
    };

    // Compensate steps in reverse order (from failed step backwards)
    for (let i = failedStepIndex - 1; i >= 0; i--) {
      const step = saga.steps[i];

      // Skip non-compensatable steps
      if (!step.isCompensatable || !step.compensate) {
        coreDebug(
          `Skipping compensation for non-compensatable step: ${step.name}`,
          {
            sagaId,
            stepName: step.name,
          }
        );
        continue;
      }

      try {
        coreDebug(`Compensating step: ${step.name}`, {
          sagaId,
          stepName: step.name,
          stepIndex: i,
        });

        // Get step result from state if available
        const state = await this.stateStore.getState(sagaId);
        const stepResults = state?.stepResults || [];
        const stepResult = stepResults[i]
          ? JSON.parse(stepResults[i])
          : undefined;

        // Execute compensation
        await step.compensate(context, stepResult);

        coreDebug(`Step compensation completed: ${step.name}`, {
          sagaId,
          stepName: step.name,
        });
      } catch (error) {
        result.success = false;
        result.failedSteps.push(step.name);

        coreError(
          `Compensation failed for step: ${step.name}`,
          'SAGA_COMPENSATION_FAILED',
          {
            sagaId,
            stepName: step.name,
            error: error instanceof Error ? error.message : String(error),
          }
        );

        // If this is a critical step, mark for manual intervention
        if (this.isCriticalStep(step)) {
          result.requiresManualIntervention = true;
          result.error = `Critical step '${step.name}' compensation failed: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      }
    }

    // Update compensation status
    if (this.config.persistState) {
      const compensationStatus: CompensationStatus = result.success
        ? 'completed'
        : result.requiresManualIntervention
          ? 'failed'
          : 'partial';

      await this.stateStore.updateCompensationStatus(
        sagaId,
        compensationStatus,
        result.error
      );
    }

    return result;
  }

  /**
   * Check if step is critical (compensation failure requires manual intervention)
   */
  private isCriticalStep<TContext extends SagaContext>(
    step: SagaStep<TContext, any>
  ): boolean {
    // Git commits are always critical
    if (
      step.name.toLowerCase().includes('git') ||
      step.name.toLowerCase().includes('commit')
    ) {
      return true;
    }

    // Database operations that modify published state are critical
    if (
      step.name.toLowerCase().includes('publish') ||
      step.name.toLowerCase().includes('move') ||
      step.name.toLowerCase().includes('delete')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get resource key for locking
   */
  private getResourceKey(
    sagaName: string,
    context: SagaContext
  ): string | null {
    // Generate resource key from context
    if (context.metadata?.recordId) {
      return `record:${context.metadata.recordId}`;
    }
    if (context.metadata?.draftId) {
      return `draft:${context.metadata.draftId}`;
    }

    // No specific resource, no locking needed
    return null;
  }

  /**
   * Create saga timeout promise
   */
  private createSagaTimeout(sagaName: string, sagaId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new SagaTimeoutError(sagaName, this.config.defaultTimeout, false)
        );
      }, this.config.defaultTimeout);
    });
  }

  /**
   * Create step timeout promise
   */
  private createStepTimeout(
    stepName: string,
    timeout: number,
    sagaId: string
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new SagaTimeoutError(stepName, timeout, true));
      }, timeout);
    });
  }
}
