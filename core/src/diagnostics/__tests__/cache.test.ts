/**
 * Unit Tests for Diagnostic Cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticCache } from '../cache.js';
import { ComponentResult, DiagnosticReport } from '../types.js';
import { Logger } from '../../utils/logger.js';

describe('DiagnosticCache', () => {
  let cache: DiagnosticCache;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    cache = new DiagnosticCache({
      defaultTTL: 100, // Short TTL for testing
      maxSize: 5,
      logger: mockLogger,
    });
  });

  describe('cache key generation', () => {
    it('should generate consistent keys', () => {
      const key1 = cache.generateKey('database', { timeout: 30 });
      const key2 = cache.generateKey('database', { timeout: 30 });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different options', () => {
      const key1 = cache.generateKey('database', { timeout: 30 });
      const key2 = cache.generateKey('database', { timeout: 60 });

      expect(key1).not.toBe(key2);
    });
  });

  describe('get and set', () => {
    it('should store and retrieve cached results', () => {
      const result: ComponentResult = {
        component: 'database',
        status: 'healthy',
        checks: [],
        issues: [],
        duration: 100,
        timestamp: new Date().toISOString(),
      };

      const key = cache.generateKey('database');
      cache.set(key, result);

      const cached = cache.get(key);
      expect(cached).toEqual(result);
    });

    it('should return null for non-existent keys', () => {
      const cached = cache.get('non-existent-key');
      expect(cached).toBeNull();
    });

    it('should return null for expired entries', async () => {
      const result: ComponentResult = {
        component: 'database',
        status: 'healthy',
        checks: [],
        issues: [],
        duration: 100,
        timestamp: new Date().toISOString(),
      };

      const key = cache.generateKey('database');
      cache.set(key, result, 50); // Very short TTL

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const cached = cache.get(key);
      expect(cached).toBeNull();
    });
  });

  describe('invalidation', () => {
    it('should invalidate entries matching pattern', () => {
      cache.set('database:test', { component: 'database' } as ComponentResult);
      cache.set('search:test', { component: 'search' } as ComponentResult);
      cache.set('config:test', { component: 'config' } as ComponentResult);

      const invalidated = cache.invalidate('database:.*');

      expect(invalidated).toBe(1);
      expect(cache.get('database:test')).toBeNull();
      expect(cache.get('search:test')).not.toBeNull();
    });

    it('should invalidate all entries when clearing', () => {
      cache.set('key1', { component: 'test' } as ComponentResult);
      cache.set('key2', { component: 'test' } as ComponentResult);

      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('size limits', () => {
    it('should evict oldest entries when at max size', () => {
      // Fill cache to max
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, { component: 'test' } as ComponentResult);
      }

      // Add one more - should evict oldest
      cache.set('key5', { component: 'test' } as ComponentResult);

      // Oldest key should be evicted
      expect(cache.get('key0')).toBeNull();
      expect(cache.get('key5')).not.toBeNull();
    });
  });

  describe('statistics', () => {
    it('should provide cache statistics', () => {
      cache.set('key1', { component: 'test' } as ComponentResult);
      cache.set('key2', { component: 'test' } as ComponentResult);

      const stats = cache.getStats();

      expect(stats).toMatchObject({
        size: 2,
        maxSize: 5,
      });
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });
  });
});
