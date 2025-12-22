/**
 * Realtime Module Service Registration
 *
 * Registers realtime services in the CivicPress DI container following Pattern 2
 * from the Module Integration Guide.
 *
 * @module realtime-services
 */

import path from 'path';
import type {
  ServiceContainer,
  CivicPressConfig,
  Logger,
  HookSystem,
  AuthService,
  RecordManager,
  DatabaseService,
} from '@civicpress/core';
import { RealtimeConfigManager } from './realtime-config-manager.js';
import { RealtimeServer } from './realtime-server.js';
import { RoomManager } from './rooms/room-manager.js';

/**
 * Register realtime module services in the DI container
 *
 * This function registers:
 * - `realtimeConfigManager`: Singleton instance of RealtimeConfigManager
 * - `realtimeServer`: Singleton instance of RealtimeServer
 * - `realtimeRoomManager`: Singleton instance of RoomManager
 *
 * Services are registered following Pattern 2 (Service Registration) from the
 * Module Integration Guide.
 *
 * @param container - Service container to register services in
 * @param config - CivicPress configuration
 *
 * @example
 * ```typescript
 * import { registerRealtimeServices } from '@civicpress/realtime/realtime-services';
 *
 * const container = new ServiceContainer();
 * registerRealtimeServices(container, config);
 *
 * // Later, resolve services:
 * const server = container.resolve<RealtimeServer>('realtimeServer');
 * const roomManager = container.resolve<RoomManager>('realtimeRoomManager');
 * ```
 */
export function registerRealtimeServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Determine system data directory
  const projectRoot = path.isAbsolute(config.dataDir)
    ? path.dirname(config.dataDir)
    : path.resolve(process.cwd(), path.dirname(config.dataDir));
  const systemDataDir = path.join(projectRoot, '.system-data');

  // Register RealtimeConfigManager as singleton (stateless, no initialization needed)
  container.singleton('realtimeConfigManager', () => {
    return new RealtimeConfigManager(systemDataDir);
  });

  // Register RealtimeServer as singleton
  container.singleton('realtimeServer', (c: ServiceContainer) => {
    const logger = c.resolve<Logger>('logger');
    const hookSystem = c.resolve<HookSystem>('hooks');
    const authService = c.resolve<AuthService>('auth');
    const recordManager = c.resolve<RecordManager>('recordManager');
    const databaseService = c.resolve<DatabaseService>('database');
    const configManager = c.resolve<RealtimeConfigManager>(
      'realtimeConfigManager'
    );

    const server = new RealtimeServer(
      logger,
      hookSystem,
      authService,
      configManager,
      config
    );

    // Set dependencies after creation (to avoid circular dependency)
    server.setRecordManager(recordManager);
    server.setDatabaseService(databaseService);

    return server;
  });

  // Register RoomManager as singleton
  container.singleton('realtimeRoomManager', (c: ServiceContainer) => {
    const logger = c.resolve<Logger>('logger');
    const server = c.resolve<RealtimeServer>('realtimeServer');
    const roomManager = new RoomManager(logger, server);

    // Set room manager in server (to avoid circular dependency)
    server.setRoomManager(roomManager);

    return roomManager;
  });
}
