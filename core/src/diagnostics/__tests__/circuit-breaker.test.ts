/**
 * Unit Tests for Diagnostic Circuit Breaker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticCircuitBreaker } from '../circuit-breaker.js';
import { Logger } from '../../utils/logger.js';

describe('DiagnosticCircuitBreaker', () => {
  let circuitBreaker: DiagnosticCircuitBreaker;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    circuitBreaker = new DiagnosticCircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 100, // Short timeout for testing
      logger: mockLogger,
    });
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState('test-check')).toBe('closed');
      expect(circuitBreaker.isOpen('test-check')).toBe(false);
    });
  });

  describe('successful execution', () => {
    it('should execute function successfully when closed', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute('test-check', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should record success and reset failure count', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      // Record some failures first
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');

      // Then succeed
      await circuitBreaker.execute('test-check', fn);

      const stats = circuitBreaker.getStats('test-check');
      expect(stats.failures).toBe(0);
      expect(stats.state).toBe('closed');
    });
  });

  describe('failure handling', () => {
    it('should record failures', () => {
      circuitBreaker.recordFailure('test-check');
      const stats = circuitBreaker.getStats('test-check');

      expect(stats.failures).toBe(1);
      expect(stats.state).toBe('closed');
    });

    it('should open circuit after threshold failures', () => {
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');

      const stats = circuitBreaker.getStats('test-check');
      expect(stats.failures).toBe(3);
      expect(stats.state).toBe('open');
      expect(circuitBreaker.isOpen('test-check')).toBe(true);
    });

    it('should reject execution when circuit is open', async () => {
      // Open the circuit
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');

      const fn = vi.fn().mockResolvedValue('success');

      await expect(
        circuitBreaker.execute('test-check', fn)
      ).rejects.toMatchObject({
        code: 'CIRCUIT_BREAKER_OPEN',
      });

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    it('should timeout after specified duration', async () => {
      const fn = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 200))
        );

      await expect(
        circuitBreaker.execute('test-check', fn, 50)
      ).rejects.toMatchObject({
        code: 'CHECK_TIMEOUT',
      });
    });
  });

  describe('half-open state', () => {
    it('should transition to half-open after reset timeout', async () => {
      // Open the circuit
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      const state = circuitBreaker.getState('test-check');
      expect(state).toBe('half-open');
    });

    it('should close circuit on success in half-open state', async () => {
      // Open and wait for half-open
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Execute successfully
      const fn = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute('test-check', fn);

      const stats = circuitBreaker.getStats('test-check');
      expect(stats.state).toBe('closed');
    });

    it('should reopen circuit on failure in half-open state', async () => {
      // Open and wait for half-open
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Fail again
      circuitBreaker.recordFailure('test-check');

      const stats = circuitBreaker.getStats('test-check');
      expect(stats.state).toBe('open');
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker for specific check', () => {
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');

      circuitBreaker.reset('test-check');

      const stats = circuitBreaker.getStats('test-check');
      expect(stats.failures).toBe(0);
      expect(stats.state).toBe('closed');
    });

    it('should reset all circuit breakers', () => {
      circuitBreaker.recordFailure('check1');
      circuitBreaker.recordFailure('check2');

      circuitBreaker.resetAll();

      expect(circuitBreaker.getStats('check1').failures).toBe(0);
      expect(circuitBreaker.getStats('check2').failures).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should provide accurate statistics', () => {
      circuitBreaker.recordFailure('test-check');
      circuitBreaker.recordFailure('test-check');

      const stats = circuitBreaker.getStats('test-check');

      expect(stats).toMatchObject({
        failures: 2,
        state: 'closed',
      });
      expect(stats.lastFailure).toBeDefined();
    });
  });
});
