/**
 * CivicPress Service Registration
 *
 * This module centralizes all service registrations for the Dependency Injection
 * Container. It defines the service dependency graph and registration order.
 */

import * as path from 'path';
import { errorMessage, errorStack, errorCode } from './utils/error-narrow.js';
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
import { AuditLogger } from './audit/audit-logger.js';
import { AuditChannel } from './audit/audit-channel.js';
import { ModuleResolver } from './modules/module-resolver.js';
import { setModuleResolver as setRecordSchemaModuleResolver } from './records/record-schema-builder.js';

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

  // Step 2.5: Register ModuleResolver (Phase 2d W1-T2) — replaces the
  // prior process.cwd()-based filesystem discovery in record-schema-builder
  // and the storage-module fallback below. ModulesRoot resolves relative
  // to the project root (parent of dataDir) so production and test runs
  // both find the modules/ directory deterministically.
  container.singleton('moduleResolver', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    const projectRoot = path.isAbsolute(config.dataDir)
      ? path.dirname(config.dataDir)
      : path.resolve(process.cwd(), path.dirname(config.dataDir));
    const resolver = new ModuleResolver(path.join(projectRoot, 'modules'));
    // Wire into RecordSchemaBuilder so schema-extension lookup uses the
    // same resolver instance (singleton across the request lifecycle).
    setRecordSchemaModuleResolver(resolver);
    return resolver;
  });

  // Step 3: Register database service (depends on: logger, dbConfig)
  // Note: cacheManager is registered later, but DatabaseService can work without it initially
  container.singleton('database', (c) => {
    const logger = c.resolve<Logger>('logger');
    const dbConfig = c.resolve<typeof config.database>('dbConfig');
    const cacheManager = c.resolve<UnifiedCacheManager>('cacheManager');
    return new DatabaseService(dbConfig!, logger, cacheManager);
  });

  // Step 4: Register auth service (depends on: database, config, auditChannel)
  // Note: auditChannel is registered at Step 10.5 but resolution is lazy —
  // 'auth' is only resolved during completeServiceInitialization (or first
  // explicit resolve), by which point auditChannel is registered.
  container.singleton('auth', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const config = c.resolve<CivicPressConfig>('config');
    const auditChannel = c.resolve<AuditChannel>('auditChannel');
    return new AuthService(db, config.dataDir, auditChannel);
  });

  // Step 5: Initialize role manager (side effect, not a service)
  initializeRoleManager(config.dataDir);

  // Step 6: Register services with no dependencies
  container.singleton('configDiscovery', () => new ConfigDiscovery());
  container.singleton('workflow', () => {
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
    // AuditChannel injection: Phase 2c Task 9 — closes core-013 (sagas
    // now write start / complete / failure to the unified channel).
    const auditChannel = c.resolve<AuditChannel>('auditChannel');
    return new SagaExecutor(
      stateStore,
      idempotencyManager,
      lockManager,
      undefined,
      auditChannel
    );
  });

  // Step 10.5: Register the unified AuditChannel (Phase 2c Task 9 — closes
  // core-001 + core-013). Wraps AuditLogger (file-JSONL, resilient) + DB
  // logAuditEvent (queryable). File-JSONL first; DB second.
  container.singleton('auditLogger', (c) => {
    const config = c.resolve<CivicPressConfig>('config');
    return new AuditLogger({ dataDir: config.dataDir });
  });
  container.singleton('auditChannel', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const fileLogger = c.resolve<AuditLogger>('auditLogger');
    return new AuditChannel(db, fileLogger);
  });

  // Step 11: Register record manager (depends on: database, git, hooks,
  // workflow, template, config, cacheManager, auditChannel)
  container.singleton('recordManager', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const git = c.resolve<GitEngine>('git');
    const hooks = c.resolve<HookSystem>('hooks');
    const workflow = c.resolve<WorkflowEngine>('workflow');
    const template = c.resolve<TemplateEngine>('template');
    const config = c.resolve<CivicPressConfig>('config');
    const cacheManager = c.resolve<UnifiedCacheManager>('cacheManager');
    const auditChannel = c.resolve<AuditChannel>('auditChannel');
    return new RecordManager(
      db,
      git,
      hooks,
      workflow,
      template,
      config.dataDir,
      cacheManager,
      auditChannel
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
  // Force-resolve ModuleResolver early so its factory side-effect (wiring
  // RecordSchemaBuilder via setModuleResolver) runs before any schema
  // build attempts. Phase 2d W1-T2.
  container.resolve<ModuleResolver>('moduleResolver');

  // Initialize secrets manager first (before other services that depend on it)
  const secretsManager = container.resolve<SecretsManager>('secretsManager');
  await secretsManager.initialize();

  // Initialize secrets in auth services
  const authService = container.resolve<AuthService>('auth');
  authService.initializeSecrets(secretsManager);
  authService.initializeEmailValidationSecrets(secretsManager);

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
    // The storage module isn't declared in core's dependencies (optional);
    // we structurally probe `registerStorageServices` from the loaded module.
    let storageModule: { registerStorageServices?: unknown } | null = null;
    let importError: unknown = null;
    try {
      // Import from main package (storage-services is re-exported from index)
      // Using type assertion to handle optional module (not in core's dependencies)
      // Try both package name and relative path for better compatibility
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      try {
        storageModule = await import('@civicpress/storage' as string);
      } catch (e1: unknown) {
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
        } catch (e2: unknown) {
          // File path import also failed - storage module not available
          const logger = container.resolve<Logger>('logger');
          if (process.env.NODE_ENV === 'test') {
            logger.warn(`Fallback import failed: ${errorMessage(e2) || e2}`);
            logger.warn(`Storage path attempted: ${storagePath}`);
          }
          // Both imports failed - set error for outer catch
          importError = e1;
          storageModule = null;
        }
      }
    } catch (err: unknown) {
      // Only set error if not already set by inner catch
      if (!importError) {
        importError = err;
      }
      // Only set storageModule to null if it wasn't set by fallback
      if (!storageModule) {
        // Module not found - this is expected in some environments
        // Check if it's a module not found error vs other errors
        if (
          errorCode(err) === 'ERR_MODULE_NOT_FOUND' ||
          errorMessage(err)?.includes('Cannot find module') ||
          errorMessage(err)?.includes('Cannot find package')
        ) {
          // Expected - storage module not available
          storageModule = null;
        } else {
          // Unexpected error - log it for debugging
          const logger = container.resolve<Logger>('logger');
          logger.warn(
            'Storage module import failed (non-standard error):',
            errorMessage(err) || err
          );
          storageModule = null;
        }
      }
    }

    if (
      storageModule?.registerStorageServices &&
      typeof storageModule.registerStorageServices === 'function'
    ) {
      const config = container.resolve<CivicPressConfig>('config');
      (
        storageModule.registerStorageServices as (
          c: typeof container,
          cfg: CivicPressConfig
        ) => void
      )(container, config);
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
          `Storage module import failed: ${errorCode(importError) || 'unknown'} - ${errorMessage(importError) || 'no message'}`
        );
        if (errorStack(importError)) {
          logger.warn('Storage import stack:', errorStack(importError));
        }
      } else if (logger.isVerbose()) {
        logger.debug(
          `Storage module not available: ${errorCode(importError) || 'unknown'} - ${errorMessage(importError) || 'no message'}`
        );
      }
    }
  } catch {
    // Storage module not available - that's okay, it's optional
    // This is expected in environments where storage module is not installed
    // We silently skip registration (no error logging needed)
  }

  // Register all caches with UnifiedCacheManager
  const cacheManager = container.resolve<UnifiedCacheManager>('cacheManager');
  const config = container.resolve<CivicPressConfig>('config');
  const logger = container.resolve<Logger>('logger');

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

  logger.debug('Unified cache manager initialized with all caches');
}
