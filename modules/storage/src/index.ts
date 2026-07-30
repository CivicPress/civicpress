export { CloudUuidStorageService } from './cloud-uuid-storage-service.js';
export { StorageConfigManager } from './storage-config-manager.js';
export { CredentialManager } from './credential-manager.js';
export { StorageMetadataCacheAdapter } from './cache/storage-metadata-cache-adapter.js';
export { ConcurrencyLimiter } from './limiter/concurrency-limiter.js';
export {
  CircuitBreaker,
  CircuitBreakerManager,
} from './circuit-breaker/circuit-breaker.js';
export { StorageUsageReporter } from './reporting/storage-usage-reporter.js';
export { QuotaManager } from './quota/quota-manager.js';
export { OrphanedFileCleaner } from './cleanup/orphaned-file-cleaner.js';
export { LifecycleManager } from './lifecycle/lifecycle-manager.js';
export * from './errors/storage-errors.js';
export type * from './types/storage.types.js';

// Service registration (Pattern 2: Service Registration)
export {
  registerStorageServices,
  initializeStorageService,
} from './storage-services.js';

// Default export for easy importing
export { CloudUuidStorageService as default } from './cloud-uuid-storage-service.js';
