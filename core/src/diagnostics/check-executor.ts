/**
 * Check Executor
 *
 * Executes diagnostic checks in parallel with concurrency control, timeout handling, and progress reporting.
 */

import {
  CheckResult,
  DiagnosticChecker,
  DiagnosticOptions,
  DiagnosticProgress,
} from './types.js';
import { DiagnosticCircuitBreaker } from './circuit-breaker.js';
import { ResourceMonitor } from './resource-monitor.js';
import { Logger } from '../utils/logger.js';

export interface CheckExecutorOptions {
  maxConcurrency?: number; // Default: 5
  defaultTimeout?: number; // Default: 30000ms
  circuitBreaker?: DiagnosticCircuitBreaker;
  resourceMonitor?: ResourceMonitor;
  logger?: Logger;
}

export class CheckExecutor {
  private readonly maxConcurrency: number;
  private readonly defaultTimeout: number;
  private readonly circuitBreaker?: DiagnosticCircuitBreaker;
  private readonly resourceMonitor?: ResourceMonitor;
  private readonly logger?: Logger;

  constructor(options: CheckExecutorOptions = {}) {
    this.maxConcurrency = options.maxConcurrency || 5;
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.circuitBreaker = options.circuitBreaker;
    this.resourceMonitor = options.resourceMonitor;
    this.logger = options.logger;
  }

  /**
   * Execute all checks with concurrency control
   */
  async executeAll(
    checkers: DiagnosticChecker[],
    progressCallback?: (progress: DiagnosticProgress) => void,
    options?: DiagnosticOptions
  ): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const total = checkers.length;
    let completed = 0;

    // Execute checks in batches with concurrency control
    for (let i = 0; i < checkers.length; i += this.maxConcurrency) {
      const batch = checkers.slice(i, i + this.maxConcurrency);

      const batchResults = await Promise.allSettled(
        batch.map(async (checker) => {
          return this.executeCheck(checker, options);
        })
      );

      // Process batch results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        completed++;

        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result
          const errorResult: CheckResult = {
            name: batch[j].name,
            status: 'error',
            message: result.reason?.message || 'Check failed',
            error: result.reason,
          };
          results.push(errorResult);
        }

        // Report progress
        if (progressCallback) {
          progressCallback({
            component: batch[j].component,
            check: batch[j].name,
            completed,
            total,
            percentage: Math.round((completed / total) * 100),
            currentStatus:
              result.status === 'fulfilled' ? result.value.status : 'error',
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute a single check with timeout and circuit breaker
   */
  async executeCheck(
    checker: DiagnosticChecker,
    options?: DiagnosticOptions
  ): Promise<CheckResult> {
    const startTime = Date.now();
    const timeout = checker.timeout || options?.timeout || this.defaultTimeout;
    const checkName = `${checker.component}:${checker.name}`;

    try {
      // Check resource monitor if available
      if (this.resourceMonitor) {
        this.resourceMonitor.check();
      }

      // Execute with circuit breaker if available
      let result: CheckResult;
      if (this.circuitBreaker) {
        result = await this.circuitBreaker.execute(
          checkName,
          () => checker.check(options),
          timeout
        );
      } else {
        // Execute with timeout
        result = await Promise.race([
          checker.check(options),
          this.createTimeout(timeout, checkName),
        ]);
      }

      // Add duration
      result.duration = Date.now() - startTime;

      this.logger?.debug(`Check completed: ${checkName}`, {
        status: result.status,
        duration: result.duration,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Determine if it's a timeout
      const isTimeout =
        error.code === 'CHECK_TIMEOUT' || error.message?.includes('timed out');

      const result: CheckResult = {
        name: checker.name,
        status: isTimeout ? 'timeout' : 'error',
        message: error.message || 'Check failed',
        duration,
        error: error,
      };

      this.logger?.warn(`Check failed: ${checkName}`, {
        status: result.status,
        duration,
        error: error.message,
      });

      return result;
    }
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number, checkName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Check ${checkName} timed out after ${ms}ms`);
        (error as any).code = 'CHECK_TIMEOUT';
        reject(error);
      }, ms);
    });
  }
}
