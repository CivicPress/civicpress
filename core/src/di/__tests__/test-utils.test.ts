/**
 * Test Utilities - Unit Tests
 *
 * Tests for the DI test utility functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestContainer,
  createMockContainer,
  createTestConfig,
  createTestLogger,
  createMockLogger,
  createTestDatabase,
  createMockDatabase,
} from '../test-utils.js';
import { ServiceContainer } from '../container.js';
import { Logger } from '../../utils/logger.js';
import { DatabaseService } from '../../database/database-service.js';

describe('Test Utilities', () => {
  describe('createTestContainer', () => {
    it('should create a container with default services', () => {
      const container = createTestContainer();

      expect(container.isRegistered('config')).toBe(true);
      expect(container.isRegistered('logger')).toBe(true);
      expect(container.isRegistered('database')).toBe(true);
    });

    it('should allow overriding services', () => {
      const customLogger = new Logger({ quiet: true });
      const container = createTestContainer({ logger: customLogger });

      const logger = container.resolve<Logger>('logger');
      expect(logger).toBe(customLogger);
    });

    it('should resolve services correctly', () => {
      const container = createTestContainer();

      const config = container.resolve('config');
      const logger = container.resolve<Logger>('logger');
      const database = container.resolve<DatabaseService>('database');

      expect(config).toBeDefined();
      expect(logger).toBeInstanceOf(Logger);
      expect(database).toBeInstanceOf(DatabaseService);
    });
  });

  describe('createMockContainer', () => {
    it('should create a container with mock services', () => {
      const container = createMockContainer();

      expect(container.isRegistered('config')).toBe(true);
      expect(container.isRegistered('logger')).toBe(true);
      expect(container.isRegistered('database')).toBe(true);
    });

    it('should allow custom mocks', () => {
      const customMock = { test: 'value' };
      const container = createMockContainer({ customService: customMock });

      expect(container.isRegistered('customService')).toBe(true);
      expect(container.resolve('customService')).toBe(customMock);
    });
  });

  describe('createTestConfig', () => {
    it('should create a test configuration', async () => {
      const config = await createTestConfig();

      expect(config.dataDir).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.database?.type).toBe('sqlite');
    });

    it('should allow custom options', async () => {
      const customDir = '/tmp/custom-test';
      const config = await createTestConfig({ dataDir: customDir });

      expect(config.dataDir).toBe(customDir);
    });
  });

  describe('createTestLogger', () => {
    it('should create a test logger', () => {
      const logger = createTestLogger();

      expect(logger).toBeInstanceOf(Logger);
    });

    it('should accept options', () => {
      const logger = createTestLogger({ quiet: false });

      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('createMockLogger', () => {
    it('should create a mock logger', () => {
      const logger = createMockLogger();

      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });
  });

  describe('createTestDatabase', () => {
    it('should create a test database service', () => {
      const db = createTestDatabase();

      expect(db).toBeInstanceOf(DatabaseService);
    });

    it('should accept custom config and logger', () => {
      const config = {
        type: 'sqlite' as const,
        sqlite: { file: '/tmp/test.db' },
      };
      const logger = createTestLogger();
      const db = createTestDatabase(config, logger);

      expect(db).toBeInstanceOf(DatabaseService);
    });
  });

  describe('createMockDatabase', () => {
    it('should create a mock database service', () => {
      const db = createMockDatabase();

      expect(db.initialize).toBeDefined();
      expect(db.close).toBeDefined();
      expect(db.healthCheck).toBeDefined();
      expect(typeof db.initialize).toBe('function');
    });
  });
});
