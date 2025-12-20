/**
 * Circuit Breaker
 *
 * Implements circuit breaker pattern for storage providers
 */

import { Logger } from '@civicpress/core';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Open circuit after N failures
  successThreshold: number; // Close circuit after N successes in half-open
  timeout: number; // Milliseconds before transitioning to half-open
  halfOpenMaxCalls: number; // Max calls allowed in half-open state
}

/**
 * Circuit breaker for storage provider operations
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private halfOpenCalls = 0;
  private config: Required<CircuitBreakerConfig>;
  private logger: Logger;
  private provider: string;

  constructor(
    provider: string,
    config: Partial<CircuitBreakerConfig> = {},
    logger?: Logger
  ) {
    this.provider = provider;
    this.logger = logger || new Logger();
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 2,
      timeout: config.timeout || 60000, // 60 seconds
      halfOpenMaxCalls: config.halfOpenMaxCalls || 3,
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      if (this.shouldAttemptHalfOpen()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error(
          `Circuit breaker is OPEN for provider '${this.provider}'. Operation blocked.`
        );
      }
    }

    // Check half-open call limit
    if (
      this.state === 'half-open' &&
      this.halfOpenCalls >= this.config.halfOpenMaxCalls
    ) {
      throw new Error(
        `Circuit breaker is HALF-OPEN for provider '${this.provider}'. Max calls (${this.config.halfOpenMaxCalls}) reached.`
      );
    }

    try {
      // Execute operation
      const result = await operation();

      // Success - handle based on state
      this.onSuccess();
      return result;
    } catch (error) {
      // Failure - handle based on state
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if circuit should transition from open to half-open
   */
  private shouldAttemptHalfOpen(): boolean {
    if (!this.lastFailureTime) {
      return false;
    }

    const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceFailure >= this.config.timeout;
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      this.halfOpenCalls++;

      // If we've had enough successes, close the circuit
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    if (this.state === 'half-open') {
      // Failure in half-open - reopen circuit
      this.transitionToOpen();
    } else if (this.state === 'closed') {
      this.failureCount++;
      this.lastFailureTime = new Date();

      // If we've hit the threshold, open the circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }
  }

  /**
   * Transition to closed state
   */
  private transitionToClosed(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = null;

    this.logger.info(`Circuit breaker CLOSED for provider '${this.provider}'`);
  }

  /**
   * Transition to open state
   */
  private transitionToOpen(): void {
    this.state = 'open';
    this.lastFailureTime = new Date();
    this.successCount = 0;
    this.halfOpenCalls = 0;

    this.logger.warn(
      `Circuit breaker OPENED for provider '${this.provider}' after ${this.failureCount} failures`
    );
  }

  /**
   * Transition to half-open state
   */
  private transitionToHalfOpen(): void {
    this.state = 'half-open';
    this.successCount = 0;
    this.halfOpenCalls = 0;

    this.logger.info(
      `Circuit breaker HALF-OPEN for provider '${this.provider}' - testing recovery`
    );
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset circuit breaker (for testing/manual recovery)
   */
  reset(): void {
    this.transitionToClosed();
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenCalls: this.halfOpenCalls,
      config: this.config,
    };
  }
}

/**
 * Circuit Breaker Manager
 * Manages circuit breakers for multiple providers
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private config: Partial<CircuitBreakerConfig>;
  private logger: Logger;

  constructor(config: Partial<CircuitBreakerConfig> = {}, logger?: Logger) {
    this.config = config;
    this.logger = logger || new Logger();
  }

  /**
   * Get circuit breaker for provider (creates if doesn't exist)
   */
  getBreaker(provider: string): CircuitBreaker {
    if (!this.breakers.has(provider)) {
      this.breakers.set(
        provider,
        new CircuitBreaker(provider, this.config, this.logger)
      );
    }
    return this.breakers.get(provider)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Reset circuit breaker for provider
   */
  resetBreaker(provider: string): void {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
    for (const [provider, breaker] of this.breakers.entries()) {
      stats[provider] = breaker.getStats();
    }
    return stats;
  }
}
