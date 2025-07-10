// Export main CivicPress class
export { CivicPress } from './civic-core.js';
export { CreateRecordRequest, UpdateRecordRequest } from './civic-core.js';

// Export record management
export { RecordManager, RecordData } from './records/record-manager.js';

// Export database services
export { DatabaseService } from './database/database-service.js';
export {
  DatabaseAdapter,
  DatabaseConfig,
  createDatabaseAdapter,
} from './database/database-adapter.js';

// Export auth services
export { AuthService, AuthUser, ApiKey, Session } from './auth/auth-service.js';

// Export existing services
export { GitEngine } from './git/git-engine.js';
export { HookSystem } from './hooks/hook-system.js';
export { WorkflowEngine } from './workflows/workflow-engine.js';
export { WorkflowConfigManager } from './config/workflow-config.js';
export { ConfigDiscovery } from './config/config-discovery.js';
export { Logger } from './utils/logger.js';
export { TemplateEngine } from './utils/template-engine.js';

// Export utility functions for CLI use
export async function loadConfig() {
  const { ConfigDiscovery } = await import('./config/config-discovery.js');
  const configPath = ConfigDiscovery.findConfig();
  if (!configPath) {
    return null;
  }

  const dataDir = ConfigDiscovery.getDataDirFromConfig(configPath);
  return { configPath, dataDir };
}

// Export central configuration
export { CentralConfigManager } from './config/central-config.js';
export type { CentralConfig } from './config/central-config.js';
