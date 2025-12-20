/**
 * Unit Tests for Resource Monitor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResourceMonitor } from '../resource-monitor.js';
import { Logger } from '../../utils/logger.js';

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;
  });

  afterEach(() => {
    if (monitor && monitor.isActive()) {
      monitor.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize with default limits', () => {
      monitor = new ResourceMonitor({ logger: mockLogger });

      expect(monitor.isActive()).toBe(false);
    });

    it('should initialize with custom limits', () => {
      monitor = new ResourceMonitor({
        maxMemory: 256, // MB
        maxCpuTime: 30000, // ms
        logger: mockLogger,
      });

      expect(monitor.isActive()).toBe(false);
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start monitoring', () => {
      monitor = new ResourceMonitor({ logger: mockLogger });
      monitor.start();

      expect(monitor.isActive()).toBe(true);
    });

    it('should stop monitoring and return metrics', () => {
      monitor = new ResourceMonitor({ logger: mockLogger });
      monitor.start();

      const metrics = monitor.stop();

      expect(monitor.isActive()).toBe(false);
      expect(metrics).toMatchObject({
        memory: expect.any(Object),
        cpu: expect.any(Object),
        duration: expect.any(Number),
      });
    });

    it('should not start if already monitoring', () => {
      monitor = new ResourceMonitor({ logger: mockLogger });
      monitor.start();
      monitor.start(); // Second call should be no-op

      expect(monitor.isActive()).toBe(true);
    });
  });

  describe('resource metrics', () => {
    it('should provide current metrics', () => {
      monitor = new ResourceMonitor({ logger: mockLogger });
      monitor.start();

      const metrics = monitor.getCurrentMetrics();

      expect(metrics).toMatchObject({
        memory: {
          rss: expect.any(Number),
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
          external: expect.any(Number),
        },
        cpu: {
          usage: expect.any(Number),
          time: expect.any(Number),
        },
        duration: expect.any(Number),
      });
    });

    it('should track duration', async () => {
      monitor = new ResourceMonitor({ logger: mockLogger });
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const metrics = monitor.getCurrentMetrics();
      expect(metrics.duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('resource limits', () => {
    it('should not throw when within limits', () => {
      monitor = new ResourceMonitor({
        maxMemory: 10000, // Very high limit
        maxCpuTime: 60000,
        logger: mockLogger,
      });
      monitor.start();

      expect(() => monitor.check()).not.toThrow();
    });

    // Note: Testing actual memory limit violations would require
    // allocating large amounts of memory, which is not practical in unit tests
    // This would be better tested in integration tests
  });
});
