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
export {
  GitHubOAuthProvider,
  OAuthProviderManager,
} from './auth/oauth-provider.js';
export { AuthConfigManager } from './auth/auth-config.js';

// Export role-based authorization utilities
export {
  userCan,
  userHasRole,
  getUserPermissions,
  userCanCreate,
  userCanEdit,
  userCanDelete,
  userCanView,
  userIsAdmin,
  initializeRoleManager,
} from './auth/role-utils.js';

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
  const { CentralConfigManager } = await import('./config/central-config.js');
  const config = CentralConfigManager.getConfig();
  return {
    configPath: '.civicrc',
    dataDir: config.dataDir,
  };
}

// Export central configuration
export { CentralConfigManager } from './config/central-config.js';
export type { CentralConfig } from './config/central-config.js';

// Export record types configuration
export {
  DEFAULT_RECORD_TYPES,
  validateRecordTypeConfig,
  mergeRecordTypes,
  getRecordTypesWithMetadata,
} from './config/record-types.js';
export type {
  RecordTypeConfig,
  RecordTypesConfig,
  RecordTypeMetadata,
} from './config/record-types.js';

// Export record statuses configuration
export {
  DEFAULT_RECORD_STATUSES,
  validateRecordStatusConfig,
  mergeRecordStatuses,
  getRecordStatusesWithMetadata,
} from './config/record-statuses.js';
export type {
  RecordStatusConfig,
  RecordStatusesConfig,
  RecordStatusMetadata,
} from './config/record-statuses.js';

// Export indexing services
export { IndexingService } from './indexing/indexing-service.js';
export type {
  CivicIndex,
  CivicIndexEntry,
  IndexingOptions,
} from './indexing/indexing-service.js';
