/**
 * Unit Tests for Check Executor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckExecutor } from '../check-executor.js';
import { DiagnosticCircuitBreaker } from '../circuit-breaker.js';
import { ResourceMonitor } from '../resource-monitor.js';
import { BaseDiagnosticChecker } from '../base-checker.js';
import { Logger } from '../../utils/logger.js';
import { CheckResult } from '../types.js';

// Concrete checker for testing
class TestChecker extends BaseDiagnosticChecker {
  name: string;
  component = 'test';
  shouldFail = false;
  shouldTimeout = false;

  constructor(name: string, shouldFail = false, shouldTimeout = false) {
    super();
    this.name = name;
    this.shouldFail = shouldFail;
    this.shouldTimeout = shouldTimeout;
  }

  async check(): Promise<CheckResult> {
    if (this.shouldTimeout) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (this.shouldFail) {
      throw new Error('Check failed');
    }
    return this.createSuccessResult(`${this.name} passed`);
  }
}

describe('CheckExecutor', () => {
  let executor: CheckExecutor;
  let mockLogger: Logger;
  let circuitBreaker: DiagnosticCircuitBreaker;
  let resourceMonitor: ResourceMonitor;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    circuitBreaker = new DiagnosticCircuitBreaker({ logger: mockLogger });
    resourceMonitor = new ResourceMonitor({ logger: mockLogger });

    executor = new CheckExecutor({
      maxConcurrency: 2,
      defaultTimeout: 100,
      circuitBreaker,
      resourceMonitor,
      logger: mockLogger,
    });
  });

  describe('executeCheck', () => {
    it('should execute a single check successfully', async () => {
      const checker = new TestChecker('test1');

      const result = await executor.executeCheck(checker);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('test1 passed');
    });

    it('should handle check failures', async () => {
      const checker = new TestChecker('test1', true);

      const result = await executor.executeCheck(checker);

      expect(result.status).toBe('error');
      expect(result.message).toContain('Check failed');
    });

    it('should handle timeouts', async () => {
      const checker = new TestChecker('test1', false, true);

      const result = await executor.executeCheck(checker);

      expect(result.status).toBe('timeout');
    });

    it('should record duration', async () => {
      const checker = new TestChecker('test1');

      const result = await executor.executeCheck(checker);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeAll', () => {
    it('should execute multiple checks in parallel', async () => {
      const checkers = [
        new TestChecker('check1'),
        new TestChecker('check2'),
        new TestChecker('check3'),
      ];

      const results = await executor.executeAll(checkers);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('pass');
      expect(results[1].status).toBe('pass');
      expect(results[2].status).toBe('pass');
    });

    it('should respect max concurrency', async () => {
      // Create checkers that take some time to complete
      class SlowChecker extends BaseDiagnosticChecker {
        name = 'slow-check';
        component = 'test';

        async check(): Promise<CheckResult> {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return this.createSuccessResult('Slow check passed');
        }
      }

      const checkers = Array.from({ length: 5 }, () => new SlowChecker());

      const startTime = Date.now();
      await executor.executeAll(checkers);
      const duration = Date.now() - startTime;

      // With maxConcurrency=2, 5 checks should take at least 3 batches
      // Each check takes ~10ms, so should take at least 30ms
      expect(duration).toBeGreaterThanOrEqual(20);
    });

    it('should handle mixed success and failure', async () => {
      const checkers = [
        new TestChecker('check1'),
        new TestChecker('check2', true), // This one fails
        new TestChecker('check3'),
      ];

      const results = await executor.executeAll(checkers);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('pass');
      expect(results[1].status).toBe('error');
      expect(results[2].status).toBe('pass');
    });

    it('should call progress callback', async () => {
      const checkers = [new TestChecker('check1'), new TestChecker('check2')];

      const progressCalls: any[] = [];
      const progressCallback = vi.fn((progress) => {
        progressCalls.push(progress);
      });

      await executor.executeAll(checkers, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]).toMatchObject({
        component: 'test',
        check: expect.any(String),
        completed: expect.any(Number),
        total: 2,
        percentage: expect.any(Number),
      });
    });
  });
});
