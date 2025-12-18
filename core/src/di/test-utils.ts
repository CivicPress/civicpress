/**
 * Dependency Injection - Test Utilities
 *
 * Provides helper functions for creating test containers and mock services
 * for use in unit and integration tests.
 */

import { ServiceContainer } from './container.js';
import { CivicPressConfig } from '../civic-core.js';
import { Logger } from '../utils/logger.js';
import { DatabaseService } from '../database/database-service.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

/**
 * Create a test container with minimal services for testing
 *
 * @param overrides - Optional service overrides
 * @returns Configured test container
 */
export function createTestContainer(
  overrides?: Partial<{
    config: CivicPressConfig;
    logger: Logger;
    database: DatabaseService;
  }>
): ServiceContainer {
  const container = new ServiceContainer();

  // Create test config if not provided
  const config =
    overrides?.config ||
    ({
      dataDir: path.join(os.tmpdir(), 'civicpress-test'),
      database: {
        type: 'sqlite' as const,
        sqlite: {
          file: path.join(os.tmpdir(), 'civicpress-test.db'),
        },
      },
    } as CivicPressConfig);

  // Register config
  container.registerInstance('config', config);

  // Register logger if not provided
  if (!overrides?.logger) {
    container.singleton('logger', () => {
      return new Logger({ quiet: true }); // Quiet logger for tests
    });
  } else {
    container.registerInstance('logger', overrides.logger);
  }

  // Register database if not provided
  if (!overrides?.database) {
    container.singleton('database', (c) => {
      const logger = c.resolve<Logger>('logger');
      const config = c.resolve<CivicPressConfig>('config');
      return new DatabaseService(config.database!, logger);
    });
  } else {
    container.registerInstance('database', overrides.database);
  }

  return container;
}

/**
 * Create a mock container with mock services for testing
 *
 * @param mocks - Optional mock services
 * @returns Configured mock container
 */
export function createMockContainer(mocks?: {
  [key: string]: any;
}): ServiceContainer {
  const container = new ServiceContainer();

  // Register default mocks
  const defaultMocks = {
    config: {
      dataDir: '/tmp/test',
      database: {
        type: 'sqlite' as const,
        sqlite: { file: '/tmp/test.db' },
      },
    } as CivicPressConfig,
    logger: createMockLogger() as Logger,
    database: {
      initialize: async () => {},
      close: async () => {},
      healthCheck: async () => true,
    } as Partial<DatabaseService>,
    ...mocks,
  };

  // Register all mocks
  for (const [key, value] of Object.entries(defaultMocks)) {
    container.registerInstance(key, value);
  }

  return container;
}

/**
 * Create a test configuration for CivicPress
 *
 * @param options - Configuration options
 * @returns Test configuration
 */
export async function createTestConfig(options?: {
  dataDir?: string;
  databaseFile?: string;
}): Promise<CivicPressConfig> {
  const testDir =
    options?.dataDir ||
    (await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-test-')));
  const dbFile =
    options?.databaseFile || path.join(testDir, '.system-data', 'test.db');

  // Ensure directories exist
  await fs.mkdir(path.dirname(dbFile), { recursive: true });

  return {
    dataDir: testDir,
    database: {
      type: 'sqlite' as const,
      sqlite: {
        file: dbFile,
      },
    },
    logger: {
      quiet: true, // Quiet for tests
    },
  };
}

/**
 * Clean up test directory
 *
 * @param dataDir - Test data directory to clean up
 */
export async function cleanupTestConfig(dataDir: string): Promise<void> {
  try {
    await fs.rm(dataDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Create a test logger with configurable options
 *
 * @param options - Logger options (default: quiet mode)
 * @returns Test logger instance
 */
export function createTestLogger(options?: { quiet?: boolean }): Logger {
  return new Logger({ quiet: true, ...options });
}

/**
 * Create a mock logger for testing
 *
 * @returns Mock logger (partial implementation)
 */
export function createMockLogger(): Partial<Logger> {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    verbose: () => false,
    isVerbose: () => false,
  };
}

/**
 * Create a test database service
 *
 * @param config - Database configuration
 * @param logger - Logger instance
 * @returns Test database service
 */
export function createTestDatabase(
  config?: CivicPressConfig['database'],
  logger?: Logger
): DatabaseService {
  const testConfig = config || {
    type: 'sqlite' as const,
    sqlite: {
      file: path.join(os.tmpdir(), 'civicpress-test.db'),
    },
  };

  const testLogger = logger || createTestLogger();

  return new DatabaseService(testConfig, testLogger);
}

/**
 * Create a mock database service
 *
 * @returns Mock database service
 */
export function createMockDatabase(): Partial<DatabaseService> {
  return {
    initialize: async () => {},
    close: async () => {},
    healthCheck: async () => true,
    query: async () => [],
    execute: async () => ({ lastInsertRowid: 1, changes: 1 }),
  };
}
