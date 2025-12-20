/**
 * Service Registry - Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceRegistry } from '../service-registry.js';
import { ServiceLifetime, type ServiceMetadata } from '../types.js';
import { DuplicateServiceError } from '../errors.js';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  describe('Registration', () => {
    it('should register a service', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      registry.register(metadata);

      expect(registry.has('test')).toBe(true);
    });

    it('should throw DuplicateServiceError for duplicate registration', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      registry.register(metadata);

      expect(() => {
        registry.register(metadata);
      }).toThrow(DuplicateServiceError);
    });

    it('should allow override with allowOverride flag', () => {
      const metadata1: ServiceMetadata = {
        key: 'test',
        factory: () => ({ value: 1 }),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      const metadata2: ServiceMetadata = {
        key: 'test',
        factory: () => ({ value: 2 }),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      registry.register(metadata1);
      registry.register(metadata2, true);

      const retrieved = registry.get('test');
      expect(retrieved?.factory?.({} as any)).toEqual({ value: 2 });
    });
  });

  describe('Retrieval', () => {
    it('should get registered service', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      registry.register(metadata);

      const retrieved = registry.get('test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.key).toBe('test');
    });

    it('should return undefined for unregistered service', () => {
      const retrieved = registry.get('nonexistent');

      expect(retrieved).toBeUndefined();
    });

    it('should check if service is registered', () => {
      expect(registry.has('test')).toBe(false);

      const metadata: ServiceMetadata = {
        key: 'test',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      registry.register(metadata);

      expect(registry.has('test')).toBe(true);
    });

    it('should get all registered keys', () => {
      registry.register({
        key: 'service1',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      });

      registry.register({
        key: 'service2',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      });

      const keys = registry.getRegisteredKeys();

      expect(keys).toContain('service1');
      expect(keys).toContain('service2');
      expect(keys.length).toBe(2);
    });
  });

  describe('Update', () => {
    it('should update service metadata', () => {
      const metadata: ServiceMetadata = {
        key: 'test',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      };

      registry.register(metadata);

      registry.update('test', {
        initialized: true,
        instance: { value: 42 },
      });

      const updated = registry.get('test');

      expect(updated?.initialized).toBe(true);
      expect(updated?.instance).toEqual({ value: 42 });
    });

    it('should throw error when updating unregistered service', () => {
      expect(() => {
        registry.update('nonexistent', { initialized: true });
      }).toThrow();
    });
  });

  describe('Management', () => {
    it('should clear all registrations', () => {
      registry.register({
        key: 'test',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      });

      expect(registry.size()).toBe(1);

      registry.clear();

      expect(registry.size()).toBe(0);
      expect(registry.has('test')).toBe(false);
    });

    it('should return correct size', () => {
      expect(registry.size()).toBe(0);

      registry.register({
        key: 'service1',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      });

      expect(registry.size()).toBe(1);

      registry.register({
        key: 'service2',
        factory: () => ({}),
        lifetime: ServiceLifetime.Singleton,
        dependencies: [],
        initialized: false,
      });

      expect(registry.size()).toBe(2);
    });
  });
});
