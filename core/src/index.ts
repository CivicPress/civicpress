// Export main CivicPress class
export { CivicPress } from './civic-core.js';
export { CreateRecordRequest, UpdateRecordRequest } from './civic-core.js';

// Export record management
export { RecordManager, RecordData } from './records/record-manager.js';
export { RecordParser } from './records/record-parser.js';
export { RecordValidator } from './records/record-validator.js';
export { RecordSchemaBuilder } from './records/record-schema-builder.js';
export { RecordSchemaValidator } from './records/record-schema-validator.js';
export {
  buildRecordRelativePath,
  buildArchiveRelativePath,
  ensureDirectoryForRecordPath,
  findRecordFileSync,
  getRecordYear,
  listRecordFilesSync,
  parseRecordRelativePath,
} from './utils/record-paths.js';
export type {
  ValidationError,
  ValidationResult,
} from './records/record-validator.js';

// Export geography types and utilities
export {
  validateGeography,
  normalizeGeography,
  isEmptyGeography,
  getGeographySummary,
  GEOGRAPHY_CONSTANTS,
} from './types/geography.js';
export type {
  Geography,
  GeographyPoint,
  GeographyBBox,
  GeographyAttachment,
  GeographyValidationResult,
} from './types/geography.js';

// Export new geography data system
export { GeographyManager } from './geography/geography-manager.js';
export type {
  GeographyFile,
  GeographyFileType,
  GeographyCategory,
  GeographyRelationshipType,
  SRID,
  BoundingBox,
  CenterCoordinates,
  GeographyMetadata,
  GeographyRelationship,
  LinkedGeography,
  RecordGeography,
  CreateGeographyRequest,
  UpdateGeographyRequest,
  GeographyValidationResult as NewGeographyValidationResult,
  ParsedGeographyData,
  GeographyFormData,
  GeographyFormErrors,
  GeographyPreviewData,
  GeographyError,
  GeographyValidationError,
  GeographyNotFoundError,
} from './types/geography.js';

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
export { RoleManager } from './auth/role-manager.js';
export {
  EmailValidationService,
  EmailChangeRequest,
  EmailValidationResult,
} from './auth/email-validation-service.js';

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
export { AuditLogger } from './audit/audit-logger.js';
export { DocumentNumberGenerator } from './utils/document-number-generator.js';
export { ComplianceFieldHelpers } from './utils/compliance-helpers.js';
export {
  BackupService,
  type BackupCreateOptions,
  type BackupCreateResult,
  type BackupRestoreOptions,
  type BackupRestoreResult,
  type BackupMetadata,
} from './backup/backup-service.js';

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

// Export document number format types
export type {
  DocumentNumberFormat,
  DocumentNumberFormats,
} from './config/central-config.js';

// Export indexing services
export { IndexingService } from './indexing/indexing-service.js';
export type {
  CivicIndex,
  CivicIndexEntry,
  IndexingOptions,
} from './indexing/indexing-service.js';

// Export notification services
export {
  NotificationService,
  NotificationConfig,
  NotificationChannel,
  NotificationTemplate,
  NotificationAudit,
  NotificationQueue,
  NotificationSecurity,
  NotificationRateLimiter,
  NotificationLogger,
  AuthTemplate,
} from './notifications/index.js';
export type {
  NotificationRequest,
  NotificationResponse,
  ChannelRequest,
  ChannelResponse,
  ChannelConfig,
  TemplateData,
  ProcessedTemplate,
  AuditEntry,
  QueuedNotification,
  RateLimitConfig,
  RateLimitResult,
  SecurityValidationResult,
  LogEntry,
} from './notifications/index.js';

// Configuration Management
export {
  configurationService,
  ConfigurationService,
} from './config/configuration-service.js';
export type {
  ConfigurationServiceOptions,
  ConfigurationMetadata,
  ConfigurationFile,
} from './config/configuration-service.js';
