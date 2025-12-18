/**
 * Idempotency Mechanism
 *
 * Ensures saga operations are idempotent and safe to retry.
 */

import { SagaStateStore } from './saga-state-store.js';
import { SagaContext, SagaExecutionResult } from './types.js';
import { coreDebug, coreInfo } from '../utils/core-output.js';

/**
 * Idempotency manager for saga operations
 */
export class IdempotencyManager {
  private stateStore: SagaStateStore;
  private ttl: number; // Time to live in milliseconds (default: 24 hours)

  constructor(stateStore: SagaStateStore, ttl: number = 24 * 60 * 60 * 1000) {
    this.stateStore = stateStore;
    this.ttl = ttl;
  }

  /**
   * Check if operation is idempotent (already executed)
   * Returns cached result if found
   */
  async checkIdempotency<TResult>(
    idempotencyKey: string | undefined,
    correlationId: string
  ): Promise<SagaExecutionResult<TResult> | null> {
    if (!idempotencyKey) {
      return null; // No idempotency key, proceed with execution
    }

    const existingState =
      await this.stateStore.getStateByIdempotencyKey(idempotencyKey);

    if (!existingState) {
      return null; // No existing execution found
    }

    // Check if result is still valid (not expired)
    const age = Date.now() - existingState.startedAt.getTime();
    if (age > this.ttl) {
      coreDebug(
        `Idempotency key expired: ${idempotencyKey}`,
        {
          idempotencyKey,
          age,
          ttl: this.ttl,
        },
        { operation: 'saga:idempotency:check' }
      );
      return null; // Expired, allow new execution
    }

    // If saga completed successfully, return cached result
    if (existingState.status === 'completed') {
      coreInfo(
        `Returning cached result for idempotency key: ${idempotencyKey}`,
        {
          idempotencyKey,
          sagaId: existingState.id,
          correlationId,
          operation: 'saga:idempotency:cache-hit',
        }
      );

      // Parse result from step results (last step result is the final result)
      const stepResults = existingState.stepResults;
      const finalResult =
        stepResults.length > 0
          ? JSON.parse(stepResults[stepResults.length - 1])
          : null;

      return {
        result: finalResult as TResult,
        sagaId: existingState.id,
        duration: existingState.completedAt
          ? existingState.completedAt.getTime() -
            existingState.startedAt.getTime()
          : 0,
        compensated: false,
      };
    }

    // If saga is still executing, return null to allow retry (or wait)
    // If saga failed, return null to allow retry
    return null;
  }

  /**
   * Generate idempotency key from context
   */
  static generateIdempotencyKey(
    sagaType: string,
    context: SagaContext
  ): string {
    // Use correlation ID if provided, otherwise generate from context
    if (context.idempotencyKey) {
      return context.idempotencyKey;
    }

    // Generate from saga type and key context fields
    const keyParts = [
      sagaType,
      context.user?.id || 'anonymous',
      context.startedAt.toISOString(),
    ];

    // Add any unique identifiers from metadata
    if (context.metadata?.recordId) {
      keyParts.push(context.metadata.recordId);
    }
    if (context.metadata?.draftId) {
      keyParts.push(context.metadata.draftId);
    }

    // Hash the key parts (simple hash for now)
    const keyString = keyParts.join(':');
    return `saga:${sagaType}:${this.simpleHash(keyString)}`;
  }

  /**
   * Simple hash function for idempotency keys
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
