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
import { RecordRoomHandler } from './rooms/record-room-handler.js';

/** Compute the `.system-data` directory that holds `realtime.yml`. */
function resolveSystemDataDir(config: CivicPressConfig): string {
  const projectRoot = path.isAbsolute(config.dataDir)
    ? path.dirname(config.dataDir)
    : path.resolve(process.cwd(), path.dirname(config.dataDir));
  return path.join(projectRoot, '.system-data');
}

/**
 * Explicit collaborators a fully-wired {@link RealtimeServer} needs. This is the
 * single source of truth for "what the realtime server depends on", shared by
 * both the DI-container path ({@link registerRealtimeServices}) and the
 * explicit/in-process path ({@link createRealtimeServer}) so the handler wiring
 * never drifts between them.
 */
export interface RealtimeServerDeps {
  logger: Logger;
  hookSystem: HookSystem;
  authService: AuthService;
  recordManager: RecordManager;
  databaseService: DatabaseService;
}

/**
 * Construct a fully-wired RealtimeServer (config manager + records room handler
 * + room manager) from explicit collaborators.
 *
 * This is the construction path used for IN-PROCESS hosting (e.g. the API
 * process), where the caller already holds the core services via public
 * accessors and does NOT expose its DI container. It mirrors exactly what
 * {@link registerRealtimeServices} wires inside the container so the two stay
 * in lockstep.
 *
 * The returned server is NOT yet started — the caller invokes
 * `server.initialize()` (which is config-gated and a no-op when disabled).
 */
export function createRealtimeServer(
  deps: RealtimeServerDeps,
  config: CivicPressConfig
): RealtimeServer {
  const { logger, hookSystem, authService, recordManager, databaseService } =
    deps;

  const configManager = new RealtimeConfigManager(
    resolveSystemDataDir(config)
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

  // Register the records room handler, wiring the REAL draft pipeline:
  //  - draftPersistence: DatabaseService.getDraft/createDraft/updateDraft
  //    (the canonical `record_drafts` pipeline the UI's getDraftOrRecord
  //    reads via markdown_body),
  //  - recordSource: RecordManager.getRecord (title/type/metadata seed when
  //    no draft exists yet),
  //  - getSnapshotManager: provider over the server's lazily-created W4
  //    SnapshotManager (persist() integrity-hashes the Yjs binary),
  //  - hookBus: the server's HookSystem bridge for lifecycle events.
  const recordHandler = new RecordRoomHandler({
    draftPersistence: databaseService,
    recordSource: recordManager,
    getSnapshotManager: () => server.getSnapshotManager(),
    hookBus: {
      emit: (event, payload) => server.emitHook(event, payload),
    },
  });
  server.registerRoomTypeHandler(recordHandler);

  // Wire the room manager (mirrors the realtimeRoomManager singleton). The
  // server also creates one lazily in initialize() if unset, but wiring it
  // here keeps construction self-contained.
  const roomManager = new RoomManager(logger, server);
  server.setRoomManager(roomManager);

  return server;
}

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
  const systemDataDir = resolveSystemDataDir(config);

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

    // Register the records room handler, wiring the REAL draft pipeline:
    //  - draftPersistence: DatabaseService.getDraft/createDraft/updateDraft
    //    (the canonical `record_drafts` pipeline the UI's getDraftOrRecord
    //    reads via markdown_body),
    //  - recordSource: RecordManager.getRecord (title/type/metadata seed when
    //    no draft exists yet),
    //  - getSnapshotManager: provider over the server's lazily-created W4
    //    SnapshotManager (persist() integrity-hashes the Yjs binary),
    //  - hookBus: the server's HookSystem bridge for lifecycle events.
    const recordHandler = new RecordRoomHandler({
      draftPersistence: databaseService,
      recordSource: recordManager,
      getSnapshotManager: () => server.getSnapshotManager(),
      hookBus: {
        emit: (event, payload) => server.emitHook(event, payload),
      },
    });
    server.registerRoomTypeHandler(recordHandler);

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
