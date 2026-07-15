/**
 * Idempotency Mechanism
 *
 * Ensures saga operations are idempotent and safe to retry.
 *
 * FA-CORE-008: keys must be stable across retries of the same operation.
 * Caller-provided keys are scoped per saga type + user (so one client's key
 * can never surface another user's cached result); auto-derived keys hash the
 * stable operation content (user, target resource, request payload) instead
 * of the per-call start timestamp, so double-submits and real retries map to
 * the same key. Auto keys use a short dedup window (`autoKeyTtl`) because two
 * *intentional* identical operations minutes apart are legitimate; explicit
 * keys keep the long TTL because the caller has declared retry semantics.
 */

import { createHash } from 'crypto';
import { SagaStateStore } from './saga-state-store.js';
import { SagaContext, SagaExecutionResult } from './types.js';
import { SagaDuplicateError } from './errors.js';
import { coreDebug, coreInfo } from '../utils/core-output.js';

/**
 * An in-flight ('executing') state row older than this is considered
 * abandoned (crashed process, missed status update) and no longer blocks a
 * retry. Slightly above the executor's default saga timeout (300 s).
 */
const IN_FLIGHT_STALENESS_MS = 6 * 60 * 1000;

/**
 * Idempotency manager for saga operations
 */
export class IdempotencyManager {
  private stateStore: SagaStateStore;
  private ttl: number; // TTL for caller-provided keys (default: 24 hours)
  private autoKeyTtl: number; // Dedup window for auto-derived keys

  constructor(
    stateStore: SagaStateStore,
    ttl: number = 24 * 60 * 60 * 1000,
    autoKeyTtl: number = 5 * 60 * 1000
  ) {
    this.stateStore = stateStore;
    this.ttl = ttl;
    this.autoKeyTtl = autoKeyTtl;
  }

  /**
   * Check if operation is idempotent (already executed)
   * Returns cached result if found.
   * Throws SagaDuplicateError if the same operation is currently in flight.
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
    const ttl = idempotencyKey.startsWith('saga:auto:')
      ? this.autoKeyTtl
      : this.ttl;
    const age = Date.now() - existingState.startedAt.getTime();
    if (age > ttl) {
      coreDebug(
        `Idempotency key expired: ${idempotencyKey}`,
        {
          idempotencyKey,
          age,
          ttl,
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

    // FA-CORE-008: the same operation is currently in flight — reject the
    // double-submit instead of running it a second time. A stale 'executing'
    // row (crashed process) stops blocking after IN_FLIGHT_STALENESS_MS.
    if (
      (existingState.status === 'executing' ||
        existingState.status === 'pending') &&
      age <= IN_FLIGHT_STALENESS_MS
    ) {
      throw new SagaDuplicateError(idempotencyKey, existingState.id);
    }

    // Failed / compensated / abandoned → allow retry
    return null;
  }

  /**
   * Generate idempotency key from context.
   *
   * Already-normalized keys (saga:key:/saga:auto: prefix) pass through
   * unchanged so re-entrant executions don't double-wrap them.
   */
  static generateIdempotencyKey(
    sagaType: string,
    context: SagaContext
  ): string {
    const userId = context.user?.id ?? 'anonymous';

    if (context.idempotencyKey) {
      if (
        context.idempotencyKey.startsWith('saga:key:') ||
        context.idempotencyKey.startsWith('saga:auto:')
      ) {
        return context.idempotencyKey;
      }
      // Scope caller-provided keys so they can never collide across users
      // or saga types.
      return `saga:key:${sagaType}:${userId}:${context.idempotencyKey}`;
    }

    // Derive from the stable operation content. Deliberately excludes
    // startedAt/correlationId (unique per call — the FA-CORE-008 bug) and
    // metadata (which may carry generated ids). context.recordId is only set
    // when it identifies the operation target (update/archive, or a
    // caller-chosen create id).
    const ctx = context as SagaContext & {
      recordId?: string;
      request?: unknown;
    };
    const stable = {
      user: userId,
      recordId: ctx.recordId ?? null,
      draftId: (context.metadata?.draftId as string | undefined) ?? null,
      request: ctx.request ?? null,
    };
    const digest = createHash('sha256')
      .update(JSON.stringify(stable))
      .digest('hex')
      .slice(0, 32);
    return `saga:auto:${sagaType}:${digest}`;
  }
}
