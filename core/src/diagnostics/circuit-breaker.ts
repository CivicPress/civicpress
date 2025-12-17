/**
 * Diagnostic Circuit Breaker
 *
 * Prevents cascading failures by stopping execution of repeatedly failing checks.
 */

import {
  CircuitBreakerState,
  CircuitBreakerStats,
  DiagnosticError,
  DiagnosticErrorCategory,
} from './types.js';
import { Logger } from '../utils/logger.js';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening (default: 3)
  resetTimeout?: number; // Time in ms before attempting reset (default: 60000)
  halfOpenMaxAttempts?: number; // Max attempts in half-open state (default: 1)
  logger?: Logger;
}

export class DiagnosticCircuitBreaker {
  private failures: Map<string, number> = new Map();
  private states: Map<string, CircuitBreakerState> = new Map();
  private lastFailure: Map<string, number> = new Map();
  private lastSuccess: Map<string, number> = new Map();
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenMaxAttempts: number;
  private readonly logger?: Logger;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold || 3;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 1;
    this.logger = options.logger;
  }

  /**
   * Check if circuit breaker is open for a given check
   */
  isOpen(checkName: string): boolean {
    const state = this.getState(checkName);
    return state === 'open';
  }

  /**
   * Get current state for a check
   */
  getState(checkName: string): CircuitBreakerState {
    const state = this.states.get(checkName) || 'closed';

    // Check if we should transition from open to half-open
    if (state === 'open') {
      const lastFailureTime = this.lastFailure.get(checkName) || 0;
      const now = Date.now();

      if (now - lastFailureTime >= this.resetTimeout) {
        this.states.set(checkName, 'half-open');
        this.logger?.debug(
          `Circuit breaker for ${checkName} transitioning to half-open`
        );
        return 'half-open';
      }
    }

    return state;
  }

  /**
   * Get statistics for a check
   */
  getStats(checkName: string): CircuitBreakerStats {
    const state = this.getState(checkName);
    const failures = this.failures.get(checkName) || 0;
    const successes = this.getSuccessCount(checkName);

    return {
      state,
      failures,
      successes,
      lastFailure: this.lastFailure.get(checkName),
      lastSuccess: this.lastSuccess.get(checkName),
      nextAttempt:
        state === 'open'
          ? (this.lastFailure.get(checkName) || 0) + this.resetTimeout
          : undefined,
    };
  }

  /**
   * Execute a check with circuit breaker protection
   */
  async execute<T>(
    checkName: string,
    fn: () => Promise<T>,
    timeout?: number
  ): Promise<T> {
    const state = this.getState(checkName);

    // Reject if circuit is open
    if (state === 'open') {
      const error: DiagnosticError = {
        category: 'system',
        severity: 'high',
        actionable: false,
        recoverable: true,
        retryable: true,
        message: `Circuit breaker open for ${checkName}. Too many failures.`,
        code: 'CIRCUIT_BREAKER_OPEN',
        details: {
          checkName,
          stats: this.getStats(checkName),
        },
      };
      throw error;
    }

    try {
      // Execute with optional timeout
      const result = timeout
        ? await Promise.race([fn(), this.createTimeout(timeout, checkName)])
        : await fn();

      // Record success
      this.recordSuccess(checkName);
      return result;
    } catch (error: any) {
      // Record failure
      this.recordFailure(checkName);
      throw error;
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(checkName: string): void {
    this.lastSuccess.set(checkName, Date.now());
    this.failures.set(checkName, 0);

    // If we were in half-open, transition to closed
    const state = this.getState(checkName);
    if (state === 'half-open') {
      this.states.set(checkName, 'closed');
      this.logger?.info(
        `Circuit breaker for ${checkName} closed after successful execution`
      );
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(checkName: string): void {
    const currentFailures = (this.failures.get(checkName) || 0) + 1;
    this.failures.set(checkName, currentFailures);
    this.lastFailure.set(checkName, Date.now());

    const state = this.getState(checkName);

    // If we've exceeded threshold, open the circuit
    if (currentFailures >= this.threshold) {
      if (state !== 'open') {
        this.states.set(checkName, 'open');
        this.logger?.warn(
          `Circuit breaker opened for ${checkName} after ${currentFailures} failures`
        );
      }
    } else if (state === 'half-open') {
      // If we fail in half-open, go back to open
      this.states.set(checkName, 'open');
      this.logger?.warn(
        `Circuit breaker for ${checkName} reopened after failure in half-open state`
      );
    }
  }

  /**
   * Reset circuit breaker for a check (manual reset)
   */
  reset(checkName: string): void {
    this.failures.set(checkName, 0);
    this.states.set(checkName, 'closed');
    this.lastFailure.delete(checkName);
    this.logger?.info(`Circuit breaker manually reset for ${checkName}`);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.failures.clear();
    this.states.clear();
    this.lastFailure.clear();
    this.logger?.info('All circuit breakers reset');
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number, checkName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        const error: DiagnosticError = {
          category: 'system',
          severity: 'medium',
          actionable: false,
          recoverable: true,
          retryable: true,
          message: `Check ${checkName} timed out after ${ms}ms`,
          code: 'CHECK_TIMEOUT',
          details: {
            checkName,
            timeout: ms,
          },
        };
        reject(error);
      }, ms);
    });
  }

  /**
   * Get success count (stored separately, not in failures map)
   */
  private getSuccessCount(checkName: string): number {
    // For simplicity, we'll track this separately if needed
    // For now, return 0 as we're primarily tracking failures
    return 0;
  }
}
