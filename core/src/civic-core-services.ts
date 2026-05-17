/**
 * CivicPress Service Registration
 *
 * This module centralizes all service registrations for the Dependency Injection
 * Container. It defines the service dependency graph and registration order.
 */

import * as path from 'path';
import { ServiceContainer } from './di/container.js';
import { CivicPressConfig } from './civic-core.js';
import { Logger } from './utils/logger.js';
import { DatabaseService } from './database/database-service.js';
import { AuthService } from './auth/auth-service.js';
import { ConfigDiscovery } from './config/config-discovery.js';
import { WorkflowEngine } from './workflows/workflow-engine.js';
import { GitEngine } from './git/git-engine.js';
import { HookSystem } from './hooks/hook-system.js';
import { TemplateEngine } from './utils/template-engine.js';
import { IndexingService } from './indexing/indexing-service.js';
import { RecordManager } from './records/record-manager.js';
import {
  NotificationService,
  NotificationConfig,
} from './notifications/index.js';
import { initializeRoleManager } from './auth/role-utils.js';
import { coreOutput } from './utils/core-output.js';
import type { CivicPress } from './civic-core.js';
import {
  SagaStateStore,
  IdempotencyManager,
  ResourceLockManager,
  SagaExecutor,
} from './saga/index.js';
import { UnifiedCacheManager } from './cache/unified-cache-manager.js';
import { SecretsManager } from './security/secrets.js';

/**
 * Register all CivicPress services in the dependency injection container
 *
 * @param container - Service container to register services in
 * @param config - CivicPress configuration
 */
export function registerCivicPressServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Step 1: Register configuration and logger (no dependencies)
  const loggerOptions = config.logger || {};
  container.singleton('logger', () => new Logger(loggerOptions));
  container.registerInstance('config', config);

  // Configure core output with logger options
  coreOutput.setOptions(loggerOptions);

  // Step 1.5: Register secrets manager (must be early, before auth services)
  container.singleton('secretsManager', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    const secretsManager = SecretsManager.getInstance(config.dataDir);
    // Note: initialize() will be called in completeServiceInitialization
    return secretsManager;
  });

  // Step 2: Prepare database configuration
  let dbConfig = config.database;
  if (!dbConfig) {
    // Resolve project root: if dataDir is 'data', project root is parent
    // If dataDir is absolute like '/path/to/project/data', project root is its parent
    const projectRoot = path.isAbsolute(config.dataDir)
      ? path.dirname(config.dataDir)
      : path.resolve(process.cwd(), path.dirname(config.dataDir));
    dbConfig = {
      type: 'sqlite' as const,
      sqlite: {
        file: path.join(projectRoot, '.system-data', 'civic.db'),
      },
    };
  } else if (dbConfig.sqlite?.file && !path.isAbsolute(dbConfig.sqlite.file)) {
    // Resolve relative database paths to absolute using project root
    const projectRoot = path.isAbsolute(config.dataDir)
      ? path.dirname(config.dataDir)
      : path.resolve(process.cwd(), path.dirname(config.dataDir));
    dbConfig = {
      ...dbConfig,
      sqlite: {
        ...dbConfig.sqlite,
        file: path.resolve(projectRoot, dbConfig.sqlite.file),
      },
    };
  }

  container.registerInstance('dbConfig', dbConfig);

  // Step 3: Register database service (depends on: logger, dbConfig)
  // Note: cacheManager is registered later, but DatabaseService can work without it initially
  container.singleton('database', (c) => {
    const logger = c.resolve<Logger>('logger');
    const dbConfig = c.resolve<typeof config.database>('dbConfig');
    const cacheManager = c.resolve<UnifiedCacheManager>('cacheManager');
    return new DatabaseService(dbConfig!, logger, cacheManager);
  });

  // Step 4: Register auth service (depends on: database, config)
  container.singleton('auth', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const config = c.resolve<CivicPressConfig>('config');
    return new AuthService(db, config.dataDir);
  });

  // Step 5: Initialize role manager (side effect, not a service)
  initializeRoleManager(config.dataDir);

  // Step 6: Register services with no dependencies
  container.singleton('configDiscovery', () => new ConfigDiscovery());
  container.singleton('workflow', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    return new WorkflowEngine();
  });
  container.singleton('git', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    return new GitEngine(config.dataDir);
  });
  container.singleton('hooks', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    return new HookSystem(config.dataDir);
  });
  container.singleton('template', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    return new TemplateEngine(config.dataDir);
  });

  // Step 7: Register notification config and service
  container.singleton('notificationConfig', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    return new NotificationConfig(config.dataDir);
  });
  container.singleton('notification', (c) => {
    const notificationConfig =
      c.resolve<NotificationConfig>('notificationConfig');
    return new NotificationService(notificationConfig);
  });

  // Step 8: Register indexing service placeholder
  // Note: IndexingService requires CivicPress instance, which we'll handle in completeServiceInitialization
  // We register a placeholder instance here that will be replaced with the actual instance during initialization
  // We use a minimal placeholder object that satisfies the type but will be replaced
  // This allows tests to check for service existence before initialization
  const placeholderIndexingService = {
    // Minimal placeholder - will be replaced in completeServiceInitialization
    _isPlaceholder: true,
  } as unknown as IndexingService;
  container.registerInstance('indexing', placeholderIndexingService, true);

  // Step 9: Register unified cache manager (depends on: logger)
  container.singleton('cacheManager', (c) => {
    const logger = c.resolve<Logger>('logger');
    return new UnifiedCacheManager(logger);
  });

  // Step 10: Register saga services (depends on: database)
  container.singleton('sagaStateStore', (c) => {
    const db = c.resolve<DatabaseService>('database');
    return new SagaStateStore(db);
  });
  container.singleton('idempotencyManager', (c) => {
    const stateStore = c.resolve<SagaStateStore>('sagaStateStore');
    return new IdempotencyManager(stateStore);
  });
  container.singleton('resourceLockManager', (c) => {
    const db = c.resolve<DatabaseService>('database');
    return new ResourceLockManager(db);
  });
  container.singleton('sagaExecutor', (c) => {
    const stateStore = c.resolve<SagaStateStore>('sagaStateStore');
    const idempotencyManager =
      c.resolve<IdempotencyManager>('idempotencyManager');
    const lockManager = c.resolve<ResourceLockManager>('resourceLockManager');
    return new SagaExecutor(stateStore, idempotencyManager, lockManager);
  });

  // Step 11: Register record manager (depends on: database, git, hooks, workflow, template, config, cacheManager)
  container.singleton('recordManager', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const git = c.resolve<GitEngine>('git');
    const hooks = c.resolve<HookSystem>('hooks');
    const workflow = c.resolve<WorkflowEngine>('workflow');
    const template = c.resolve<TemplateEngine>('template');
    const config = c.resolve<CivicPressConfig>('config');
    const cacheManager = c.resolve<UnifiedCacheManager>('cacheManager');
    return new RecordManager(
      db,
      git,
      hooks,
      workflow,
      template,
      config.dataDir,
      cacheManager
    );
  });
}

/**
 * Complete service initialization after container is set up
 * This handles services that need the CivicPress instance
 *
 * @param container - Service container
 * @param civicPress - CivicPress instance
 */
export async function completeServiceInitialization(
  container: ServiceContainer,
  civicPress: CivicPress
): Promise<void> {
  // Initialize secrets manager first (before other services that depend on it)
  const secretsManager = container.resolve<SecretsManager>('secretsManager');
  await secretsManager.initialize();

  // Initialize secrets in auth services
  const authService = container.resolve<AuthService>('auth');
  authService.initializeSecrets(secretsManager);
  authService.initializeEmailValidationSecrets(secretsManager);

  // Initialize secrets in notification service
  const notificationService =
    container.resolve<NotificationService>('notification');
  notificationService.initializeSecrets(secretsManager);

  // Set up indexing service with CivicPress instance
  const indexingService = new IndexingService(
    civicPress,
    civicPress.getDataDir()
  );

  // Register the indexing service instance
  // Note: This is a workaround - ideally IndexingService wouldn't need CivicPress
  // We use registerInstance to replace any placeholder registration
  container.registerInstance('indexing', indexingService);

  // Set indexing service on workflow engine
  const workflow = container.resolve<WorkflowEngine>('workflow');
  workflow.setIndexingService(indexingService);

  // Register storage module services (optional, depends on: logger, cacheManager, database)
  // Note: Storage module is optional - registration will be skipped if module is not available
  // We use dynamic import here since this function is async and can handle ES modules properly
  try {
    // Try to import storage services registration from main package export
    // Use a try-catch around the import to handle cases where the module is not available
    // Type assertion is needed because storage module is optional and may not be in core's dependencies
    let storageModule: any = null;
    let importError: any = null;
    try {
      // Import from main package (storage-services is re-exported from index)
      // Using type assertion to handle optional module (not in core's dependencies)
      // Try both package name and relative path for better compatibility
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      try {
        storageModule = await import('@civicpress/storage' as string);
      } catch (e1: any) {
        // Fallback to file:// URL import if package import fails
        // This helps in test environments where module resolution might differ
        const path = await import('path');
        const { pathToFileURL } = await import('url');

        // Use process.cwd() to find storage module
        // This works reliably in both test and production environments
        const storagePath = path.resolve(
          process.cwd(),
          'modules/storage/dist/index.js'
        );

        // Convert to file:// URL for ES module import
        try {
          const storageUrl = pathToFileURL(storagePath).href;
          storageModule = await import(storageUrl);
          // Fallback succeeded - exit early, don't let outer catch interfere
          importError = null;
        } catch (e2: any) {
          // File path import also failed - storage module not available
          const logger = container.resolve<Logger>('logger');
          if (process.env.NODE_ENV === 'test') {
            logger.warn(`Fallback import failed: ${e2?.message || e2}`);
            logger.warn(`Storage path attempted: ${storagePath}`);
          }
          // Both imports failed - set error for outer catch
          importError = e1;
          storageModule = null;
        }
      }
    } catch (err: any) {
      // Only set error if not already set by inner catch
      if (!importError) {
        importError = err;
      }
      // Only set storageModule to null if it wasn't set by fallback
      if (!storageModule) {
        // Module not found - this is expected in some environments
        // Check if it's a module not found error vs other errors
        if (
          err?.code === 'ERR_MODULE_NOT_FOUND' ||
          err?.message?.includes('Cannot find module') ||
          err?.message?.includes('Cannot find package')
        ) {
          // Expected - storage module not available
          storageModule = null;
        } else {
          // Unexpected error - log it for debugging
          const logger = container.resolve<Logger>('logger');
          logger.warn(
            'Storage module import failed (non-standard error):',
            err?.message || err
          );
          storageModule = null;
        }
      }
    }

    if (storageModule?.registerStorageServices) {
      const config = container.resolve<CivicPressConfig>('config');
      storageModule.registerStorageServices(container, config);
      const logger = container.resolve<Logger>('logger');
      if (logger.isVerbose()) {
        logger.debug('Storage services registered successfully');
      }

      if (logger.isVerbose()) {
        logger.debug('Storage services registered successfully');
      }
    } else if (importError) {
      // Only log if we actually tried to import and it failed
      // This helps debug test failures
      const logger = container.resolve<Logger>('logger');
      // Always log in test environment to help debug
      if (process.env.NODE_ENV === 'test') {
        logger.warn(
          `Storage module import failed: ${importError?.code || 'unknown'} - ${importError?.message || 'no message'}`
        );
        if (importError?.stack) {
          logger.warn('Storage import stack:', importError.stack);
        }
      } else if (logger.isVerbose()) {
        logger.debug(
          `Storage module not available: ${importError?.code || 'unknown'} - ${importError?.message || 'no message'}`
        );
      }
    }
  } catch (error) {
    // Storage module not available - that's okay, it's optional
    // This is expected in environments where storage module is not installed
    // We silently skip registration (no error logging needed)
  }

  // Register realtime module services if available
  // Note: Realtime module is optional - registration will be skipped if module is not available
  // Unified architecture: Always try to load realtime if module is available (no flag required)
  // This simplifies the architecture and removes state synchronization issues
  // We use dynamic import here since this function is async and can handle ES modules properly
  const realtimeLogger = container.resolve<Logger>('logger');
  realtimeLogger.info('Attempting to register realtime module services...', {
    operation: 'civic-core:realtime:registration-start',
  });
  try {
    // Try to import realtime services registration
    // Use a try-catch around the import to handle cases where the module is not available
    // Type assertion is needed because realtime module is optional and may not be in core's dependencies
    let realtimeModule: any = null;
    let importError: any = null;
    try {
      // Import from main package (realtime-services is re-exported from index)
      // Using type assertion to handle optional module (not in core's dependencies)
      // Try both package name and relative path for better compatibility
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      try {
        realtimeModule = await import(
          '@civicpress/realtime/realtime-services' as string
        );
      } catch (e1: any) {
        const logger = container.resolve<Logger>('logger');
        logger.info('Realtime package import failed, trying path import', {
          operation: 'civic-core:realtime:package-import-failed',
          error: e1?.message || String(e1),
          errorCode: e1?.code,
        });
        // Fallback to file:// URL import if package import fails
        // This helps in test environments where module resolution might differ
        const path = await import('path');
        const { pathToFileURL } = await import('url');

        // Use process.cwd() to find realtime module
        // This works reliably in both test and production environments
        const realtimePath = path.resolve(
          process.cwd(),
          'modules/realtime/dist/realtime-services.js'
        );

        // Convert to file:// URL for ES module import
        try {
          const realtimeUrl = pathToFileURL(realtimePath).href;
          realtimeModule = await import(realtimeUrl);
          // Fallback succeeded - exit early, don't let outer catch interfere
          importError = null;
        } catch (e2: any) {
          // File path import also failed - realtime module not available
          const logger = container.resolve<Logger>('logger');
          logger.info('Realtime module path import failed, trying fallback', {
            operation: 'civic-core:realtime:path-import-failed',
            path: realtimePath,
            error: e2?.message || String(e2),
            errorCode: e2?.code,
          });
          // Both imports failed - set error for outer catch
          importError = e1;
          realtimeModule = null;
        }
      }
    } catch (err: any) {
      // Only set error if not already set by inner catch
      if (!importError) {
        importError = err;
      }
      // Only set realtimeModule to null if it wasn't set by fallback
      if (!realtimeModule) {
        // Module not found - this is expected in some environments
        // Check if it's a module not found error vs other errors
        if (
          err?.code === 'ERR_MODULE_NOT_FOUND' ||
          err?.message?.includes('Cannot find module') ||
          err?.message?.includes('Cannot find package')
        ) {
          // Expected - realtime module not available
          realtimeModule = null;
        } else {
          // Unexpected error - log it for debugging
          const logger = container.resolve<Logger>('logger');
          logger.warn(
            'Realtime module import failed (non-standard error):',
            err?.message || err
          );
          realtimeModule = null;
        }
      }
    }

    const logger = container.resolve<Logger>('logger');
    if (realtimeModule?.registerRealtimeServices) {
      const config = container.resolve<CivicPressConfig>('config');
      realtimeModule.registerRealtimeServices(container, config);
      logger.info('Realtime services registered successfully', {
        operation: 'civic-core:realtime:services-registered',
      });
    } else if (importError) {
      // Only log if we actually tried to import and it failed
      // This helps debug test failures
      // Always log in test environment to help debug
      if (process.env.NODE_ENV === 'test') {
        logger.warn(
          `Realtime module import failed: ${importError?.code || 'unknown'} - ${importError?.message || 'no message'}`
        );
        if (importError?.stack) {
          logger.warn('Realtime import stack:', importError.stack);
        }
      } else {
        // Log at info level so it's visible (not just verbose)
        logger.info('Realtime module not available', {
          operation: 'civic-core:realtime:module-not-available',
          errorCode: importError?.code || 'unknown',
          errorMessage: importError?.message || 'no message',
          note: 'This is expected if the realtime module is not built or not available',
        });
      }
    } else {
      // No error, but also no registerRealtimeServices - module loaded but wrong structure
      logger.warn(
        'Realtime module loaded but registerRealtimeServices not found',
        {
          operation: 'civic-core:realtime:invalid-module',
          hasModule: !!realtimeModule,
          exports: realtimeModule ? Object.keys(realtimeModule) : [],
        }
      );
    }

    // Initialize realtime server if available
    // Note: This must happen after all services are registered
    // Only initialize if we successfully registered services
    // Note: We DON'T initialize here - we'll do it after broadcast-box services are registered
    // so that device authentication dependencies can be set before initialization
    // The realtime server will be initialized later in the initialization flow
    try {
      // Just verify it's registered, don't initialize yet
      const realtimeServer = container.resolve('realtimeServer') as any;
      if (realtimeServer && typeof realtimeServer.initialize === 'function') {
        const logger = container.resolve<Logger>('logger');
        if (logger.isVerbose()) {
          logger.debug(
            'Realtime server registered (will initialize after broadcast-box services)'
          );
        }
      }
    } catch (error: any) {
      // Realtime server not available or initialization failed
      // This is expected if module is not installed or disabled
      const logger = container.resolve<Logger>('logger');
      if (
        error?.code === 'SERVICE_NOT_FOUND' ||
        error?.message?.includes('not found') ||
        error?.message?.includes('Service')
      ) {
        // Service not registered - that's okay, module is optional
        if (logger.isVerbose()) {
          logger.debug('Realtime server not registered (module optional)');
        }
      } else {
        // Other error - log it
        logger.warn(
          'Realtime server initialization failed:',
          error?.message || error
        );
      }
    }
  } catch (error) {
    // Realtime module not available - that's okay, it's optional
    // This is expected in environments where realtime module is not installed
    // Log at info level so we can see what happened
    const logger = container.resolve<Logger>('logger');
    logger.info('Realtime module registration block failed', {
      operation: 'civic-core:realtime:registration-block-error',
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      note: 'This may indicate the realtime module is not available or there was an error during import',
    });
  }

  // Register broadcast-box module services (optional)
  // Note: Broadcast-box module is optional - registration will be skipped if module is not available
  // We use dynamic import here since this function is async and can handle ES modules properly
  const broadcastBoxLogger = container.resolve<Logger>('logger');
  const broadcastBoxConfig = container.resolve<CivicPressConfig>('config');
  broadcastBoxLogger.info(
    'Attempting to register Broadcast Box module services...'
  );
  try {
    let broadcastBoxModule: any = null;
    let importError: any = null;
    try {
      broadcastBoxModule = await import('@civicpress/broadcast-box' as string);
      broadcastBoxLogger.info(
        'Broadcast Box module imported successfully via package name'
      );
    } catch (e1: any) {
      broadcastBoxLogger.info(
        `Broadcast Box package import failed, trying path import: ${e1?.message || 'unknown'}`
      );
      const path = await import('path');
      const { pathToFileURL } = await import('url');
      const broadcastBoxPath = path.resolve(
        process.cwd(),
        'modules/broadcast-box/dist/index.js'
      );
      try {
        const broadcastBoxUrl = pathToFileURL(broadcastBoxPath).href;
        broadcastBoxModule = await import(broadcastBoxUrl);
        importError = null;
        broadcastBoxLogger.info(
          `Broadcast Box module imported successfully via path: ${broadcastBoxPath}`
        );
      } catch (e2: any) {
        broadcastBoxLogger.warn(
          `Broadcast Box fallback import failed: ${e2?.message || e2}`
        );
        broadcastBoxLogger.warn(
          `Broadcast Box path attempted: ${broadcastBoxPath}`
        );
        importError = e1;
        broadcastBoxModule = null;
      }
    }

    if (broadcastBoxModule) {
      broadcastBoxLogger.info(
        `Broadcast Box module loaded. Available exports: ${Object.keys(broadcastBoxModule).join(', ')}`
      );
    }

    if (broadcastBoxModule?.registerBroadcastBoxServices) {
      broadcastBoxLogger.info('Calling registerBroadcastBoxServices...');
      try {
        await broadcastBoxModule.registerBroadcastBoxServices(
          container,
          broadcastBoxConfig
        );
        broadcastBoxLogger.info(
          'Broadcast Box module services registered successfully'
        );
      } catch (regError: any) {
        broadcastBoxLogger.error(
          `Failed to register Broadcast Box services: ${regError?.message || 'unknown error'}`,
          regError
        );
        if (regError?.stack) {
          broadcastBoxLogger.error('Registration error stack:', regError.stack);
        }
      }
    } else {
      if (importError) {
        broadcastBoxLogger.warn(
          `Broadcast Box module import failed: ${importError?.code || 'unknown'} - ${importError?.message || 'no message'}`
        );
        if (importError?.stack) {
          broadcastBoxLogger.warn(
            'Broadcast Box import stack:',
            importError.stack
          );
        }
      } else if (broadcastBoxModule) {
        broadcastBoxLogger.warn(
          'Broadcast Box module imported but registerBroadcastBoxServices function not found'
        );
        broadcastBoxLogger.warn(
          `Available exports: ${Object.keys(broadcastBoxModule).join(', ')}`
        );
      } else {
        broadcastBoxLogger.warn(
          'Broadcast Box module not imported and no import error recorded'
        );
      }
    }
  } catch (error: any) {
    // Broadcast Box module not available - that's okay, it's optional
    broadcastBoxLogger.warn(
      `Broadcast Box module registration failed with error: ${error?.message || 'unknown'}`
    );
    if (error?.stack) {
      broadcastBoxLogger.warn(
        'Broadcast Box registration error stack:',
        error.stack
      );
    }
  }

  // Initialize realtime server AFTER broadcast-box services are registered
  // This allows broadcast-box to set device authentication dependencies before initialization
  // Unified architecture: Always initialize if realtime server is registered (no flag check)
  const initLogger = container.resolve<Logger>('logger');
  try {
    const realtimeServer = container.resolve('realtimeServer') as any;
    if (realtimeServer && typeof realtimeServer.initialize === 'function') {
      initLogger.info('Attempting to initialize realtime server...', {
        operation: 'civic-core:realtime:initialization:start',
      });
      await realtimeServer.initialize();
      initLogger.info(
        'Realtime server initialized successfully (unified architecture)',
        {
          operation: 'civic-core:realtime:initialization:success',
        }
      );
    } else {
      initLogger.warn(
        'Realtime server found but initialize() method not available',
        {
          operation: 'civic-core:realtime:initialization:no-method',
          hasServer: !!realtimeServer,
          hasInitialize:
            realtimeServer && typeof realtimeServer.initialize === 'function',
        }
      );
    }
  } catch (error: any) {
    // Realtime server not available or initialization failed
    if (
      error?.code === 'SERVICE_NOT_FOUND' ||
      error?.message?.includes('not found') ||
      error?.message?.includes('Service')
    ) {
      // Service not registered - that's okay, module is optional
      initLogger.debug('Realtime server not registered (module optional)', {
        operation: 'civic-core:realtime:initialization:not-registered',
        error: error?.message || 'unknown',
      });
    } else {
      // Other error - log it with full details
      initLogger.error('Realtime server initialization failed', {
        operation: 'civic-core:realtime:initialization:error',
        error: error?.message || String(error),
        errorCode: error?.code,
        stack: error?.stack,
      });
    }
  }

  // Register all caches with UnifiedCacheManager
  const cacheManager = container.resolve<UnifiedCacheManager>('cacheManager');
  const config = container.resolve<CivicPressConfig>('config');
  const cacheLogger = container.resolve<Logger>('logger');

  // Register search caches
  await cacheManager.registerFromConfig('search', {
    strategy: 'memory',
    enabled: true,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 500,
  });

  await cacheManager.registerFromConfig('searchSuggestions', {
    strategy: 'memory',
    enabled: true,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 1000,
  });

  // Register diagnostic cache
  await cacheManager.registerFromConfig('diagnostics', {
    strategy: 'memory',
    enabled: true,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 100,
  });

  // Register template cache
  await cacheManager.registerFromConfig('templates', {
    strategy: 'file_watcher',
    enabled: true,
    defaultTTL: 0, // Infinite (file watching handles invalidation)
    maxSize: 1000,
    watchDirectories: [
      path.join(config.dataDir, '.civic', 'templates'),
      path.join(config.dataDir, '.civic', 'partials'),
    ],
    debounceMs: 100,
    enableWatching: true,
  });

  // Register template list cache
  await cacheManager.registerFromConfig('templateLists', {
    strategy: 'memory',
    enabled: true,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 100,
  });

  // Register record suggestions cache
  await cacheManager.registerFromConfig('recordSuggestions', {
    strategy: 'memory',
    enabled: true,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 1000,
  });

  // Register storage metadata cache
  // Note: Configuration from storage.yml will be loaded later and applied if available
  // For now, use sensible defaults
  await cacheManager.registerFromConfig('storageMetadata', {
    strategy: 'memory',
    enabled: true,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 1000,
  });

  // Initialize cache manager
  await cacheManager.initialize();

  cacheLogger.debug('Unified cache manager initialized with all caches');
}
