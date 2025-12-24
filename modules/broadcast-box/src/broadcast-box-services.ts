/**
 * Broadcast Box Module Service Registration
 *
 * Registers all broadcast-box services in the DI container
 */

import path from 'path';
import type {
  ServiceContainer,
  CivicPressConfig,
  Logger,
  DatabaseService,
  SecretsManager,
} from '@civicpress/core';
import type { RoomManager, RealtimeServer } from '@civicpress/realtime';
import { createDeviceRoomFactory } from './rooms/device-room.js';
import { DeviceManager } from './services/device-manager.js';
import { DeviceAuthService } from './services/device-auth.js';
import { DeviceConnectionTracker } from './services/device-connection-tracker.js';
import { SessionController } from './services/session-controller.js';
import { UploadProcessor } from './services/upload-processor.js';
import { DeviceEventModel } from './models/device-event.js';
import { ProtocolHandler } from './websocket/protocol.js';
import { BroadcastBoxWorkflowTriggers } from './workflows/triggers.js';
import { BroadcastBoxWorkflowActions } from './workflows/actions.js';
import type {
  RecordManager,
  HookSystem,
  WorkflowEngine,
} from '@civicpress/core';
import type { RoomManager } from '@civicpress/realtime';
import type { CloudUuidStorageService } from '@civicpress/storage';

/**
 * Register broadcast-box services in the DI container
 *
 * Follows the same pattern as storage and realtime modules
 */
export function registerBroadcastBoxServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  const logger = container.resolve<Logger>('logger');

  // Get room manager from realtime module to register device room type
  const roomManager = container.resolve<RoomManager>('realtimeRoomManager');
  if (roomManager) {
    const realtimeServer = container.resolve<any>('realtimeServer');
    if (realtimeServer) {
      // Register device room type factory
      const deviceRoomFactory = createDeviceRoomFactory(logger, realtimeServer);
      roomManager.registerRoomType('device', deviceRoomFactory);

      logger.info('Broadcast box device room type registered', {
        operation: 'broadcast-box:services:registered',
      });
    } else {
      logger.warn('RealtimeServer not found, device room type not registered', {
        operation: 'broadcast-box:services:warning',
      });
    }
  } else {
    logger.warn('RoomManager not found, device room type not registered', {
      operation: 'broadcast-box:services:warning',
    });
  }

  // Register DeviceManager as singleton
  container.singleton('broadcastBoxDeviceManager', (c: ServiceContainer) => {
    const logger = c.resolve<Logger>('logger');
    const db = c.resolve<DatabaseService>('database');
    return new DeviceManager(db, logger);
  });

  // Register DeviceAuthService as singleton
  container.singleton('broadcastBoxDeviceAuth', (c: ServiceContainer) => {
    const logger = c.resolve<Logger>('logger');
    const secretsManager = c.resolve<SecretsManager>('secretsManager');
    return new DeviceAuthService(logger, secretsManager);
  });

  // Register DeviceConnectionTracker as singleton
  container.singleton(
    'broadcastBoxConnectionTracker',
    (c: ServiceContainer) => {
      const logger = c.resolve<Logger>('logger');
      const db = c.resolve<DatabaseService>('database');
      const deviceManager = c.resolve<DeviceManager>(
        'broadcastBoxDeviceManager'
      );
      const deviceEventModel = new DeviceEventModel(db, logger);
      return new DeviceConnectionTracker(
        deviceManager,
        deviceEventModel,
        logger
      );
    }
  );

  // Register ProtocolHandler as singleton
  container.singleton('broadcastBoxProtocol', (c: ServiceContainer) => {
    const logger = c.resolve<Logger>('logger');
    return new ProtocolHandler(logger);
  });

  // Register SessionController as singleton
  container.singleton(
    'broadcastBoxSessionController',
    (c: ServiceContainer) => {
      const logger = c.resolve<Logger>('logger');
      const deviceManager = c.resolve<DeviceManager>(
        'broadcastBoxDeviceManager'
      );
      const connectionTracker = c.resolve<DeviceConnectionTracker>(
        'broadcastBoxConnectionTracker'
      );
      const roomManager = c.resolve<RoomManager>('realtimeRoomManager');
      const protocol = c.resolve<ProtocolHandler>('broadcastBoxProtocol');
      const recordManager = c.resolve<RecordManager>('recordManager');
      return new SessionController(
        deviceManager,
        connectionTracker,
        roomManager,
        protocol,
        recordManager,
        logger
      );
    }
  );

  // Register UploadProcessor as singleton
  container.singleton('broadcastBoxUploadProcessor', (c: ServiceContainer) => {
    const logger = c.resolve<Logger>('logger');
    const db = c.resolve<DatabaseService>('database');
    const storageService = c.resolve<CloudUuidStorageService>('storage');

    // Determine system data directory
    const projectRoot = path.isAbsolute(config.dataDir)
      ? path.dirname(config.dataDir)
      : path.resolve(process.cwd(), path.dirname(config.dataDir));
    const systemDataDir = path.join(projectRoot, '.system-data');

    const processor = new UploadProcessor(
      db,
      storageService,
      systemDataDir,
      logger
    );

    // Initialize uploads directory
    processor.initialize().catch((error) => {
      logger.warn('Failed to initialize upload processor', {
        operation: 'broadcast-box:upload-processor:init-warning',
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return processor;
  });

  // Register workflow triggers and actions
  // Note: These need to be registered after all services are available
  container.onResolve('hookSystem', (hookSystem: HookSystem) => {
    const sessionController = container.resolve<SessionController>(
      'broadcastBoxSessionController'
    );
    const deviceManager = container.resolve<DeviceManager>(
      'broadcastBoxDeviceManager'
    );
    const uploadProcessor = container.resolve<UploadProcessor>(
      'broadcastBoxUploadProcessor'
    );
    const logger = container.resolve<Logger>('logger');

    const triggers = new BroadcastBoxWorkflowTriggers(
      hookSystem,
      sessionController,
      deviceManager,
      uploadProcessor,
      logger
    );
    triggers.registerTriggers();
  });

  container.onResolve('workflowEngine', (workflowEngine: WorkflowEngine) => {
    const sessionController = container.resolve<SessionController>(
      'broadcastBoxSessionController'
    );
    const deviceManager = container.resolve<DeviceManager>(
      'broadcastBoxDeviceManager'
    );
    const uploadProcessor = container.resolve<UploadProcessor>(
      'broadcastBoxUploadProcessor'
    );
    const logger = container.resolve<Logger>('logger');

    const actions = new BroadcastBoxWorkflowActions(
      sessionController,
      deviceManager,
      uploadProcessor,
      logger
    );
    actions.registerActions(workflowEngine);
  });
}
