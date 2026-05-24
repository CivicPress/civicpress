/**
 * CloudUuidStorageService — UUID-tracked, multi-provider storage facade.
 *
 * Phase 2d W2-T18 decomposed the prior 2,711-LoC monolith into focused
 * collaborators under `cloud-uuid-storage/`:
 *
 *   - internals.ts       — module-level pure helpers + host-coupled
 *                          `getLocalStoragePath` / `logOperation`
 *   - validation.ts      — StorageValidation (file + batch validation)
 *   - provider-init.ts   — ProviderInit (per-provider SDK client bootstrap
 *                          + performHealthCheck)
 *   - upload-ops.ts      — UploadOps (uploadFile + per-provider helpers)
 *   - download-ops.ts    — DownloadOps (getFileById / getFileContent /
 *                          listFiles + per-provider helpers)
 *   - file-mgmt-ops.ts   — FileMgmtOps (deleteFile / updateFile + per-
 *                          provider helpers)
 *   - batch-ops.ts       — BatchOps (batchUpload / batchDelete; cross-calls
 *                          back into the host for single-file ops)
 *   - streaming-ops.ts   — StreamingOps (upload/download Stream + helpers)
 *
 * This file is the orchestrator: holds the configuration, the per-provider
 * SDK clients, and all of the optional manager handles that get set after
 * construction (databaseService, cacheAdapter, retryManager, etc.). It
 * instantiates the collaborators in the constructor — they each hold a
 * back-reference to the orchestrator so mutable setter state stays visible.
 *
 * Public surface is preserved exactly (every method on the prior class is
 * still here with the same signature) so external callers — storage-services
 * registration, route handlers, OrphanedFileCleaner, LifecycleManager — do
 * not need to change.
 */

import { Readable } from 'stream';
import type { S3Client } from '@aws-sdk/client-s3';
import type { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import type { Storage, Bucket } from '@google-cloud/storage';
import type {
  StorageConfig,
  StorageFile,
  UploadFileResponse,
  BatchUploadResponse,
  BatchDeleteResponse,
  StorageProvider,
  StorageDatabaseService,
} from './types/storage.types.js';
import { CredentialManager } from './credential-manager.js';
import { Logger } from '@civicpress/core';
import type { UnifiedCacheManager } from '@civicpress/core';
import { StorageMetadataCacheAdapter } from './cache/storage-metadata-cache-adapter.js';
import {
  ConcurrencyLimiter,
  type ConcurrencyLimits,
} from './limiter/concurrency-limiter.js';
import { RetryManager } from './retry/retry-manager.js';
import { StorageFailoverManager } from './failover/storage-failover-manager.js';
import { CircuitBreakerManager } from './circuit-breaker/circuit-breaker.js';
import { StorageHealthChecker } from './health/storage-health-checker.js';
import { type TimeoutConfig } from './utils/timeout.js';
import { StorageMetricsCollector } from './metrics/storage-metrics-collector.js';
import { StorageUsageReporter } from './reporting/storage-usage-reporter.js';
import { QuotaManager } from './quota/quota-manager.js';
import { OrphanedFileCleaner } from './cleanup/orphaned-file-cleaner.js';
import { LifecycleManager } from './lifecycle/lifecycle-manager.js';

import { StorageValidation } from './cloud-uuid-storage/validation.js';
import { ProviderInit } from './cloud-uuid-storage/provider-init.js';
import { UploadOps } from './cloud-uuid-storage/upload-ops.js';
import { DownloadOps } from './cloud-uuid-storage/download-ops.js';
import { FileMgmtOps } from './cloud-uuid-storage/file-mgmt-ops.js';
import { BatchOps } from './cloud-uuid-storage/batch-ops.js';
import { StreamingOps } from './cloud-uuid-storage/streaming-ops.js';
import { parseSizeString } from './cloud-uuid-storage/internals.js';

export class CloudUuidStorageService {
  // NOTE: All instance fields below are public so the ops collaborators
  // (which hold a back-ref to this orchestrator) can read them after the
  // host's setters mutate state post-construction. The prior monolith
  // accessed them as `this.foo`; collaborators now do `this.host.foo`.
  config: StorageConfig;
  logger: Logger;
  basePath: string;
  databaseService?: StorageDatabaseService; // Set by setDatabaseService()

  /**
   * Lazy-init state set by `storage-services.ts` registration. Allows the
   * service to be created with defaults at DI-registration time and
   * upgraded with real config on first use. Phase 2d W3-T6.
   */
  _initialized?: boolean;
  _needsInitialization?: boolean;
  _configManager?: import('./storage-config-manager.js').StorageConfigManager;
  credentialManager: CredentialManager;
  s3Client: S3Client | null = null;
  azureBlobServiceClient: BlobServiceClient | null = null;
  azureContainerClient: ContainerClient | null = null;
  gcsStorage: Storage | null = null;
  gcsBucket: Bucket | null = null;
  cacheAdapter: StorageMetadataCacheAdapter | null = null;
  concurrencyLimiter: ConcurrencyLimiter | null = null;
  retryManager: RetryManager | null = null;
  failoverManager: StorageFailoverManager | null = null;
  circuitBreakerManager: CircuitBreakerManager | null = null;
  healthChecker: StorageHealthChecker | null = null;
  // Per-provider lightweight probes shared by the health checker AND the
  // failover manager's recovery loop (storage-004 closure).
  providerProbes: Map<string, (provider: string) => Promise<void>> = new Map();
  timeoutConfig: TimeoutConfig = {};
  metricsCollector: StorageMetricsCollector | null = null;
  usageReporter: StorageUsageReporter | null = null;
  quotaManager: QuotaManager | null = null;

  // Collaborators — each holds a `{ host: this }` deps bag so mutable
  // setter state stays visible.
  validation: StorageValidation;
  private providerInit: ProviderInit;
  private uploadOps: UploadOps;
  private downloadOps: DownloadOps;
  private fileMgmtOps: FileMgmtOps;
  private batchOps: BatchOps;
  private streamingOps: StreamingOps;

  constructor(
    config: StorageConfig,
    basePath: string = '.system-data',
    cacheManager?: UnifiedCacheManager
  ) {
    this.config = config;
    this.basePath = basePath;
    this.logger = new Logger();
    this.credentialManager = new CredentialManager();

    // Initialize cache adapter if cache manager provided
    if (cacheManager) {
      this.cacheAdapter = new StorageMetadataCacheAdapter(
        cacheManager,
        this.logger
      );
    }

    // Initialize concurrency limiter from config if limits provided
    const globalConfig = config.global;
    if (
      globalConfig?.max_concurrent_uploads ||
      globalConfig?.max_concurrent_downloads ||
      globalConfig?.max_concurrent_deletes
    ) {
      this.concurrencyLimiter = new ConcurrencyLimiter(
        {
          uploads: globalConfig?.max_concurrent_uploads,
          downloads: globalConfig?.max_concurrent_downloads,
          deletes: globalConfig?.max_concurrent_deletes,
        },
        this.logger
      );
    }

    // Initialize circuit breaker manager if enabled
    if (globalConfig?.circuit_breaker_enabled !== false) {
      this.circuitBreakerManager = new CircuitBreakerManager(
        {
          failureThreshold:
            globalConfig?.circuit_breaker_failure_threshold || 5,
          timeout: globalConfig?.circuit_breaker_timeout || 60000,
        },
        this.logger
      );
    }

    // Wire collaborators eagerly — they hold back-refs to `this` so any
    // setter mutations made post-construction stay visible. Must happen
    // before `providerProbes` is populated since the probes invoke
    // providerInit.performHealthCheck.
    this.validation = new StorageValidation({ getConfig: () => this.config });
    this.providerInit = new ProviderInit({ host: this });
    this.uploadOps = new UploadOps({ host: this });
    this.downloadOps = new DownloadOps({ host: this });
    this.fileMgmtOps = new FileMgmtOps({ host: this });
    this.batchOps = new BatchOps({ host: this });
    this.streamingOps = new StreamingOps({ host: this });

    // Build per-provider probe map. Used by the health checker (when
    // enabled) and by the failover manager's recovery loop. Always
    // populate it — the failover path needs it even when periodic health
    // checks are disabled.
    const allProviders = [
      config.active_provider || 'local',
      ...(config.failover_providers || []),
    ];
    allProviders.forEach((providerName) => {
      const provider = config.providers?.[providerName];
      if (provider) {
        this.providerProbes.set(providerName, async (p: string) => {
          // Simple health check: try to list files in a test folder
          // This is a lightweight read operation
          await this.providerInit.performHealthCheck(p);
        });
      }
    });

    // Initialize health checker if enabled
    if (globalConfig?.health_checks) {
      this.healthChecker = new StorageHealthChecker(
        config,
        this.providerProbes,
        this.logger
      );
    }

    // Initialize timeout configuration
    this.timeoutConfig = {
      upload: globalConfig?.upload_timeout,
      download: globalConfig?.download_timeout,
      delete: globalConfig?.delete_timeout,
      list: globalConfig?.list_timeout,
    };

    // Initialize quota manager if usage reporter is available
    // (Will be initialized after database service is set)
  }

  /**
   * Lazy-init wrapper for collaborators that need to ensure an S3 client
   * exists (e.g. uploadToS3 will hit this if the active provider was
   * already initialized but client got cleared by shutdown()).
   */
  async initializeS3Storage(provider: StorageProvider): Promise<void> {
    return this.providerInit.initializeS3Storage(provider);
  }

  /**
   * Lazy-init wrapper — see initializeS3Storage.
   */
  async initializeAzureStorage(provider: StorageProvider): Promise<void> {
    return this.providerInit.initializeAzureStorage(provider);
  }

  /**
   * Lazy-init wrapper — see initializeS3Storage.
   */
  async initializeGCSStorage(provider: StorageProvider): Promise<void> {
    return this.providerInit.initializeGCSStorage(provider);
  }

  /**
   * Set database service for file tracking
   */
  setDatabaseService(databaseService: StorageDatabaseService): void {
    this.databaseService = databaseService;

    // Initialize usage reporter when database service is set
    if (this.cacheAdapter) {
      const cacheManager =
        (this.cacheAdapter as unknown as {
          cache?: { manager?: UnifiedCacheManager };
        }).cache?.manager;
      this.usageReporter = new StorageUsageReporter(
        databaseService,
        cacheManager,
        this.logger
      );
    } else {
      this.usageReporter = new StorageUsageReporter(
        databaseService,
        undefined,
        this.logger
      );
    }

    // Initialize quota manager if quota enforcement is enabled
    const globalConfig = this.config.global;
    if (globalConfig?.quota_enforcement !== false && this.usageReporter) {
      // Build quota config from storage config
      const quotaConfig: { enabled: boolean; folders: Record<string, { limit: number; limitFormatted: string }>; global?: { limit: number; limitFormatted: string } } = {
        enabled: true,
        folders: {},
      };

      // Add folder quotas
      for (const [folderName, folderConfig] of Object.entries(
        this.config.folders
      )) {
        if (
          folderConfig.quota &&
          folderConfig.quota !== '0' &&
          folderConfig.quota !== ''
        ) {
          quotaConfig.folders[folderName] = {
            limit: parseSizeString(folderConfig.quota),
            limitFormatted: folderConfig.quota,
          };
        }
      }

      // Add global quota if configured
      if (globalConfig?.global_quota) {
        quotaConfig.global = {
          limit: parseSizeString(globalConfig.global_quota),
          limitFormatted: globalConfig.global_quota,
        };
      }

      this.quotaManager = new QuotaManager(
        this.usageReporter,
        quotaConfig,
        this.logger
      );
    }
  }

  /**
   * Set cache manager for metadata caching
   */
  setCacheManager(cacheManager: UnifiedCacheManager): void {
    this.cacheAdapter = new StorageMetadataCacheAdapter(
      cacheManager,
      this.logger
    );
  }

  /**
   * Set concurrency limiter
   */
  setConcurrencyLimiter(limits: ConcurrencyLimits): void {
    this.concurrencyLimiter = new ConcurrencyLimiter(limits, this.logger);
  }

  /**
   * Set retry manager
   */
  setRetryManager(retryManager: RetryManager): void {
    this.retryManager = retryManager;

    // Initialize failover manager if retry manager is set and failover is configured
    if (
      this.config.failover_providers &&
      this.config.failover_providers.length > 0
    ) {
      this.failoverManager = new StorageFailoverManager(
        retryManager,
        this.config,
        this.logger,
        this.providerProbes
      );
    }
  }

  /**
   * Set failover manager
   */
  setFailoverManager(failoverManager: StorageFailoverManager): void {
    this.failoverManager = failoverManager;
  }

  /**
   * Set circuit breaker manager
   */
  setCircuitBreakerManager(circuitBreakerManager: CircuitBreakerManager): void {
    this.circuitBreakerManager = circuitBreakerManager;
  }

  /**
   * Set health checker
   */
  setHealthChecker(healthChecker: StorageHealthChecker): void {
    this.healthChecker = healthChecker;
  }

  /**
   * Get health checker
   */
  getHealthChecker(): StorageHealthChecker | null {
    return this.healthChecker;
  }

  /**
   * Set metrics collector
   */
  setMetricsCollector(metricsCollector: StorageMetricsCollector): void {
    this.metricsCollector = metricsCollector;
  }

  /**
   * Get metrics collector
   */
  getMetricsCollector(): StorageMetricsCollector | null {
    return this.metricsCollector;
  }

  /**
   * Get usage reporter
   */
  getUsageReporter(): StorageUsageReporter | null {
    return this.usageReporter;
  }

  /**
   * Get quota manager
   */
  getQuotaManager(): QuotaManager | null {
    return this.quotaManager;
  }

  /**
   * Set quota manager
   */
  setQuotaManager(quotaManager: QuotaManager): void {
    this.quotaManager = quotaManager;
  }

  /**
   * Get orphaned file cleaner
   */
  getOrphanedFileCleaner(): OrphanedFileCleaner | null {
    if (!this.databaseService) {
      return null;
    }

    return new OrphanedFileCleaner(
      this.databaseService,
      this.config,
      this.s3Client,
      this.azureContainerClient,
      this.logger
    );
  }

  /**
   * Get lifecycle manager
   */
  getLifecycleManager(policies?: import('./lifecycle/lifecycle-manager.js').LifecyclePolicy[]): LifecycleManager | null {
    if (!this.databaseService) {
      return null;
    }

    return new LifecycleManager(
      this.databaseService,
      this,
      policies || [],
      this.logger
    );
  }

  /**
   * Initialize the storage service
   */
  async initialize(): Promise<void> {
    await this.providerInit.initializeStorage();
  }

  /**
   * Shutdown the storage service and clean up clients
   */
  async shutdown(): Promise<void> {
    // Shutdown health checker if active
    if (this.healthChecker) {
      this.healthChecker.shutdown();
    }

    // Shutdown failover manager if active
    if (this.failoverManager) {
      this.failoverManager.shutdown();
    }

    // Note: AWS S3 and Azure SDK clients don't require explicit cleanup
    // The SDKs handle connection pooling internally via HTTP agents
    // We just clear the references for garbage collection
    this.s3Client = null;
    this.azureBlobServiceClient = null;
    this.azureContainerClient = null;
    this.logger.debug('Storage service shutdown complete');
  }

  // ----- Single-file operation delegations -----

  async uploadFile(
    ...args: Parameters<UploadOps['uploadFile']>
  ): Promise<UploadFileResponse> {
    return this.uploadOps.uploadFile(...args);
  }

  async getFileById(
    ...args: Parameters<DownloadOps['getFileById']>
  ): Promise<StorageFile | null> {
    return this.downloadOps.getFileById(...args);
  }

  async getFileContent(
    ...args: Parameters<DownloadOps['getFileContent']>
  ): Promise<Buffer | null> {
    return this.downloadOps.getFileContent(...args);
  }

  async listFiles(
    ...args: Parameters<DownloadOps['listFiles']>
  ): Promise<StorageFile[]> {
    return this.downloadOps.listFiles(...args);
  }

  async deleteFile(
    ...args: Parameters<FileMgmtOps['deleteFile']>
  ): Promise<boolean> {
    return this.fileMgmtOps.deleteFile(...args);
  }

  async updateFile(
    ...args: Parameters<FileMgmtOps['updateFile']>
  ): Promise<boolean> {
    return this.fileMgmtOps.updateFile(...args);
  }

  // ----- Batch operation delegations -----

  async batchUpload(
    ...args: Parameters<BatchOps['batchUpload']>
  ): Promise<BatchUploadResponse> {
    return this.batchOps.batchUpload(...args);
  }

  async batchDelete(
    ...args: Parameters<BatchOps['batchDelete']>
  ): Promise<BatchDeleteResponse> {
    return this.batchOps.batchDelete(...args);
  }

  // ----- Streaming operation delegations -----

  async uploadFileStream(
    ...args: Parameters<StreamingOps['uploadFileStream']>
  ): Promise<UploadFileResponse> {
    return this.streamingOps.uploadFileStream(...args);
  }

  async downloadFileStream(
    ...args: Parameters<StreamingOps['downloadFileStream']>
  ): Promise<Readable | null> {
    return this.streamingOps.downloadFileStream(...args);
  }

  /**
   * Get storage configuration
   */
  getConfig(): StorageConfig {
    return this.config;
  }

  /**
   * Update storage configuration
   */
  async updateConfig(newConfig: Partial<StorageConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.providerInit.initializeStorage();
  }
}
