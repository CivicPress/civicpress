/**
 * Retry Manager
 *
 * Implements retry logic with exponential backoff for storage operations
 */

import { Logger, CivicPressError } from '@civicpress/core';
import type { StorageConfig } from '../types/storage.types.js';

export interface RetryConfig {
  maxAttempts?: number;
  initialDelay?: number; // milliseconds
  maxDelay?: number; // milliseconds
  backoffMultiplier?: number;
  retryableErrors?: string[]; // Error codes to retry
}

/**
 * Retry manager with exponential backoff
 */
export class RetryManager {
  private logger: Logger;
  private defaultConfig: Required<RetryConfig>;

  constructor(logger: Logger, config?: StorageConfig) {
    this.logger = logger;

    // Get retry config from storage config or use defaults
    const storageConfig = (config as any)?.global || {};
    this.defaultConfig = {
      maxAttempts: storageConfig.retry_attempts || 3,
      initialDelay: storageConfig.retry_initial_delay || 1000, // 1 second
      maxDelay: storageConfig.retry_max_delay || 30000, // 30 seconds
      backoffMultiplier: storageConfig.retry_backoff_multiplier || 2,
      retryableErrors: storageConfig.retryable_errors || [
        'STORAGE_PROVIDER_UNAVAILABLE',
        'STORAGE_TIMEOUT',
        'NETWORK_ERROR',
        'TIMEOUT',
      ],
    };
  }

  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig = { ...this.defaultConfig, ...config };
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < retryConfig.maxAttempts) {
      try {
        const result = await operation();

        // If this was a retry, log success
        if (attempt > 0) {
          this.logger.info(
            `Operation succeeded after ${attempt} retry attempts`,
            {
              correlationId:
                lastError instanceof CivicPressError
                  ? lastError.correlationId
                  : undefined,
            }
          );
        }

        return result;
      } catch (error) {
        attempt++;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryable(error, retryConfig)) {
          this.logger.debug('Error is not retryable, not retrying', {
            error: lastError.message,
            errorCode:
              error instanceof CivicPressError ? error.code : undefined,
          });
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt >= retryConfig.maxAttempts) {
          this.logger.warn(
            `Operation failed after ${retryConfig.maxAttempts} attempts`,
            {
              error: lastError.message,
              correlationId:
                error instanceof CivicPressError
                  ? error.correlationId
                  : undefined,
            }
          );
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, retryConfig);

        this.logger.info(
          `Retrying operation (attempt ${attempt}/${retryConfig.maxAttempts})`,
          {
            delay: `${delay}ms`,
            error: lastError.message,
            correlationId:
              error instanceof CivicPressError
                ? error.correlationId
                : undefined,
          }
        );

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Operation failed');
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown, config: Required<RetryConfig>): boolean {
    // Check if error has retryable flag (from storage errors)
    if (error instanceof CivicPressError) {
      // Check if error has retryable property (storage errors have this)
      const errorWithRetryable = error as CivicPressError & {
        retryable?: boolean;
      };
      if (errorWithRetryable.retryable === false) {
        return false;
      }
      if (errorWithRetryable.retryable === true) {
        return true;
      }

      // Check error code against retryable errors list
      if (config.retryableErrors.includes(error.code)) {
        return true;
      }

      // Check status code - 5xx errors are retryable, 4xx are not
      if (error.statusCode >= 500) {
        return true;
      }
      if (error.statusCode >= 400 && error.statusCode < 500) {
        return false; // Client errors are not retryable
      }
    }

    // Check error message for common retryable patterns
    const errorMessage = error instanceof Error ? error.message : String(error);
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
    ];

    if (
      retryablePatterns.some((pattern) =>
        errorMessage.toLowerCase().includes(pattern)
      )
    ) {
      return true;
    }

    // Default: don't retry unknown errors
    return false;
  }

  /**
   * Calculate delay with exponential backoff
   * Formula: min(initialDelay * (backoffMultiplier ^ (attempt - 1)), maxDelay)
   */
  private calculateDelay(
    attempt: number,
    config: Required<RetryConfig>
  ): number {
    const exponentialDelay =
      config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);

    return Math.min(exponentialDelay, config.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get default retry configuration
   */
  getDefaultConfig(): Required<RetryConfig> {
    return { ...this.defaultConfig };
  }
}
