/**
 * Service Lifetime - Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { ServiceLifetime, ServiceMetadata } from '../types.js';
import {
  isValidLifetime,
  shouldCache,
  isSingleton,
  isTransient,
  isScoped,
} from '../service-lifetime.js';

describe('Service Lifetime Utilities', () => {
  describe('isValidLifetime', () => {
    it('should validate singleton lifetime', () => {
      expect(isValidLifetime(ServiceLifetime.Singleton)).toBe(true);
    });

    it('should validate transient lifetime', () => {
      expect(isValidLifetime(ServiceLifetime.Transient)).toBe(true);
    });

    it('should validate scoped lifetime', () => {
      expect(isValidLifetime(ServiceLifetime.Scoped)).toBe(true);
    });

    it('should reject invalid lifetime', () => {
      expect(isValidLifetime('invalid' as ServiceLifetime)).toBe(false);
    });
  });

  describe('shouldCache', () => {
    it('should return true for singleton', () => {
      expect(shouldCache(ServiceLifetime.Singleton)).toBe(true);
    });

    it('should return true for scoped', () => {
      expect(shouldCache(ServiceLifetime.Scoped)).toBe(true);
    });

    it('should return false for transient', () => {
      expect(shouldCache(ServiceLifetime.Transient)).toBe(false);
    });
  });

  describe('isSingleton', () => {
    it('should return true for singleton metadata', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      expect(isSingleton(metadata)).toBe(true);
    });

    it('should return false for transient metadata', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        lifetime: ServiceLifetime.Transient,
        dependencies: [],
        initialized: false,
      };

      expect(isSingleton(metadata)).toBe(false);
    });
  });

  describe('isTransient', () => {
    it('should return true for transient metadata', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        lifetime: ServiceLifetime.Transient,
        dependencies: [],
        initialized: false,
      };

      expect(isTransient(metadata)).toBe(true);
    });

    it('should return false for singleton metadata', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      expect(isTransient(metadata)).toBe(false);
    });
  });

  describe('isScoped', () => {
    it('should return true for scoped metadata', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        lifetime: ServiceLifetime.Scoped,
        dependencies: [],
        initialized: false,
      };

      expect(isScoped(metadata)).toBe(true);
    });

    it('should return false for singleton metadata', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      expect(isScoped(metadata)).toBe(false);
    });
  });
});
