/**
 * Storage Metrics Collector
 *
 * Collects metrics for storage operations
 */

import { Logger } from '@civicpress/core';

export interface StorageMetrics {
  // Operation counts
  uploads: {
    total: number;
    successful: number;
    failed: number;
    bytesUploaded: number;
  };
  downloads: {
    total: number;
    successful: number;
    failed: number;
    bytesDownloaded: number;
  };
  deletes: {
    total: number;
    successful: number;
    failed: number;
  };
  lists: {
    total: number;
    successful: number;
    failed: number;
  };

  // Performance metrics
  latency: {
    upload: number[]; // milliseconds
    download: number[]; // milliseconds
    delete: number[]; // milliseconds
    list: number[]; // milliseconds
  };

  // Error metrics
  errors: {
    byType: Record<string, number>; // Error code -> count
    byProvider: Record<string, number>; // Provider -> error count
  };

  // Provider metrics
  providers: Record<
    string,
    {
      operations: number;
      errors: number;
      bytesTransferred: number;
      averageLatency: number;
    }
  >;

  // Time range
  startTime: Date;
  lastUpdate: Date;
}

/**
 * Metrics collector for storage operations
 */
export class StorageMetricsCollector {
  private metrics: StorageMetrics;
  private logger: Logger;
  private maxLatencySamples: number = 1000; // Keep last 1000 samples per operation

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): StorageMetrics {
    return {
      uploads: {
        total: 0,
        successful: 0,
        failed: 0,
        bytesUploaded: 0,
      },
      downloads: {
        total: 0,
        successful: 0,
        failed: 0,
        bytesDownloaded: 0,
      },
      deletes: {
        total: 0,
        successful: 0,
        failed: 0,
      },
      lists: {
        total: 0,
        successful: 0,
        failed: 0,
      },
      latency: {
        upload: [],
        download: [],
        delete: [],
        list: [],
      },
      errors: {
        byType: {},
        byProvider: {},
      },
      providers: {},
      startTime: new Date(),
      lastUpdate: new Date(),
    };
  }

  /**
   * Record upload operation
   */
  recordUpload(
    success: boolean,
    bytes: number,
    latency: number,
    provider?: string,
    error?: string
  ): void {
    this.metrics.uploads.total++;
    if (success) {
      this.metrics.uploads.successful++;
      this.metrics.uploads.bytesUploaded += bytes;
    } else {
      this.metrics.uploads.failed++;
      if (error) {
        this.recordError(error, provider);
      }
    }

    this.recordLatency('upload', latency);
    if (provider) {
      this.recordProviderMetric(
        provider,
        'upload',
        success,
        bytes,
        latency,
        error
      );
    }

    this.metrics.lastUpdate = new Date();
  }

  /**
   * Record download operation
   */
  recordDownload(
    success: boolean,
    bytes: number,
    latency: number,
    provider?: string,
    error?: string
  ): void {
    this.metrics.downloads.total++;
    if (success) {
      this.metrics.downloads.successful++;
      this.metrics.downloads.bytesDownloaded += bytes;
    } else {
      this.metrics.downloads.failed++;
      if (error) {
        this.recordError(error, provider);
      }
    }

    this.recordLatency('download', latency);
    if (provider) {
      this.recordProviderMetric(
        provider,
        'download',
        success,
        bytes,
        latency,
        error
      );
    }

    this.metrics.lastUpdate = new Date();
  }

  /**
   * Record delete operation
   */
  recordDelete(
    success: boolean,
    latency: number,
    provider?: string,
    error?: string
  ): void {
    this.metrics.deletes.total++;
    if (success) {
      this.metrics.deletes.successful++;
    } else {
      this.metrics.deletes.failed++;
      if (error) {
        this.recordError(error, provider);
      }
    }

    this.recordLatency('delete', latency);
    if (provider) {
      this.recordProviderMetric(provider, 'delete', success, 0, latency, error);
    }

    this.metrics.lastUpdate = new Date();
  }

  /**
   * Record list operation
   */
  recordList(
    success: boolean,
    latency: number,
    provider?: string,
    error?: string
  ): void {
    this.metrics.lists.total++;
    if (success) {
      this.metrics.lists.successful++;
    } else {
      this.metrics.lists.failed++;
      if (error) {
        this.recordError(error, provider);
      }
    }

    this.recordLatency('list', latency);
    if (provider) {
      this.recordProviderMetric(provider, 'list', success, 0, latency, error);
    }

    this.metrics.lastUpdate = new Date();
  }

  /**
   * Record latency sample
   */
  private recordLatency(
    operation: 'upload' | 'download' | 'delete' | 'list',
    latency: number
  ): void {
    const samples = this.metrics.latency[operation];
    samples.push(latency);

    // Keep only last N samples
    if (samples.length > this.maxLatencySamples) {
      samples.shift();
    }
  }

  /**
   * Record error
   */
  private recordError(errorCode: string, provider?: string): void {
    // Record by error type
    this.metrics.errors.byType[errorCode] =
      (this.metrics.errors.byType[errorCode] || 0) + 1;

    // Record by provider
    if (provider) {
      this.metrics.errors.byProvider[provider] =
        (this.metrics.errors.byProvider[provider] || 0) + 1;
    }
  }

  /**
   * Record provider metric
   */
  private recordProviderMetric(
    provider: string,
    operation: string,
    success: boolean,
    bytes: number,
    latency: number,
    error?: string
  ): void {
    if (!this.metrics.providers[provider]) {
      this.metrics.providers[provider] = {
        operations: 0,
        errors: 0,
        bytesTransferred: 0,
        averageLatency: 0,
      };
    }

    const providerMetrics = this.metrics.providers[provider];
    providerMetrics.operations++;

    if (!success) {
      providerMetrics.errors++;
    }

    providerMetrics.bytesTransferred += bytes;

    // Update average latency (moving average)
    const totalLatency =
      providerMetrics.averageLatency * (providerMetrics.operations - 1) +
      latency;
    providerMetrics.averageLatency = totalLatency / providerMetrics.operations;
  }

  /**
   * Get all metrics
   */
  getMetrics(): StorageMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    totalOperations: number;
    successRate: number;
    totalBytesTransferred: number;
    averageLatencies: {
      upload: number;
      download: number;
      delete: number;
      list: number;
    };
    errorCount: number;
    topErrors: Array<{ code: string; count: number }>;
    providerStats: Array<{
      provider: string;
      operations: number;
      errorRate: number;
      bytesTransferred: number;
      averageLatency: number;
    }>;
  } {
    const totalOperations =
      this.metrics.uploads.total +
      this.metrics.downloads.total +
      this.metrics.deletes.total +
      this.metrics.lists.total;

    const totalSuccessful =
      this.metrics.uploads.successful +
      this.metrics.downloads.successful +
      this.metrics.deletes.successful +
      this.metrics.lists.successful;

    const successRate =
      totalOperations > 0 ? (totalSuccessful / totalOperations) * 100 : 0;

    const totalBytesTransferred =
      this.metrics.uploads.bytesUploaded +
      this.metrics.downloads.bytesDownloaded;

    const calculateAverage = (samples: number[]): number => {
      if (samples.length === 0) return 0;
      const sum = samples.reduce((a, b) => a + b, 0);
      return sum / samples.length;
    };

    const totalErrors = Object.values(this.metrics.errors.byType).reduce(
      (sum, count) => sum + count,
      0
    );

    const topErrors = Object.entries(this.metrics.errors.byType)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const providerStats = Object.entries(this.metrics.providers).map(
      ([provider, stats]) => ({
        provider,
        operations: stats.operations,
        errorRate:
          stats.operations > 0 ? (stats.errors / stats.operations) * 100 : 0,
        bytesTransferred: stats.bytesTransferred,
        averageLatency: stats.averageLatency,
      })
    );

    return {
      totalOperations,
      successRate,
      totalBytesTransferred,
      averageLatencies: {
        upload: calculateAverage(this.metrics.latency.upload),
        download: calculateAverage(this.metrics.latency.download),
        delete: calculateAverage(this.metrics.latency.delete),
        list: calculateAverage(this.metrics.latency.list),
      },
      errorCount: totalErrors,
      topErrors,
      providerStats,
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.logger.debug('Storage metrics reset');
  }

  /**
   * Get metrics as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }
}
