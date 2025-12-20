/**
 * Unit Tests for Circuit Breaker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerManager,
} from '../circuit-breaker/circuit-breaker.js';
import { Logger } from '@civicpress/core';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    circuitBreaker = new CircuitBreaker('test-provider', {}, mockLogger);
  });

  describe('State Transitions', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should transition to open after failure threshold', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger failures up to threshold (default: 5)
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('open');
      expect(circuitBreaker.getFailureCount()).toBe(5);
    });

    it('should block operations when open', async () => {
      // Open the circuit
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('open');

      // Try to execute - should be blocked
      await expect(
        circuitBreaker.execute(() => Promise.resolve('success'))
      ).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should transition to half-open after timeout', async () => {
      // Open the circuit
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('open');

      // Wait for timeout (default: 60s, but we'll use a shorter timeout for testing)
      const breaker = new CircuitBreaker('test', { timeout: 100 }, mockLogger);
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should transition to half-open
      expect(breaker.getState()).toBe('half-open');
    });

    it('should close circuit on success in half-open', async () => {
      const breaker = new CircuitBreaker(
        'test',
        {
          timeout: 100,
          successThreshold: 1,
        },
        mockLogger
      );

      // Open the circuit
      const failingOp = vi.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingOp);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Success in half-open should close circuit
      const successOp = vi.fn().mockResolvedValue('success');
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe('closed');
    });

    it('should reopen circuit on failure in half-open', async () => {
      const breaker = new CircuitBreaker(
        'test',
        {
          timeout: 100,
          successThreshold: 2,
        },
        mockLogger
      );

      // Open the circuit
      const failingOp = vi.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingOp);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Failure in half-open should reopen
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('Success Handling', () => {
    it('should reset failure count on success in closed state', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getFailureCount()).toBe(2);

      // Success should reset count
      const successOp = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successOp);

      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should execute successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Half-Open Limits', () => {
    it('should limit calls in half-open state', async () => {
      const breaker = new CircuitBreaker(
        'test',
        {
          timeout: 100,
          halfOpenMaxCalls: 2,
        },
        mockLogger
      );

      // Open the circuit
      const failingOp = vi.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingOp);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should allow limited calls
      const successOp = vi.fn().mockResolvedValue('success');
      await breaker.execute(successOp);
      await breaker.execute(successOp);

      // Third call should be blocked
      await expect(breaker.execute(successOp)).rejects.toThrow('Max calls');
    });
  });

  describe('Reset', () => {
    it('should reset circuit breaker', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('open');

      // Reset
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('Stats', () => {
    it('should return circuit breaker stats', async () => {
      const stats = circuitBreaker.getStats();

      expect(stats.state).toBe('closed');
      expect(stats.failureCount).toBe(0);
      expect(stats.config).toBeDefined();
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    manager = new CircuitBreakerManager({}, mockLogger);
  });

  describe('getBreaker', () => {
    it('should create breaker if not exists', () => {
      const breaker = manager.getBreaker('provider1');
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe('closed');
    });

    it('should return same breaker instance', () => {
      const breaker1 = manager.getBreaker('provider1');
      const breaker2 = manager.getBreaker('provider1');

      expect(breaker1).toBe(breaker2);
    });

    it('should create separate breakers for different providers', () => {
      const breaker1 = manager.getBreaker('provider1');
      const breaker2 = manager.getBreaker('provider2');

      expect(breaker1).not.toBe(breaker2);
    });
  });

  describe('resetBreaker', () => {
    it('should reset specific breaker', async () => {
      const breaker = manager.getBreaker('provider1');
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');

      manager.resetBreaker('provider1');

      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('resetAll', () => {
    it('should reset all breakers', async () => {
      const breaker1 = manager.getBreaker('provider1');
      const breaker2 = manager.getBreaker('provider2');
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open both circuits
      for (const breaker of [breaker1, breaker2]) {
        for (let i = 0; i < 5; i++) {
          try {
            await breaker.execute(operation);
          } catch (error) {
            // Expected
          }
        }
      }

      expect(breaker1.getState()).toBe('open');
      expect(breaker2.getState()).toBe('open');

      manager.resetAll();

      expect(breaker1.getState()).toBe('closed');
      expect(breaker2.getState()).toBe('closed');
    });
  });

  describe('getAllStats', () => {
    it('should return stats for all breakers', () => {
      manager.getBreaker('provider1');
      manager.getBreaker('provider2');

      const stats = manager.getAllStats();

      expect(stats.provider1).toBeDefined();
      expect(stats.provider2).toBeDefined();
      expect(stats.provider1.state).toBe('closed');
      expect(stats.provider2.state).toBe('closed');
    });
  });
});
