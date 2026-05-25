/**
 * Resource Monitor
 *
 * Monitors resource usage (memory, CPU) during diagnostic checks to prevent system overload.
 */

import { ResourceMetrics } from './types.js';
import { Logger } from '../utils/logger.js';
import * as os from 'os';

/**
 * Thrown when ResourceMonitor.checkLimits() detects that a diagnostic
 * check exceeded the configured memory or CPU-time budget. Replaces the
 * prior `(error as any).code = 'RESOURCE_LIMIT_EXCEEDED'; (error as any).resource = 'memory'`
 * mutation idiom (Phase 2d W3-T3).
 */
export class ResourceLimitError extends Error {
  readonly code = 'RESOURCE_LIMIT_EXCEEDED' as const;
  constructor(
    message: string,
    readonly resource: 'memory' | 'cpu'
  ) {
    super(message);
    this.name = 'ResourceLimitError';
    Object.setPrototypeOf(this, ResourceLimitError.prototype);
  }
}

export interface ResourceMonitorOptions {
  maxMemory?: number; // MB
  maxCpuTime?: number; // milliseconds
  checkInterval?: number; // milliseconds (default: 1000)
  logger?: Logger;
}

export class ResourceMonitor {
  private readonly maxMemory: number;
  private readonly maxCpuTime: number;
  private readonly checkInterval: number;
  private readonly logger?: Logger;
  private startTime: number = 0;
  private startMemory: NodeJS.MemoryUsage | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(options: ResourceMonitorOptions = {}) {
    this.maxMemory = (options.maxMemory || 512) * 1024 * 1024; // Convert MB to bytes
    this.maxCpuTime = options.maxCpuTime || 60000; // 60 seconds
    this.checkInterval = options.checkInterval || 1000; // 1 second
    this.logger = options.logger;
  }

  /**
   * Start monitoring resources
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.startTime = Date.now();
    this.startMemory = process.memoryUsage();
    this.isMonitoring = true;

    this.intervalId = setInterval(() => {
      this.check();
    }, this.checkInterval);

    this.logger?.debug('Resource monitoring started', {
      maxMemory: `${this.maxMemory / 1024 / 1024}MB`,
      maxCpuTime: `${this.maxCpuTime}ms`,
    });
  }

  /**
   * Stop monitoring resources
   */
  stop(): ResourceMetrics {
    if (!this.isMonitoring) {
      return this.getCurrentMetrics();
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isMonitoring = false;
    const metrics = this.getCurrentMetrics();

    this.logger?.debug('Resource monitoring stopped', metrics);
    return metrics;
  }

  /**
   * Check current resource usage and throw if limits exceeded
   */
  check(): void {
    if (!this.isMonitoring) {
      return;
    }

    const metrics = this.getCurrentMetrics();
    const duration = Date.now() - this.startTime;

    // Check memory limit
    if (metrics.memory.heapUsed > this.maxMemory) {
      throw new ResourceLimitError(
        `Memory limit exceeded: ${Math.round(metrics.memory.heapUsed / 1024 / 1024)}MB > ${Math.round(this.maxMemory / 1024 / 1024)}MB`,
        'memory'
      );
    }

    // Check CPU time limit
    if (duration > this.maxCpuTime) {
      throw new ResourceLimitError(
        `CPU time limit exceeded: ${duration}ms > ${this.maxCpuTime}ms`,
        'cpu'
      );
    }
  }

  /**
   * Get current resource metrics
   */
  getCurrentMetrics(): ResourceMetrics {
    const memory = process.memoryUsage();
    const duration = this.startTime ? Date.now() - this.startTime : 0;

    // Calculate CPU usage (simplified - actual CPU usage requires more complex tracking)
    // For now, we'll use a simple approximation based on duration
    const cpuUsage = this.calculateCpuUsage(duration);

    return {
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
      cpu: {
        usage: cpuUsage,
        time: duration,
      },
      duration,
    };
  }

  /**
   * Calculate CPU usage percentage (simplified)
   * In a real implementation, this would track actual CPU time vs wall time
   */
  private calculateCpuUsage(duration: number): number {
    // This is a simplified calculation
    // Real CPU usage tracking would require process.cpuUsage() and more complex logic
    // For now, return a placeholder
    return 0; // Would need proper CPU tracking implementation
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}
