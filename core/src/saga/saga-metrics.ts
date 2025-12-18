/**
 * Saga Metrics
 *
 * Observability and metrics collection for saga execution.
 */

import { SagaMetrics as SagaMetricsType } from './types.js';
import { coreDebug } from '../utils/core-output.js';

/**
 * Metrics collector for saga execution
 */
export class SagaMetricsCollector {
  private metrics: Map<string, SagaMetricsType> = new Map();
  private durations: Map<string, number[]> = new Map();

  /**
   * Record saga execution
   */
  recordExecution(
    sagaType: string,
    success: boolean,
    duration: number,
    compensated: boolean
  ): void {
    let metrics = this.metrics.get(sagaType);
    if (!metrics) {
      metrics = this.initializeMetrics(sagaType);
      this.metrics.set(sagaType, metrics);
    }

    metrics.executionCount++;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }

    if (compensated) {
      metrics.compensationCount++;
    }

    // Record duration
    let durations = this.durations.get(sagaType);
    if (!durations) {
      durations = [];
      this.durations.set(sagaType, durations);
    }
    durations.push(duration);

    // Keep only last 1000 durations for percentile calculation
    if (durations.length > 1000) {
      durations.shift();
    }

    // Update average and percentiles
    this.updatePercentiles(sagaType, metrics, durations);
  }

  /**
   * Record compensation failure
   */
  recordCompensationFailure(sagaType: string): void {
    const metrics = this.metrics.get(sagaType);
    if (metrics) {
      metrics.compensationFailureCount++;
    }
  }

  /**
   * Get metrics for a saga type
   */
  getMetrics(sagaType: string): SagaMetricsType | null {
    return this.metrics.get(sagaType) || null;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): SagaMetricsType[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Reset metrics for a saga type
   */
  resetMetrics(sagaType: string): void {
    this.metrics.delete(sagaType);
    this.durations.delete(sagaType);
  }

  /**
   * Reset all metrics
   */
  resetAllMetrics(): void {
    this.metrics.clear();
    this.durations.clear();
  }

  /**
   * Initialize metrics for a saga type
   */
  private initializeMetrics(sagaType: string): SagaMetricsType {
    return {
      sagaType,
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageDuration: 0,
      p50Duration: 0,
      p95Duration: 0,
      p99Duration: 0,
      compensationCount: 0,
      compensationFailureCount: 0,
    };
  }

  /**
   * Update percentiles for metrics
   */
  private updatePercentiles(
    sagaType: string,
    metrics: SagaMetricsType,
    durations: number[]
  ): void {
    if (durations.length === 0) {
      return;
    }

    // Calculate average
    const sum = durations.reduce((a, b) => a + b, 0);
    metrics.averageDuration = sum / durations.length;

    // Calculate percentiles
    const sorted = [...durations].sort((a, b) => a - b);
    metrics.p50Duration = this.percentile(sorted, 0.5);
    metrics.p95Duration = this.percentile(sorted, 0.95);
    metrics.p99Duration = this.percentile(sorted, 0.99);
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Global metrics collector instance
 */
export const sagaMetrics = new SagaMetricsCollector();
