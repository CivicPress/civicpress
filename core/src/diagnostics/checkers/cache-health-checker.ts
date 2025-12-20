/**
 * Cache Health Checker
 *
 * Diagnostic checker for cache health monitoring
 */

import type {
  DiagnosticChecker,
  CheckResult,
  DiagnosticIssue,
} from '../types.js';
import { BaseDiagnosticChecker } from '../base-checker.js';
import { UnifiedCacheManager } from '../../cache/unified-cache-manager.js';
import { Logger } from '../../utils/logger.js';
import * as crypto from 'crypto';

export interface CacheHealthCheckerOptions {
  cacheManager: UnifiedCacheManager;
  logger?: Logger;
  /**
   * Minimum hit rate threshold (0-1)
   * @default 0.5
   */
  minHitRate?: number;
  /**
   * Maximum error count threshold
   * @default 10
   */
  maxErrors?: number;
  /**
   * Maximum memory usage threshold (bytes)
   * @default undefined (no limit)
   */
  maxMemoryUsage?: number;
}

/**
 * Cache health diagnostic checker
 */
export class CacheHealthChecker extends BaseDiagnosticChecker {
  name = 'cache-health';
  component = 'cache';
  private cacheManager: UnifiedCacheManager;
  private minHitRate: number;
  private maxErrors: number;
  private maxMemoryUsage?: number;

  constructor(options: CacheHealthCheckerOptions) {
    super(options.logger);
    this.cacheManager = options.cacheManager;
    this.minHitRate = options.minHitRate ?? 0.5;
    this.maxErrors = options.maxErrors ?? 10;
    this.maxMemoryUsage = options.maxMemoryUsage;
  }

  async check(): Promise<CheckResult> {
    const startTime = Date.now();
    const issues: DiagnosticIssue[] = [];

    try {
      const stats = await this.cacheManager.getGlobalStats();
      const caches = Object.keys(stats.caches);

      // Check each cache
      for (const name of caches) {
        const cacheStats = stats.caches[name];

        // Check hit rate
        if (cacheStats.hitRate < this.minHitRate) {
          issues.push(
            this.createIssue(
              'medium',
              `Cache '${name}' has low hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}% (threshold: ${(this.minHitRate * 100).toFixed(1)}%)`,
              {
                autoFixable: false,
                details: {
                  cache: name,
                  hitRate: cacheStats.hitRate,
                  hits: cacheStats.hits,
                  misses: cacheStats.misses,
                },
              }
            )
          );
        }

        // Check errors
        if (cacheStats.errors > this.maxErrors) {
          issues.push(
            this.createIssue(
              'high',
              `Cache '${name}' has high error count: ${cacheStats.errors} (threshold: ${this.maxErrors})`,
              {
                autoFixable: false,
                details: {
                  cache: name,
                  errors: cacheStats.errors,
                },
              }
            )
          );
        }

        // Check memory usage
        if (
          this.maxMemoryUsage &&
          cacheStats.memoryUsage &&
          cacheStats.memoryUsage > this.maxMemoryUsage
        ) {
          issues.push(
            this.createIssue(
              'medium',
              `Cache '${name}' exceeds memory limit: ${(cacheStats.memoryUsage / 1024 / 1024).toFixed(2)}MB (threshold: ${(this.maxMemoryUsage / 1024 / 1024).toFixed(2)}MB)`,
              {
                autoFixable: false,
                details: {
                  cache: name,
                  memoryUsage: cacheStats.memoryUsage,
                  maxMemoryUsage: this.maxMemoryUsage,
                },
              }
            )
          );
        }

        // Check if cache is too large
        if (cacheStats.size >= cacheStats.maxSize * 0.9) {
          issues.push(
            this.createIssue(
              'low',
              `Cache '${name}' is near capacity: ${cacheStats.size}/${cacheStats.maxSize} entries`,
              {
                autoFixable: false,
                details: {
                  cache: name,
                  size: cacheStats.size,
                  maxSize: cacheStats.maxSize,
                },
              }
            )
          );
        }
      }

      const duration = Date.now() - startTime;
      const hasHighSeverity = issues.some(
        (i) => i.severity === 'high' || i.severity === 'critical'
      );
      const hasMediumSeverity = issues.some((i) => i.severity === 'medium');
      const status = hasHighSeverity
        ? 'error'
        : hasMediumSeverity
          ? 'warning'
          : 'pass';

      return {
        name: this.name,
        status,
        message: `Cache health check completed: ${caches.length} caches checked`,
        duration,
        details: {
          cacheCount: caches.length,
          globalHitRate: stats.global.totalHitRate,
          globalSize: stats.global.totalSize,
          globalMemoryUsage: stats.global.totalMemoryUsage,
          issues: issues.length,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return this.createErrorResult(
        'Cache health check failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          duration,
        }
      );
    }
  }
}
