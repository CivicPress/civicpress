/**
 * Saga-Specific Errors
 *
 * Error classes for saga pattern operations.
 */

import { CivicPressError } from '../errors/index.js';
import type { SagaContext } from './types.js';

/**
 * Saga step execution error
 * Thrown when a saga step fails during execution
 */
export class SagaStepError<
  TContext extends SagaContext = SagaContext,
> extends CivicPressError {
  code = 'SAGA_STEP_ERROR';
  statusCode = 500;

  constructor(
    public step: string,
    public sagaContext: TContext,
    public originalError: Error,
    public additionalContext?: Record<string, unknown>
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
export class SagaCompensationError<
  TContext extends SagaContext = SagaContext,
> extends CivicPressError {
  code = 'SAGA_COMPENSATION_ERROR';
  statusCode = 500;

  constructor(
    public step: string,
    public sagaContext: TContext,
    public originalError: Error,
    public additionalContext?: Record<string, unknown>
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
export class UncompensatableFailureError<
  TContext extends SagaContext = SagaContext,
> extends CivicPressError {
  code = 'UNCOMPENSATABLE_FAILURE';
  statusCode = 500;

  constructor(
    public step: string,
    public sagaContext: TContext,
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
export class SagaContextError<
  TContext extends SagaContext = SagaContext,
> extends CivicPressError {
  code = 'SAGA_CONTEXT_ERROR';
  statusCode = 400;

  constructor(
    public sagaName: string,
    public sagaContext: TContext,
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
 * Saga duplicate error
 * Thrown when an operation with the same idempotency key is already in flight
 * (FA-CORE-008 double-submit protection).
 */
export class SagaDuplicateError extends CivicPressError {
  code = 'SAGA_DUPLICATE_OPERATION';
  statusCode = 409;

  constructor(
    public idempotencyKey: string,
    public inFlightSagaId: string
  ) {
    super(
      `An identical operation is already in progress (saga ${inFlightSagaId})`,
      {
        idempotencyKey,
        inFlightSagaId,
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
