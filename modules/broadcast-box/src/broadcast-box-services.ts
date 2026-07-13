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
import { createDeviceRoomHandler } from './realtime/device-room-handler.js';
import { DeviceManager } from './services/device-manager.js';
import { DeviceAuthService } from './services/device-auth.js';
import { DeviceConnectionTracker } from './services/device-connection-tracker.js';
import { DeviceCommandService } from './services/device-command-service.js';
import { SessionController } from './services/session-controller.js';
import { UploadProcessor } from './services/upload-processor.js';
import { RedactionWorker } from './services/redaction-worker.js';
import { FfmpegMediaProcessor } from './services/redaction-ffmpeg.js';
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

    // Hooks drive upload→record linking; may not be registered yet — optional.
    let hookSystem: HookSystem | undefined;
    try {
      hookSystem = c.resolve<HookSystem>('hooks');
    } catch {
      // Hooks unavailable; finalizeUpload skips the recording-complete emit.
    }

    const processor = new UploadProcessor(
      db,
      storageService,
      systemDataDir,
      logger,
      hookSystem
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

  // Register + start the FA-BB-002 redaction worker: the only path that makes
  // a recording publicly visible (verified blanked variant → public_file).
  // Gated by env (default on wherever broadcast-box mounts); ffmpeg-missing
  // just idles the worker, so registration is safe on any host.
  if (process.env.BROADCAST_BOX_REDACTION_ENABLED !== 'false') {
    try {
      const recordManager = container.resolve<RecordManager>('recordManager');
      const storageService =
        container.resolve<CloudUuidStorageService>('storage');
      const pollMsRaw = Number(process.env.BROADCAST_BOX_REDACTION_POLL_MS);
      const pollIntervalMs =
        Number.isFinite(pollMsRaw) && pollMsRaw > 0 ? pollMsRaw : 15_000;

      const redactionWorker = new RedactionWorker({
        records: recordManager as any,
        storage: storageService as any,
        media: new FfmpegMediaProcessor({ logger }),
        logger,
      });
      void redactionWorker.start(pollIntervalMs).catch((error) => {
        logger.error('Redaction worker loop terminated unexpectedly', {
          operation: 'broadcast-box:redaction:loop-terminated',
          error: error instanceof Error ? error.message : String(error),
        });
      });
      // Expose the running instance so the host can stop it on shutdown.
      container.registerInstance('broadcastBoxRedactionWorker', redactionWorker);
      logger.info('Redaction worker registered and started', {
        operation: 'broadcast-box:redaction:registered',
        pollIntervalMs,
      });
    } catch (e: any) {
      // Storage/records unavailable → no uploads can land either; log + skip.
      logger.warn(
        'Failed to start redaction worker (recordings will not be published)',
        {
          operation: 'broadcast-box:redaction:registration-failed',
          error: e?.message || 'unknown',
        }
      );
    }
  }

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

    // Expose the running instance so the host (e.g. the API bootstrap) can stop
    // its interval on shutdown — the timer is not unref'd, so without this it
    // would keep the event loop alive.
    container.registerInstance('broadcastBoxEnrollmentCleanup', cleanupService);

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

  // Register device room handler with realtime server's handler registry
  // This is the new architecture - external modules register handlers instead of injecting services
  try {
    const realtimeServer = container.resolve<RealtimeServer>('realtimeServer');
    if (
      realtimeServer &&
      typeof realtimeServer.getHandlerRegistry === 'function'
    ) {
      const deviceAuth = container.resolve<DeviceAuthService>(
        'broadcastBoxDeviceAuth'
      );
      const deviceManager = container.resolve<DeviceManager>(
        'broadcastBoxDeviceManager'
      );
      const connectionTracker = container.resolve<DeviceConnectionTracker>(
        'broadcastBoxConnectionTracker'
      );
      const deviceCommandService = container.resolve<DeviceCommandService>(
        'broadcastBoxDeviceCommandService'
      );
      const authService = container.resolve<any>('authService');
      const db = container.resolve<DatabaseService>('database');
      const deviceEventModel = new DeviceEventModel(db, logger);

      const sessionController = container.resolve<SessionController>(
        'broadcastBoxSessionController'
      );

      const deviceRoomHandler = createDeviceRoomHandler({
        deviceAuthService: deviceAuth,
        deviceManager,
        connectionTracker,
        deviceCommandService,
        deviceEventModel,
        authService,
        sessionController,
        logger,
      });

      realtimeServer.registerRoomTypeHandler(deviceRoomHandler);

      logger.info('Device room handler registered with realtime server', {
        operation: 'broadcast-box:services:handler:registered',
        roomType: 'device',
      });
    }
  } catch (e: any) {
    // Handler registration failed — the realtime module may not be loaded.
    logger.debug(
      'Device room handler not registered (handler registry may not be available)',
      {
        operation: 'broadcast-box:services:handler:not-registered',
        error: e?.message || 'unknown',
      }
    );
  }
}
