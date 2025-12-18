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
  container.singleton('database', (c) => {
    const logger = c.resolve<Logger>('logger');
    const dbConfig = c.resolve<typeof config.database>('dbConfig');
    return new DatabaseService(dbConfig!, logger);
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

  // Step 8: Register indexing service
  // Note: IndexingService requires CivicPress instance, which we'll handle in completeServiceInitialization
  // We'll register it there using registerInstance

  // Step 9: Register record manager (depends on: database, git, hooks, workflow, template, config)
  container.singleton('recordManager', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const git = c.resolve<GitEngine>('git');
    const hooks = c.resolve<HookSystem>('hooks');
    const workflow = c.resolve<WorkflowEngine>('workflow');
    const template = c.resolve<TemplateEngine>('template');
    const config = c.resolve<CivicPressConfig>('config');
    return new RecordManager(
      db,
      git,
      hooks,
      workflow,
      template,
      config.dataDir
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
export function completeServiceInitialization(
  container: ServiceContainer,
  civicPress: CivicPress
): void {
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
}
