/**
 * Saga-Specific Errors
 *
 * Error classes for saga pattern operations.
 */

import { CivicPressError, InternalError } from '../errors/index.js';

/**
 * Saga step execution error
 * Thrown when a saga step fails during execution
 */
export class SagaStepError extends CivicPressError {
  code = 'SAGA_STEP_ERROR';
  statusCode = 500;

  constructor(
    public step: string,
    public context: any,
    public originalError: Error,
    public additionalContext?: Record<string, any>
  ) {
    super(`Saga step '${step}' failed: ${originalError.message}`, {
      step,
      originalError: originalError.message,
      errorType: originalError.constructor.name,
      ...additionalContext,
    });
  }
}

/**
 * Saga compensation error
 * Thrown when compensation fails
 */
export class SagaCompensationError extends CivicPressError {
  code = 'SAGA_COMPENSATION_ERROR';
  statusCode = 500;

  constructor(
    public step: string,
    public context: any,
    public originalError: Error,
    public additionalContext?: Record<string, any>
  ) {
    super(
      `Saga compensation failed for step '${step}': ${originalError.message}`,
      {
        step,
        originalError: originalError.message,
        errorType: originalError.constructor.name,
        ...additionalContext,
      }
    );
  }
}

/**
 * Uncompensatable failure error
 * Thrown when a step fails and cannot be compensated
 */
export class UncompensatableFailureError extends CivicPressError {
  code = 'UNCOMPENSATABLE_FAILURE';
  statusCode = 500;

  constructor(
    public step: string,
    public context: any,
    public reason?: string
  ) {
    super(
      `Uncompensatable step '${step}' failed. Manual intervention required.${reason ? ` Reason: ${reason}` : ''}`,
      {
        step,
        reason,
      }
    );
  }
}

/**
 * Saga context error
 * Thrown when saga context is invalid
 */
export class SagaContextError extends CivicPressError {
  code = 'SAGA_CONTEXT_ERROR';
  statusCode = 400;

  constructor(
    public sagaName: string,
    public context: any,
    public validationErrors: string[]
  ) {
    super(
      `Invalid context for saga '${sagaName}': ${validationErrors.join(', ')}`,
      {
        sagaName,
        validationErrors,
      }
    );
  }
}

/**
 * Saga timeout error
 * Thrown when a saga step or entire saga times out
 */
export class SagaTimeoutError extends CivicPressError {
  code = 'SAGA_TIMEOUT';
  statusCode = 504;

  constructor(
    public stepOrSaga: string,
    public timeout: number,
    public isStep: boolean = false
  ) {
    super(
      `${isStep ? 'Step' : 'Saga'} '${stepOrSaga}' timed out after ${timeout}ms`,
      {
        stepOrSaga,
        timeout,
        isStep,
      }
    );
  }
}

/**
 * Saga lock error
 * Thrown when resource lock cannot be acquired
 */
export class SagaLockError extends CivicPressError {
  code = 'SAGA_LOCK_ERROR';
  statusCode = 409;

  constructor(
    public resourceKey: string,
    public reason: string
  ) {
    super(`Failed to acquire lock on resource '${resourceKey}': ${reason}`, {
      resourceKey,
      reason,
    });
  }
}

/**
 * Saga recovery error
 * Thrown when saga recovery fails
 */
export class SagaRecoveryError extends InternalError {
  code = 'SAGA_RECOVERY_ERROR';
  statusCode = 500;

  constructor(
    public sagaId: string,
    public reason: string,
    context?: Record<string, any>
  ) {
    super(`Failed to recover saga '${sagaId}': ${reason}`, {
      sagaId,
      reason,
      ...context,
    });
  }
}
