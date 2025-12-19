/**
 * Unit Tests for Storage Metrics Collector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageMetricsCollector } from '../metrics/storage-metrics-collector.js';
import { Logger } from '@civicpress/core';

describe('StorageMetricsCollector', () => {
  let collector: StorageMetricsCollector;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    collector = new StorageMetricsCollector(mockLogger);
  });

  describe('recordUpload', () => {
    it('should record successful upload', () => {
      collector.recordUpload(true, 1000, 50, 's3');

      const metrics = collector.getMetrics();
      expect(metrics.uploads.total).toBe(1);
      expect(metrics.uploads.successful).toBe(1);
      expect(metrics.uploads.failed).toBe(0);
      expect(metrics.uploads.bytesUploaded).toBe(1000);
    });

    it('should record failed upload', () => {
      collector.recordUpload(false, 1000, 50, 's3', 'STORAGE_TIMEOUT');

      const metrics = collector.getMetrics();
      expect(metrics.uploads.total).toBe(1);
      expect(metrics.uploads.successful).toBe(0);
      expect(metrics.uploads.failed).toBe(1);
      expect(metrics.uploads.bytesUploaded).toBe(0);
    });

    it('should track latency', () => {
      collector.recordUpload(true, 1000, 100, 's3');
      collector.recordUpload(true, 2000, 200, 's3');

      const metrics = collector.getMetrics();
      expect(metrics.latency.upload.length).toBe(2);
      expect(metrics.latency.upload).toContain(100);
      expect(metrics.latency.upload).toContain(200);
    });

    it('should track provider metrics', () => {
      collector.recordUpload(true, 1000, 50, 's3');
      collector.recordUpload(true, 2000, 75, 's3');
      collector.recordUpload(false, 500, 30, 'azure', 'STORAGE_TIMEOUT');

      const metrics = collector.getMetrics();
      expect(metrics.providers.s3).toBeDefined();
      expect(metrics.providers.s3.operations).toBe(2);
      expect(metrics.providers.s3.bytesTransferred).toBe(3000);
      expect(metrics.providers.azure).toBeDefined();
      expect(metrics.providers.azure.errors).toBe(1);
    });
  });

  describe('recordDownload', () => {
    it('should record successful download', () => {
      collector.recordDownload(true, 5000, 100, 's3');

      const metrics = collector.getMetrics();
      expect(metrics.downloads.total).toBe(1);
      expect(metrics.downloads.successful).toBe(1);
      expect(metrics.downloads.bytesDownloaded).toBe(5000);
    });

    it('should record failed download', () => {
      collector.recordDownload(false, 0, 50, 's3', 'STORAGE_FILE_NOT_FOUND');

      const metrics = collector.getMetrics();
      expect(metrics.downloads.total).toBe(1);
      expect(metrics.downloads.successful).toBe(0);
      expect(metrics.downloads.failed).toBe(1);
    });
  });

  describe('recordDelete', () => {
    it('should record successful delete', () => {
      collector.recordDelete(true, 25, 's3');

      const metrics = collector.getMetrics();
      expect(metrics.deletes.total).toBe(1);
      expect(metrics.deletes.successful).toBe(1);
      expect(metrics.deletes.failed).toBe(0);
    });

    it('should record failed delete', () => {
      collector.recordDelete(false, 30, 's3', 'STORAGE_FILE_NOT_FOUND');

      const metrics = collector.getMetrics();
      expect(metrics.deletes.total).toBe(1);
      expect(metrics.deletes.successful).toBe(0);
      expect(metrics.deletes.failed).toBe(1);
    });
  });

  describe('recordList', () => {
    it('should record successful list', () => {
      collector.recordList(true, 15, 's3');

      const metrics = collector.getMetrics();
      expect(metrics.lists.total).toBe(1);
      expect(metrics.lists.successful).toBe(1);
      expect(metrics.lists.failed).toBe(0);
    });

    it('should record failed list', () => {
      collector.recordList(false, 20, 's3', 'STORAGE_TIMEOUT');

      const metrics = collector.getMetrics();
      expect(metrics.lists.total).toBe(1);
      expect(metrics.lists.successful).toBe(0);
      expect(metrics.lists.failed).toBe(1);
    });
  });

  describe('Error Tracking', () => {
    it('should track errors by type', () => {
      collector.recordUpload(false, 0, 50, 's3', 'STORAGE_TIMEOUT');
      collector.recordUpload(false, 0, 60, 's3', 'STORAGE_TIMEOUT');
      collector.recordDownload(false, 0, 70, 'azure', 'STORAGE_FILE_NOT_FOUND');

      const metrics = collector.getMetrics();
      expect(metrics.errors.byType.STORAGE_TIMEOUT).toBe(2);
      expect(metrics.errors.byType.STORAGE_FILE_NOT_FOUND).toBe(1);
    });

    it('should track errors by provider', () => {
      collector.recordUpload(false, 0, 50, 's3', 'STORAGE_TIMEOUT');
      collector.recordDownload(false, 0, 60, 's3', 'STORAGE_TIMEOUT');
      collector.recordDelete(false, 70, 'azure', 'STORAGE_FILE_NOT_FOUND');

      const metrics = collector.getMetrics();
      expect(metrics.errors.byProvider.s3).toBe(2);
      expect(metrics.errors.byProvider.azure).toBe(1);
    });
  });

  describe('getSummary', () => {
    it('should calculate success rate', () => {
      collector.recordUpload(true, 1000, 50, 's3');
      collector.recordUpload(true, 2000, 60, 's3');
      collector.recordUpload(false, 0, 70, 's3', 'STORAGE_TIMEOUT');

      const summary = collector.getSummary();
      expect(summary.totalOperations).toBe(3);
      expect(summary.successRate).toBeCloseTo(66.67, 1);
    });

    it('should calculate average latencies', () => {
      collector.recordUpload(true, 1000, 100, 's3');
      collector.recordUpload(true, 2000, 200, 's3');
      collector.recordDownload(true, 5000, 150, 's3');
      collector.recordDownload(true, 3000, 250, 's3');

      const summary = collector.getSummary();
      expect(summary.averageLatencies.upload).toBe(150);
      expect(summary.averageLatencies.download).toBe(200);
    });

    it('should calculate total bytes transferred', () => {
      collector.recordUpload(true, 1000, 50, 's3');
      collector.recordUpload(true, 2000, 60, 's3');
      collector.recordDownload(true, 5000, 70, 's3');

      const summary = collector.getSummary();
      expect(summary.totalBytesTransferred).toBe(8000);
    });

    it('should identify top errors', () => {
      collector.recordUpload(false, 0, 50, 's3', 'STORAGE_TIMEOUT');
      collector.recordUpload(false, 0, 60, 's3', 'STORAGE_TIMEOUT');
      collector.recordUpload(false, 0, 70, 's3', 'STORAGE_TIMEOUT');
      collector.recordDownload(false, 0, 80, 's3', 'STORAGE_FILE_NOT_FOUND');

      const summary = collector.getSummary();
      expect(summary.topErrors.length).toBeGreaterThan(0);
      expect(summary.topErrors[0].code).toBe('STORAGE_TIMEOUT');
      expect(summary.topErrors[0].count).toBe(3);
    });

    it('should calculate provider stats', () => {
      collector.recordUpload(true, 1000, 50, 's3');
      collector.recordUpload(true, 2000, 60, 's3');
      collector.recordUpload(false, 0, 70, 's3', 'STORAGE_TIMEOUT');

      const summary = collector.getSummary();
      const s3Stats = summary.providerStats.find((s) => s.provider === 's3');
      expect(s3Stats).toBeDefined();
      expect(s3Stats?.operations).toBe(3);
      expect(s3Stats?.errorRate).toBeCloseTo(33.33, 1);
      expect(s3Stats?.bytesTransferred).toBe(3000);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.recordUpload(true, 1000, 50, 's3');
      collector.recordDownload(true, 2000, 60, 's3');

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.uploads.total).toBe(0);
      expect(metrics.downloads.total).toBe(0);
      expect(metrics.startTime).toBeInstanceOf(Date);
    });
  });

  describe('toJSON', () => {
    it('should serialize metrics to JSON', () => {
      collector.recordUpload(true, 1000, 50, 's3');

      const json = collector.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.uploads.total).toBe(1);
      expect(parsed.uploads.successful).toBe(1);
    });
  });

  describe('Latency Sample Limits', () => {
    it('should limit latency samples', () => {
      // Record more than maxLatencySamples (default: 1000)
      for (let i = 0; i < 1500; i++) {
        collector.recordUpload(true, 1000, i, 's3');
      }

      const metrics = collector.getMetrics();
      // Should keep only last 1000 samples
      expect(metrics.latency.upload.length).toBe(1000);
    });
  });
});
