/**
 * Base Saga Step Class
 *
 * Abstract base class for saga steps with common functionality.
 */

import { SagaStep, SagaContext } from './types.js';
import { Logger } from '../utils/logger.js';
import { coreDebug, coreError } from '../utils/core-output.js';

const logger = new Logger();

/**
 * Abstract base class for saga steps
 * Provides common functionality for all steps
 */
export abstract class BaseSagaStep<TContext extends SagaContext, TResult>
  implements SagaStep<TContext, TResult>
{
  abstract name: string;
  abstract isCompensatable: boolean;
  timeout?: number;
  protected logger: Logger;

  constructor(timeout?: number) {
    this.timeout = timeout;
    this.logger = logger;
  }

  /**
   * Execute the step
   * Must be implemented by subclasses
   */
  abstract execute(context: TContext): Promise<TResult>;

  /**
   * Optional compensation function
   * Default implementation does nothing
   */
  async compensate(context: TContext, result: TResult): Promise<void> {
    // Default: no compensation needed
    coreDebug(
      `Step '${this.name}' has no compensation logic`,
      {
        step: this.name,
        correlationId: context.correlationId,
      },
      { operation: 'saga:step:compensate' }
    );
  }

  /**
   * Execute step with timeout handling
   */
  async executeWithTimeout(context: TContext): Promise<TResult> {
    if (!this.timeout) {
      return this.execute(context);
    }

    return Promise.race([
      this.execute(context),
      this.createTimeout(this.timeout, context),
    ]);
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(timeout: number, context: TContext): Promise<TResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Step '${this.name}' timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Log step execution
   */
  protected logStep(
    action: 'start' | 'complete' | 'fail',
    context: TContext,
    result?: TResult,
    error?: Error
  ): void {
    const logData = {
      step: this.name,
      correlationId: context.correlationId,
      idempotencyKey: context.idempotencyKey,
      action,
      ...(result !== undefined && { hasResult: true }),
      ...(error && {
        error: error.message,
        errorType: error.constructor.name,
      }),
    };

    if (action === 'start') {
      coreDebug(`Executing saga step: ${this.name}`, logData, {
        operation: 'saga:step:start',
      });
    } else if (action === 'complete') {
      coreDebug(`Saga step completed: ${this.name}`, logData, {
        operation: 'saga:step:complete',
      });
    } else if (action === 'fail') {
      coreError(`Saga step failed: ${this.name}`, 'SAGA_STEP_FAILED', logData, {
        operation: 'saga:step:fail',
      });
    }
  }
}
