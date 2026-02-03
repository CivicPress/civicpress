/**
 * Broadcast Box Module Service Registration
 *
 * Registers all broadcast-box services in the DI container
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type {
  ServiceContainer,
  CivicPressConfig,
  Logger,
  DatabaseService,
  SecretsManager,
  RecordManager,
  HookSystem,
  WorkflowEngine,
} from '@civicpress/core';
import type { RoomManager, RealtimeServer } from '@civicpress/realtime';
// @ts-ignore - @civicpress/storage may not be available in all environments
import type { CloudUuidStorageService } from '@civicpress/storage';
import { createDeviceRoomFactory } from './rooms/device-room.js';
import { DeviceManager } from './services/device-manager.js';
import { DeviceAuthService } from './services/device-auth.js';
import { DeviceConnectionTracker } from './services/device-connection-tracker.js';
import { DeviceCommandService } from './services/device-command-service.js';
import { SessionController } from './services/session-controller.js';
import { UploadProcessor } from './services/upload-processor.js';
import { DeviceEventModel } from './models/device-event.js';
import { ProtocolHandler } from './websocket/protocol.js';
import { BroadcastBoxWorkflowTriggers } from './workflows/triggers.js';
import { BroadcastBoxWorkflowActions } from './workflows/actions.js';

/**
 * Register broadcast-box services in the DI container
 *
 * Follows the same pattern as storage and realtime modules
 */
export async function registerBroadcastBoxServices(
  container: ServiceContainer,
  config: CivicPressConfig
): Promise<void> {
  const logger = container.resolve<Logger>('logger');

  // Get room manager from realtime module to register device room type
  // This is optional - if realtime module isn't available, we skip room registration
  try {
    const roomManager = container.resolve<RoomManager>('realtimeRoomManager');
    if (roomManager) {
      try {
        const realtimeServer = container.resolve<any>('realtimeServer');
        if (realtimeServer) {
          // Register device room type factory
          const deviceRoomFactory = createDeviceRoomFactory(
            logger,
            realtimeServer
          );
          roomManager.registerRoomType('device', deviceRoomFactory);

          logger.info('Broadcast box device room type registered', {
            operation: 'broadcast-box:services:registered',
          });
        } else {
          logger.warn(
            'RealtimeServer not found, device room type not registered',
            {
              operation: 'broadcast-box:services:warning',
            }
          );
        }
      } catch (e: any) {
        logger.warn(
          'RealtimeServer not available, device room type not registered',
          {
            operation: 'broadcast-box:services:warning',
          }
        );
      }
    }
  } catch (e: any) {
    // RoomManager not available - that's okay, realtime module is optional
    logger.warn('RoomManager not available, device room type not registered', {
      operation: 'broadcast-box:services:warning',
    });
  }

  // Run database migrations first
  const db = container.resolve<DatabaseService>('database');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Try multiple paths: dist (production), src (development), or project root
  const fs = await import('fs');

  // Determine if we're in dist or src based on __dirname
  // If __dirname contains 'dist', we're running from compiled code
  // If __dirname contains 'src', we're running from source (tsx/ts-node)
  const isDist = __dirname.includes('dist');

  // Get migrations directory path
  let migrationsDir: string | null = null;

  if (isDist) {
    // Running from dist/broadcast-box-services.js
    // dist/ -> src/storage/migrations/
    const srcPath = path.join(__dirname, '..', 'src', 'storage', 'migrations');
    if (fs.existsSync(srcPath)) {
      migrationsDir = srcPath;
    }
  } else {
    // Running from src (development with tsx/ts-node)
    // src/ -> src/storage/migrations/
    const srcPath = path.join(__dirname, 'storage', 'migrations');
    if (fs.existsSync(srcPath)) {
      migrationsDir = srcPath;
    }
  }

  // Fallback: try project root relative path
  if (!migrationsDir) {
    const projectRootPath = path.join(
      process.cwd(),
      'modules',
      'broadcast-box',
      'src',
      'storage',
      'migrations'
    );
    if (fs.existsSync(projectRootPath)) {
      migrationsDir = projectRootPath;
    }
  }

  // Helper function to execute a migration file
  const executeMigration = async (
    migrationPath: string,
    migrationName: string
  ): Promise<void> => {
    if (!fs.existsSync(migrationPath)) {
      logger.warn(`Migration file not found: ${migrationName}`);
      return;
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Remove comments first
    let cleanedSQL = migrationSQL
      .split('\n')
      .map((line) => {
        // Remove inline comments (-- after code)
        const commentIndex = line.indexOf('--');
        if (commentIndex >= 0) {
          // Check if it's inside a string (simple check)
          const beforeComment = line.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/'/g) || []).length;
          if (quoteCount % 2 === 0) {
            // Even number of quotes = comment is outside string
            return line.substring(0, commentIndex).trim();
          }
        }
        return line;
      })
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('--'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

    // Split into statements - look for semicolon at end of line or followed by whitespace/newline
    // This handles multi-line CREATE TABLE statements properly
    const statements: string[] = [];
    let currentStatement = '';

    for (const line of cleanedSQL.split('\n')) {
      currentStatement += line + '\n';
      // If line ends with semicolon (possibly with trailing comment/whitespace), it's end of statement
      if (line.trim().endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt.length > 0 && stmt !== ';') {
          statements.push(stmt);
        }
        currentStatement = '';
      }
    }

    // Add any remaining statement
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement || statement === ';') continue;

      try {
        await db.getAdapter().execute(statement);
        logger.debug(
          `Migration ${migrationName} statement ${i + 1}/${statements.length} executed successfully`
        );
      } catch (e: any) {
        const errorMsg = e?.message || '';
        // Ignore "already exists" errors
        if (
          errorMsg.includes('already exists') ||
          errorMsg.includes('duplicate') ||
          errorMsg.includes('UNIQUE constraint failed')
        ) {
          logger.debug(
            `Migration ${migrationName} statement ${i + 1} skipped (already exists)`
          );
        } else {
          logger.error(
            `Migration ${migrationName} statement ${i + 1} failed: ${errorMsg}`
          );
          logger.debug(`Failed statement: ${statement.substring(0, 200)}...`);
          // Don't throw - continue with other statements
        }
      }
    }
  };

  // Run migrations in order
  try {
    if (!migrationsDir) {
      logger.warn(
        `Broadcast Box migrations directory not found. __dirname: ${__dirname}, isDist: ${isDist}, cwd: ${process.cwd()}`
      );
    } else {
      // Migration 001: Initial schema
      const migration001 = path.join(migrationsDir, '001_initial_schema.sql');
      await executeMigration(migration001, '001_initial_schema');

      // Migration 002: Enrollment codes
      const migration002 = path.join(migrationsDir, '002_enrollment_codes.sql');
      await executeMigration(migration002, '002_enrollment_codes');

      // Migration 003: Active sources and PiP configuration
      const migration003 = path.join(
        migrationsDir,
        '003_add_active_sources_pip.sql'
      );
      await executeMigration(migration003, '003_add_active_sources_pip');

      logger.info('Broadcast Box database migrations completed');
    }
  } catch (migrationError: any) {
    logger.warn(
      `Failed to run Broadcast Box migrations: ${migrationError?.message || 'unknown'}`
    );
    // Continue anyway - tables might already exist
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

  // Register DeviceCommandService as singleton
  // Note: RoomManager resolution is lazy - resolved on first use, not during registration
  // This allows realtime server to initialize after broadcast-box services are registered
  container.singleton(
    'broadcastBoxDeviceCommandService',
    (c: ServiceContainer) => {
      const logger = c.resolve<Logger>('logger');
      const protocol = c.resolve<ProtocolHandler>('broadcastBoxProtocol');
      const connectionTracker = c.resolve<DeviceConnectionTracker>(
        'broadcastBoxConnectionTracker'
      );
      const deviceManager = c.resolve<DeviceManager>(
        'broadcastBoxDeviceManager'
      );
      // Get database service to create DeviceEventModel
      const db = c.resolve<DatabaseService>('database');
      const deviceEventModel = new DeviceEventModel(db, logger);

      // RoomManager will be resolved lazily on first use via container
      // This allows realtime server to initialize after service registration
      // Note: RoomManager may not be available during registration, which is expected
      // It will be resolved when DeviceCommandService.executeCommand() is first called
      const containerRef = c;

      return new DeviceCommandService(
        protocol,
        connectionTracker,
        deviceEventModel,
        deviceManager,
        logger,
        containerRef // Pass container for lazy resolution
      );
    }
  );

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
      // RoomManager is optional - try to resolve it, but allow it to be null
      let roomManager: RoomManager | null = null;
      try {
        roomManager = c.resolve<RoomManager>('realtimeRoomManager');
      } catch (e: any) {
        // RoomManager not available - that's okay, realtime module is optional
        logger.warn(
          'RoomManager not available for SessionController, continuing without it'
        );
      }
      const protocol = c.resolve<ProtocolHandler>('broadcastBoxProtocol');
      const recordManager = c.resolve<RecordManager>('recordManager');
      const db = c.resolve<DatabaseService>('database');
      return new SessionController(
        deviceManager,
        connectionTracker,
        roomManager,
        protocol,
        recordManager,
        db,
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

  // Register EnrollmentCleanupService and start it
  try {
    // Import cleanup service - use dynamic import to handle both src and dist
    // These imports work at runtime but TypeScript can't resolve them at compile time
    const cleanupPath = '../services/enrollment-cleanup.js';
    const codeModelPath = '../models/enrollment-code.js';

    const cleanupModule = (await import(cleanupPath)) as {
      EnrollmentCleanupService: any;
    };
    const codeModelModule = (await import(codeModelPath)) as {
      EnrollmentCodeModel: any;
    };

    const { EnrollmentCleanupService } = cleanupModule;
    const { EnrollmentCodeModel } = codeModelModule;

    const enrollmentCodeModel = new EnrollmentCodeModel(db, logger);
    const cleanupService = new EnrollmentCleanupService(
      enrollmentCodeModel,
      logger,
      60 * 60 * 1000 // Run cleanup every hour
    );

    // Start cleanup service
    cleanupService.start();

    logger.info('Enrollment cleanup service registered and started', {
      operation: 'broadcast-box:cleanup:registered',
    });
  } catch (e: any) {
    // Log warning but don't fail service registration - cleanup is non-critical
    logger.warn(
      'Failed to register enrollment cleanup service (non-critical)',
      {
        operation: 'broadcast-box:cleanup:registration-failed',
        error: e?.message || 'unknown',
        note: 'Enrollment codes will not be automatically cleaned up. Manual cleanup may be needed.',
      }
    );
  }

  // Register workflow triggers and actions
  // Note: These are registered directly after services are available
  // We use try-catch since these services might not be available yet
  try {
    const hookSystem = container.resolve<HookSystem>('hooks');
    const sessionController = container.resolve<SessionController>(
      'broadcastBoxSessionController'
    );
    const deviceManager = container.resolve<DeviceManager>(
      'broadcastBoxDeviceManager'
    );
    const uploadProcessor = container.resolve<UploadProcessor>(
      'broadcastBoxUploadProcessor'
    );

    const triggers = new BroadcastBoxWorkflowTriggers(
      hookSystem,
      sessionController,
      deviceManager,
      uploadProcessor,
      logger
    );
    triggers.registerTriggers();
  } catch (e: any) {
    logger.warn(
      'Failed to register Broadcast Box workflow triggers (hooks may not be available yet)',
      {
        operation: 'broadcast-box:workflows:triggers',
        error: e?.message || 'unknown',
      }
    );
  }

  try {
    const workflowEngine = container.resolve<WorkflowEngine>('workflow');
    const sessionController = container.resolve<SessionController>(
      'broadcastBoxSessionController'
    );
    const deviceManager = container.resolve<DeviceManager>(
      'broadcastBoxDeviceManager'
    );
    const uploadProcessor = container.resolve<UploadProcessor>(
      'broadcastBoxUploadProcessor'
    );

    const actions = new BroadcastBoxWorkflowActions(
      sessionController,
      deviceManager,
      uploadProcessor,
      logger
    );
    actions.registerActions(workflowEngine);
  } catch (e: any) {
    logger.warn(
      'Failed to register Broadcast Box workflow actions (workflow engine may not be available yet)',
      {
        operation: 'broadcast-box:workflows:actions',
        error: e?.message || 'unknown',
      }
    );
  }

  // Set device authentication dependencies on realtime server after all services are registered
  // This must be done after DeviceAuthService and DeviceManager are registered
  // CRITICAL: This must happen BEFORE the realtime server is initialized
  // (The realtime server initialization is delayed until after broadcast-box registration)
  try {
    console.log(
      '🔧 [BROADCAST-BOX] Setting device authentication dependencies on realtime server'
    );
    logger.info(
      'Setting device authentication dependencies on realtime server',
      {
        operation: 'broadcast-box:services:device-auth:setting',
      }
    );

    // Unified architecture: Always try to set dependencies if realtime server is available
    // No flag check needed - if realtime module is loaded, use it
    let realtimeServer: any = null;
    try {
      realtimeServer = container.resolve<any>('realtimeServer');
    } catch (resolveError: any) {
      // Service not found - that's okay, realtime module might not be loaded
      if (
        resolveError?.code === 'SERVICE_NOT_FOUND' ||
        resolveError?.message?.includes('not found') ||
        resolveError?.message?.includes('Service')
      ) {
        logger.debug(
          'Realtime server not registered - skipping device authentication dependencies setup',
          {
            operation: 'broadcast-box:services:device-auth:skipped',
            reason: 'realtime server not registered (module optional)',
          }
        );
        // Exit early - don't try to set dependencies
        realtimeServer = null;
      } else {
        // Unexpected error - rethrow
        throw resolveError;
      }
    }

    // Only proceed if realtime server is available
    if (realtimeServer) {
      const deviceAuth = container.resolve<any>('broadcastBoxDeviceAuth');
      const deviceManager = container.resolve<DeviceManager>(
        'broadcastBoxDeviceManager'
      );

      logger.info('Resolved dependencies for device authentication', {
        operation: 'broadcast-box:services:device-auth:resolved',
        hasRealtimeServer: !!realtimeServer,
        hasDeviceAuth: !!deviceAuth,
        hasDeviceManager: !!deviceManager,
        realtimeServerType: realtimeServer ? typeof realtimeServer : 'null',
        hasSetMethod: realtimeServer
          ? typeof realtimeServer.setDeviceAuthDependencies
          : 'n/a',
      });

      if (typeof realtimeServer.setDeviceAuthDependencies !== 'function') {
        logger.warn(
          'Cannot set device authentication dependencies: method not found',
          {
            operation: 'broadcast-box:services:device-auth:failed',
            reason:
              'setDeviceAuthDependencies method not found on realtime server',
            realtimeServerMethods: Object.getOwnPropertyNames(
              Object.getPrototypeOf(realtimeServer)
            ),
          }
        );
      } else if (!deviceAuth) {
        logger.warn(
          'Cannot set device authentication dependencies: deviceAuth not available',
          {
            operation: 'broadcast-box:services:device-auth:failed',
            reason: 'broadcastBoxDeviceAuth not resolved from container',
          }
        );
      } else if (!deviceManager) {
        logger.warn(
          'Cannot set device authentication dependencies: deviceManager not available',
          {
            operation: 'broadcast-box:services:device-auth:failed',
            reason: 'broadcastBoxDeviceManager not resolved from container',
          }
        );
      } else {
        realtimeServer.setDeviceAuthDependencies(deviceAuth, deviceManager);
        console.log(
          '✅✅✅ [BROADCAST-BOX] Device authentication dependencies SET on realtime server'
        );
        logger.info(
          '✅ Device authentication dependencies set on realtime server',
          {
            operation: 'broadcast-box:services:device-auth:configured',
          }
        );
      }
    }
  } catch (e: any) {
    // Only log as error if it's an unexpected error
    // SERVICE_NOT_FOUND errors are expected and already handled above
    if (
      e?.code !== 'SERVICE_NOT_FOUND' &&
      !e?.message?.includes('not found') &&
      !e?.message?.includes('Service')
    ) {
      logger.error('Failed to set device authentication dependencies', {
        operation: 'broadcast-box:services:device-auth:error',
        error: e?.message || 'unknown',
        errorStack: e?.stack,
        errorName: e?.name,
      });
    } else {
      // Expected error - log as debug
      logger.debug(
        'Device authentication dependencies not set (realtime server not available)',
        {
          operation: 'broadcast-box:services:device-auth:skipped',
          reason: e?.message || 'service not found',
        }
      );
    }
  }

  // Set device command service on realtime server after all services are registered
  // This allows the realtime server to route ack messages to DeviceCommandService
  try {
    const realtimeServer = container.resolve<any>('realtimeServer');
    const deviceCommandService = container.resolve<any>(
      'broadcastBoxDeviceCommandService'
    );

    if (realtimeServer && deviceCommandService) {
      if (typeof realtimeServer.setDeviceCommandService === 'function') {
        realtimeServer.setDeviceCommandService(deviceCommandService);
        logger.info('Device command service set on realtime server', {
          operation: 'broadcast-box:services:device-command-service:configured',
        });
      } else {
        logger.warn(
          'Cannot set device command service: method not found on realtime server',
          {
            operation: 'broadcast-box:services:device-command-service:failed',
            reason: 'setDeviceCommandService method not found',
          }
        );
      }
    }
  } catch (e: any) {
    // Realtime server or device command service not available - that's okay
    // This is expected if realtime module is not loaded
    logger.debug(
      'Device command service not set (realtime server may not be available)',
      {
        operation: 'broadcast-box:services:device-command-service:not-set',
        error: e?.message || 'unknown',
      }
    );
  }

  // Set device connection tracker on realtime server after all services are registered
  // This allows the realtime server to register/unregister device connections
  // which is used by DeviceCommandService to check if devices are connected
  try {
    const realtimeServer = container.resolve<any>('realtimeServer');
    const connectionTracker = container.resolve<any>(
      'broadcastBoxConnectionTracker'
    );

    if (realtimeServer && connectionTracker) {
      if (typeof realtimeServer.setDeviceConnectionTracker === 'function') {
        realtimeServer.setDeviceConnectionTracker(connectionTracker);
        logger.info('Device connection tracker set on realtime server', {
          operation:
            'broadcast-box:services:device-connection-tracker:configured',
        });
      } else {
        logger.warn(
          'Cannot set device connection tracker: method not found on realtime server',
          {
            operation:
              'broadcast-box:services:device-connection-tracker:failed',
            reason: 'setDeviceConnectionTracker method not found',
          }
        );
      }
    }
  } catch (e: any) {
    // Realtime server or connection tracker not available - that's okay
    // This is expected if realtime module is not loaded
    logger.debug(
      'Device connection tracker not set (realtime server may not be available)',
      {
        operation: 'broadcast-box:services:device-connection-tracker:not-set',
        error: e?.message || 'unknown',
      }
    );
  }
}
