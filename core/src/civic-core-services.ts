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
