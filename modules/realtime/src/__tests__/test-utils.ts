/**
 * Realtime Module Test Utilities
 *
 * Provides helper functions for creating test environments and mock services
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type { CivicPressConfig } from '@civicpress/core';
import {
  Logger,
  ServiceContainer,
  HookSystem,
  AuthService,
  RecordManager,
  DatabaseService,
} from '@civicpress/core';
import { RealtimeConfigManager } from '../realtime-config-manager.js';
import { RealtimeServer } from '../realtime-server.js';
import { RoomManager } from '../rooms/room-manager.js';

export interface TestEnvironment {
  testDir: string;
  config: CivicPressConfig;
  container: ServiceContainer;
  logger: Logger;
  hookSystem: HookSystem;
  authService: AuthService;
  recordManager: RecordManager;
  databaseService: DatabaseService;
  configManager: RealtimeConfigManager;
  realtimeServer: RealtimeServer;
  roomManager: RoomManager;
}

/**
 * Create a test environment for realtime module tests
 */
export async function createTestEnvironment(): Promise<TestEnvironment> {
  const testDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'civicpress-realtime-test-')
  );

  // Create directory structure
  await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
  await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

  // Initialize Git repository
  execSync('git init', { cwd: testDir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', {
    cwd: testDir,
    stdio: 'ignore',
  });
  execSync('git config user.email "test@example.com"', {
    cwd: testDir,
    stdio: 'ignore',
  });

  const config: CivicPressConfig = {
    dataDir: testDir,
    database: {
      type: 'sqlite',
      sqlite: {
        file: path.join(testDir, '.system-data', 'test.db'),
      },
    },
    logger: {
      quiet: true, // Quiet logger for tests
    },
  };

  // Create container and services (simplified for testing)
  const container = new ServiceContainer();
  const logger = new Logger({ quiet: true });
  const hookSystem = new HookSystem(logger as any);

  // Register basic services
  container.registerInstance('config', config);
  container.registerInstance('logger', logger);
  container.registerInstance('hooks', hookSystem);

  // Create config manager
  const configManager = new RealtimeConfigManager(
    path.join(testDir, '.system-data')
  );

  // Create realtime server (will need mocks for auth and record manager)
  const realtimeServer = new RealtimeServer(
    logger,
    hookSystem,
    {} as AuthService, // Mock - will be replaced in actual tests
    configManager,
    config
  );

  // Create room manager
  const roomManager = new RoomManager(logger as any, realtimeServer);
  realtimeServer.setRoomManager(roomManager);

  return {
    testDir,
    config,
    container,
    logger,
    hookSystem,
    authService: {} as AuthService, // Mock
    recordManager: {} as RecordManager, // Mock
    databaseService: {} as DatabaseService, // Mock
    configManager,
    realtimeServer,
    roomManager,
  };
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(
  env: TestEnvironment
): Promise<void> {
  try {
    await fs.rm(env.testDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Create a mock AuthService for testing
 */
export function createMockAuthService(): Partial<AuthService> {
  return {
    validateSession: async (token: string) => {
      if (token === 'valid-token') {
        return {
          id: 1,
          username: 'testuser',
          role: 'admin',
          email: 'test@example.com',
          name: 'Test User',
        };
      }
      return null;
    },
    userCan: async (user: any, permission: string, context?: any) => {
      // Admin users can do everything
      if (user.role === 'admin') {
        return true;
      }
      return false;
    },
  };
}

/**
 * Create a mock RecordManager for testing
 */
export function createMockRecordManager(): Partial<RecordManager> {
  const mockRecords = new Map<string, any>();

  const mock: Partial<RecordManager> = {
    getRecord: async (recordId: string) => {
      return mockRecords.get(recordId) || null;
    },
  };

  // Add test helper method (not part of interface)
  (mock as any)._addTestRecord = (recordId: string, record: any) => {
    mockRecords.set(recordId, record);
  };

  return mock;
}
