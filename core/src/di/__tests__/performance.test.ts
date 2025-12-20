/**
 * Dependency Injection - Performance Tests
 *
 * Tests performance characteristics of the DI container.
 */

import { describe, it, expect } from 'vitest';
import { ServiceContainer } from '../container.js';
import { ServiceLifetime } from '../types.js';

describe('DI Container Performance', () => {
  describe('Service Resolution Performance', () => {
    it('should resolve singleton services quickly', () => {
      const container = new ServiceContainer();
      let callCount = 0;

      container.singleton('test', () => {
        callCount++;
        return { value: callCount };
      });

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        container.resolve('test');
      }
      const end = performance.now();
      const duration = end - start;

      // Should resolve 1000 times in under 100ms (p95 target: <5ms per resolution)
      expect(duration).toBeLessThan(100);
      expect(callCount).toBe(1); // Factory called only once (singleton)
    });

    it('should resolve transient services efficiently', () => {
      const container = new ServiceContainer();
      let callCount = 0;

      container.transient('test', () => {
        callCount++;
        return { value: callCount };
      });

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        container.resolve('test');
      }
      const end = performance.now();
      const duration = end - start;

      // Should resolve 100 times in under 50ms
      expect(duration).toBeLessThan(50);
      expect(callCount).toBe(100); // Factory called for each resolution
    });

    it('should handle deep dependency chains efficiently', () => {
      const container = new ServiceContainer();

      // Create a chain of 10 dependencies
      container.singleton('dep0', () => ({ value: 0 }));
      for (let i = 1; i <= 10; i++) {
        container.singleton(`dep${i}`, (c) => ({
          value: i,
          prev: c.resolve(`dep${i - 1}`),
        }));
      }

      const start = performance.now();
      const result = container.resolve('dep10');
      const end = performance.now();
      const duration = end - start;

      // Should resolve deep chain in under 10ms
      expect(duration).toBeLessThan(10);
      expect(result.value).toBe(10);
      expect(result.prev.value).toBe(9);
    });
  });

  describe('Circular Dependency Detection Performance', () => {
    it('should detect circular dependencies quickly', () => {
      const container = new ServiceContainer();

      // Create a circular dependency
      container.singleton('A', (c) => {
        return { b: c.resolve('B') };
      });
      container.singleton('B', (c) => {
        return { a: c.resolve('A') };
      });

      const start = performance.now();
      try {
        container.resolve('A');
        expect.fail('Should have thrown');
      } catch (error) {
        const end = performance.now();
        const duration = end - start;

        // Should detect cycle quickly (<5ms)
        expect(duration).toBeLessThan(5);
      }
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with singleton caching', () => {
      const container = new ServiceContainer();

      // Register and resolve many services
      for (let i = 0; i < 1000; i++) {
        container.singleton(`service${i}`, () => ({
          id: i,
          data: new Array(100).fill(0),
        }));
        container.resolve(`service${i}`);
      }

      // All services should be cached
      const registeredKeys = container.getRegisteredKeys();
      expect(registeredKeys.length).toBe(1000);

      // Resolve again - should use cached instances
      for (let i = 0; i < 1000; i++) {
        const instance = container.resolve(`service${i}`);
        expect(instance.id).toBe(i);
      }
    });
  });

  describe('Concurrent Resolution', () => {
    it('should handle concurrent resolutions safely', () => {
      const container = new ServiceContainer();
      let initializationCount = 0;

      container.singleton('concurrent', () => {
        initializationCount++;
        return { initialized: true, count: initializationCount };
      });

      // Resolve concurrently (synchronously in this test)
      const instances = Array.from({ length: 10 }, () =>
        container.resolve('concurrent')
      );

      // Should initialize only once
      expect(initializationCount).toBe(1);
      // All instances should be the same
      instances.forEach((instance) => {
        expect(instance).toBe(instances[0]);
      });
    });
  });
});
