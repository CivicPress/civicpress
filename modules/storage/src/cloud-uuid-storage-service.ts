import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BlobServiceClient,
  ContainerClient,
  BlockBlobClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { Storage, Bucket, File } from '@google-cloud/storage';
import type {
  StorageConfig,
  StorageFolder,
  StorageFile,
  UploadFileRequest,
  UploadFileResponse,
  FileValidationResult,
  StorageOperation,
  MulterFile,
  BatchUploadRequest,
  BatchUploadResponse,
  BatchUploadResult,
  BatchDeleteRequest,
  BatchDeleteResponse,
  BatchDeleteResult,
  BatchOperationProgress,
  StreamUploadRequest,
  StreamUploadOptions,
  StreamDownloadOptions,
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
import {
  withTimeout,
  getTimeoutForOperation,
  type TimeoutConfig,
} from './utils/timeout.js';
import { StorageMetricsCollector } from './metrics/storage-metrics-collector.js';
import { StorageUsageReporter } from './reporting/storage-usage-reporter.js';
import { QuotaManager } from './quota/quota-manager.js';
import { OrphanedFileCleaner } from './cleanup/orphaned-file-cleaner.js';
import { LifecycleManager } from './lifecycle/lifecycle-manager.js';
import { BatchOperationError } from './errors/storage-errors.js';

export class CloudUuidStorageService {
  private config: StorageConfig;
  private logger: Logger;
  private basePath: string;
  private databaseService: any; // Will be injected
  private credentialManager: CredentialManager;
  private s3Client: S3Client | null = null;
  private azureBlobServiceClient: BlobServiceClient | null = null;
  private azureContainerClient: ContainerClient | null = null;
  private gcsStorage: Storage | null = null;
  private gcsBucket: Bucket | null = null;
  private cacheAdapter: StorageMetadataCacheAdapter | null = null;
  private concurrencyLimiter: ConcurrencyLimiter | null = null;
  private retryManager: RetryManager | null = null;
  private failoverManager: StorageFailoverManager | null = null;
  private circuitBreakerManager: CircuitBreakerManager | null = null;
  private healthChecker: StorageHealthChecker | null = null;
  private timeoutConfig: TimeoutConfig = {};
  private metricsCollector: StorageMetricsCollector | null = null;
  private usageReporter: StorageUsageReporter | null = null;
  private quotaManager: QuotaManager | null = null;

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

    // Initialize health checker if enabled
    if (globalConfig?.health_checks) {
      const checkOperations = new Map<
        string,
        (provider: string) => Promise<void>
      >();

      // Add health check operations for each provider
      const allProviders = [
        config.active_provider || 'local',
        ...(config.failover_providers || []),
      ];

      allProviders.forEach((providerName) => {
        const provider = config.providers?.[providerName];
        if (provider) {
          checkOperations.set(providerName, async (p: string) => {
            // Simple health check: try to list files in a test folder
            // This is a lightweight read operation
            await this.performHealthCheck(p);
          });
        }
      });

      this.healthChecker = new StorageHealthChecker(
        config,
        checkOperations,
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
   * Perform health check for a provider
   */
  private async performHealthCheck(providerName: string): Promise<void> {
    const provider = this.config.providers?.[providerName];
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found`);
    }

    // Perform a lightweight operation to check provider health
    // For local: check if storage path exists
    // For S3: try to list objects (with limit 1)
    // For Azure: try to list blobs (with limit 1)

    switch (provider.type) {
      case 'local':
        // Check if storage path exists
        const localPath = this.getLocalStoragePath();
        const exists = await fs.pathExists(localPath);
        if (!exists) {
          throw new Error(`Local storage path does not exist: ${localPath}`);
        }
        break;
      case 's3':
        if (!this.s3Client) {
          await this.initializeS3Storage(provider);
        }
        // Try to list objects (limit 1)
        const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
        const listCommand = new ListObjectsV2Command({
          Bucket: provider.bucket,
          MaxKeys: 1,
        });
        await this.s3Client!.send(listCommand);
        break;
      case 'azure':
        if (!this.azureContainerClient) {
          await this.initializeAzureStorage(provider);
        }
        // Try to list blobs (limit 1)
        const blobs = this.azureContainerClient!.listBlobsFlat();
        await blobs.next(); // Just check if we can access the container
        break;
      case 'gcs':
        if (!this.gcsBucket) {
          await this.initializeGCSStorage(provider);
        }
        // Try to list files (limit 1)
        const [files] = await this.gcsBucket!.getFiles({ maxResults: 1 });
        // Just check if we can access the bucket
        break;
      default:
        throw new Error(
          `Unsupported provider type for health check: ${provider.type}`
        );
    }
  }

  /**
   * Set database service for file tracking
   */
  setDatabaseService(databaseService: any): void {
    this.databaseService = databaseService;

    // Initialize usage reporter when database service is set
    if (this.cacheAdapter) {
      const cacheManager = (this.cacheAdapter as any).cache?.manager || null;
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
      const quotaConfig: any = {
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
            limit: this.parseSizeString(folderConfig.quota),
            limitFormatted: folderConfig.quota,
          };
        }
      }

      // Add global quota if configured
      if (globalConfig?.global_quota) {
        quotaConfig.global = {
          limit: this.parseSizeString(globalConfig.global_quota),
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
        this.logger
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
  getLifecycleManager(policies?: any[]): LifecycleManager | null {
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
    await this.initializeStorage();
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

  /**
   * Initialize storage based on active provider
   */
  private async initializeStorage(): Promise<void> {
    try {
      const activeProvider = this.config.active_provider || 'local';
      const provider = this.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(
          `Active provider '${activeProvider}' not found in configuration`
        );
      }

      this.logger.info(`Initializing storage with provider: ${activeProvider}`);

      switch (provider.type) {
        case 'local':
          await this.initializeLocalStorage(provider);
          break;
        case 's3':
          await this.initializeS3Storage(provider);
          break;
        case 'azure':
          await this.initializeAzureStorage(provider);
          break;
        case 'gcs':
          await this.initializeGCSStorage(provider);
          break;
        default:
          throw new Error(`Unsupported storage provider: ${provider.type}`);
      }
    } catch (error) {
      this.logger.error('Failed to initialize storage:', error);
      throw new Error(`Storage initialization failed: ${error}`);
    }
  }

  /**
   * Initialize local storage
   */
  private async initializeLocalStorage(provider: any): Promise<void> {
    // Use the same path resolution logic as getLocalStoragePath()
    const storagePath = provider.path || 'storage';
    const resolvedPath = path.isAbsolute(storagePath)
      ? storagePath
      : path.resolve(this.basePath, storagePath);
    await fs.ensureDir(resolvedPath);

    // Create configured folders
    for (const [folderName, folderConfig] of Object.entries(
      this.config.folders
    )) {
      const folderPath = path.join(resolvedPath, folderConfig.path);
      await fs.ensureDir(folderPath);
      this.logger.info(
        `Initialized local folder: ${folderName} -> ${folderPath}`
      );
    }
  }

  /**
   * Initialize S3 storage
   */
  private async initializeS3Storage(provider: any): Promise<void> {
    const credentials = await this.credentialManager.getCredentials('s3');

    if (!credentials) {
      throw new Error('S3 credentials not found');
    }

    this.s3Client = new S3Client({
      region: provider.region,
      credentials: {
        accessKeyId: (credentials as any).accessKeyId,
        secretAccessKey: (credentials as any).secretAccessKey,
        ...((credentials as any).sessionToken && {
          sessionToken: (credentials as any).sessionToken,
        }),
      },
      ...(provider.endpoint && { endpoint: provider.endpoint }),
      forcePathStyle: provider.options?.force_path_style || false,
    });

    this.logger.info(
      `Initialized S3 storage: region=${provider.region}, bucket=${provider.bucket}`
    );
  }

  /**
   * Initialize Azure Blob Storage
   */
  private async initializeAzureStorage(provider: any): Promise<void> {
    const credentials = await this.credentialManager.getCredentials('azure');

    if (!credentials) {
      throw new Error('Azure credentials not found');
    }

    // Initialize Azure Blob Service Client
    if ((credentials as any).connectionString) {
      // Use connection string if available
      this.azureBlobServiceClient = BlobServiceClient.fromConnectionString(
        (credentials as any).connectionString
      );
    } else if ((credentials as any).accountKey && provider.account_name) {
      // Use account name and key
      const accountUrl = `https://${provider.account_name}.blob.core.windows.net`;
      const sharedKeyCredential = new StorageSharedKeyCredential(
        provider.account_name,
        (credentials as any).accountKey
      );
      this.azureBlobServiceClient = new BlobServiceClient(
        accountUrl,
        sharedKeyCredential
      );
    } else {
      throw new Error(
        'Azure credentials incomplete - need either connectionString or accountName + accountKey'
      );
    }

    // Get container client
    this.azureContainerClient = this.azureBlobServiceClient.getContainerClient(
      provider.container_name
    );

    // Ensure container exists
    try {
      await this.azureContainerClient.createIfNotExists({
        access: 'blob', // Default to blob-level access
      });
    } catch (error) {
      this.logger.warn(
        'Container might already exist or access denied:',
        error
      );
    }

    this.logger.info(
      `Initialized Azure storage: account=${provider.account_name}, container=${provider.container_name}`
    );
  }

  /**
   * Initialize Google Cloud Storage
   */
  private async initializeGCSStorage(provider: any): Promise<void> {
    const credentials = await this.credentialManager.getCredentials('gcs');

    if (!credentials) {
      throw new Error('GCS credentials not found');
    }

    const gcsCredentials = credentials as any;

    // Initialize GCS Storage client
    const storageOptions: any = {
      projectId: gcsCredentials.projectId || provider.project_id,
    };

    // Use service account key file if provided
    if (gcsCredentials.keyFilename) {
      // Resolve path if relative
      const keyPath = gcsCredentials.keyFilename.startsWith('/')
        ? gcsCredentials.keyFilename
        : path.resolve(process.cwd(), gcsCredentials.keyFilename);

      // Verify file exists
      if (!(await fs.pathExists(keyPath))) {
        throw new Error(`GCS service account key file not found: ${keyPath}`);
      }

      storageOptions.keyFilename = keyPath;
      this.logger.debug(`Using GCS service account key: ${keyPath}`);
    } else if (gcsCredentials.credentials) {
      // Use credentials object if provided
      storageOptions.credentials = gcsCredentials.credentials;
    }
    // Otherwise, use Application Default Credentials (ADC)

    this.gcsStorage = new Storage(storageOptions);

    // Get bucket
    const bucketName = provider.bucket;
    if (!bucketName) {
      throw new Error('GCS bucket name is required');
    }

    this.gcsBucket = this.gcsStorage.bucket(bucketName);

    // Ensure bucket exists (or verify access if create_bucket is false)
    try {
      const [exists] = await this.gcsBucket.exists();
      if (!exists) {
        // Create bucket if it doesn't exist (optional, based on config)
        if (provider.options?.create_bucket !== false) {
          await this.gcsBucket.create({
            location: provider.options?.location || 'US',
            storageClass: provider.options?.storage_class || 'STANDARD',
          });
          this.logger.info(`Created GCS bucket: ${bucketName}`);
        } else {
          throw new Error(`GCS bucket '${bucketName}' does not exist`);
        }
      } else {
        this.logger.info(`GCS bucket '${bucketName}' exists and is accessible`);
      }
    } catch (error) {
      // If create_bucket is false and we can't check existence, try a lightweight operation instead
      // This handles cases where the service account has object permissions but not bucket permissions
      if (provider.options?.create_bucket === false) {
        this.logger.warn(
          `Could not verify GCS bucket '${bucketName}' existence (may lack storage.buckets.get permission). Will attempt to use bucket directly.`,
          error instanceof Error ? error.message : String(error)
        );
        // Don't throw - assume bucket exists and try to use it
        // The first actual operation will fail if bucket doesn't exist or is inaccessible
      } else {
        this.logger.error(
          `Failed to check/create GCS bucket '${bucketName}':`,
          error
        );
        throw error;
      }
    }

    this.logger.info(
      `Initialized GCS storage: project=${storageOptions.projectId}, bucket=${bucketName}`
    );
  }

  /**
   * Upload a file with UUID tracking
   */
  async uploadFile(request: UploadFileRequest): Promise<UploadFileResponse> {
    // Apply concurrency limiting if configured
    if (this.concurrencyLimiter) {
      return this.concurrencyLimiter.limitUpload(() =>
        this._uploadFile(request)
      );
    }
    return this._uploadFile(request);
  }

  /**
   * Internal upload implementation (called with or without concurrency limiting)
   */
  private async _uploadFile(
    request: UploadFileRequest
  ): Promise<UploadFileResponse> {
    const startTime = Date.now();
    let provider: string | undefined;
    let success = false;
    let error: string | undefined;
    let fileData: MulterFile | undefined;

    try {
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }

      const folder = this.config.folders[request.folder];
      if (!folder) {
        return {
          success: false,
          error: `Storage folder '${request.folder}' not found`,
        };
      }

      // Extract file data
      if (Buffer.isBuffer(request.file)) {
        throw new Error('Buffer uploads not yet supported - use MulterFile');
      }
      fileData = request.file as MulterFile;

      // Validate file
      const validation = this.validateFile(fileData, folder);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', '),
        };
      }

      // Generate UUID and filename
      const fileId = uuidv4();
      const storedFilename = this.generateStoredFilename(fileData, fileId);
      const relativePath = `${request.folder}/${storedFilename}`;

      // Upload with failover support
      const uploadOperation = async (providerName: string): Promise<string> => {
        const provider = this.config.providers?.[providerName];
        if (!provider) {
          throw new Error(`Provider '${providerName}' not found`);
        }

        const executeUpload = async () => {
          switch (provider.type) {
            case 'local':
              return await this.uploadToLocal(fileData!, relativePath);
            case 's3':
              return await this.uploadToS3(fileData!, relativePath, provider);
            case 'azure':
              return await this.uploadToAzure(
                fileData!,
                relativePath,
                provider
              );
            case 'gcs':
              return await this.uploadToGCS(fileData!, relativePath, provider);
            default:
              throw new Error(`Unsupported provider type: ${provider.type}`);
          }
        };

        // Apply timeout
        const timeout = getTimeoutForOperation('upload', this.timeoutConfig);
        const executeWithTimeout = () =>
          withTimeout(executeUpload, timeout, 'upload');

        // Apply circuit breaker if configured
        if (this.circuitBreakerManager) {
          const breaker = this.circuitBreakerManager.getBreaker(providerName);
          return breaker.execute(executeWithTimeout);
        }

        return executeWithTimeout();
      };

      let providerPath: string;
      if (this.failoverManager) {
        providerPath = await this.failoverManager.executeWithFailover(
          uploadOperation,
          'upload'
        );
      } else {
        // No failover - use active provider
        const activeProvider = this.config.active_provider || 'local';
        providerPath = await uploadOperation(activeProvider);
      }

      // Create storage file record
      const storageFile: StorageFile = {
        id: fileId,
        original_name: fileData.originalname,
        stored_filename: storedFilename,
        folder: request.folder,
        relative_path: relativePath,
        provider_path: providerPath,
        size: fileData.size,
        mime_type:
          fileData.mimetype ||
          mime.lookup(fileData.originalname) ||
          'application/octet-stream',
        description: request.description,
        uploaded_by: request.uploaded_by,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Save to database
      await this.databaseService.createStorageFile(storageFile);

      // Invalidate cache for folder
      if (this.cacheAdapter) {
        await this.cacheAdapter.invalidateFolder(request.folder);
      }

      // Extract provider name for metrics
      const activeProvider = this.config.active_provider || 'local';
      provider = activeProvider;
      success = true;

      // Log operation
      this.logOperation({
        operation: 'upload',
        path: providerPath,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: true,
        metadata: {
          folder: request.folder,
          size: fileData.size,
          file_id: fileId,
          provider: provider,
        },
      });

      const result = {
        success: true,
        file: storageFile,
      };

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        this.metricsCollector.recordUpload(
          true,
          fileData.size,
          latency,
          provider
        );
      }

      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('File upload failed:', err);

      // Extract provider name for metrics
      const activeProvider = this.config.active_provider || 'local';
      provider = activeProvider;

      this.logOperation({
        operation: 'upload',
        path: request.folder,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: false,
        error,
      });

      const result = {
        success: false,
        error,
      };

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        const errorCode =
          err instanceof Error && (err as any).code
            ? (err as any).code
            : 'UNKNOWN_ERROR';
        const fileSize = (fileData as MulterFile | undefined)?.size || 0;
        this.metricsCollector.recordUpload(
          false,
          fileSize,
          latency,
          provider || this.config.active_provider || 'local',
          errorCode
        );
      }

      return result;
    }
  }

  /**
   * Upload file to local storage
   */
  private async uploadToLocal(
    fileData: MulterFile,
    relativePath: string
  ): Promise<string> {
    const fullPath = path.join(this.getLocalStoragePath(), relativePath);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(fullPath));

    // Write file
    await fs.writeFile(fullPath, fileData.buffer);

    return fullPath;
  }

  /**
   * Upload file to S3
   */
  private async uploadToS3(
    fileData: MulterFile,
    relativePath: string,
    provider: any
  ): Promise<string> {
    // Ensure client is initialized (reuse existing or recreate on error)
    if (!this.s3Client) {
      await this.initializeS3Storage(provider);
    }

    const key = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const uploadOperation = async () => {
      const command = new PutObjectCommand({
        Bucket: provider.bucket,
        Key: key,
        Body: fileData.buffer,
        ContentType: fileData.mimetype,
        Metadata: {
          originalName: fileData.originalname,
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.s3Client!.send(command);
      return `s3://${provider.bucket}/${key}`;
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(uploadOperation);
    }

    return uploadOperation();
  }

  /**
   * Upload file to Azure Blob Storage
   */
  private async uploadToAzure(
    fileData: MulterFile,
    relativePath: string,
    provider: any
  ): Promise<string> {
    if (!this.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    const blobName = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const uploadOperation = async () => {
      // Get block blob client
      const blockBlobClient =
        this.azureContainerClient!.getBlockBlobClient(blobName);

      // Upload the file
      await blockBlobClient.uploadData(fileData.buffer, {
        blobHTTPHeaders: {
          blobContentType: fileData.mimetype,
        },
        metadata: {
          originalName: fileData.originalname,
          uploadedAt: new Date().toISOString(),
        },
        tier: provider.options?.access_tier || 'Hot',
      });

      return `azure://${provider.account_name}/${provider.container_name}/${blobName}`;
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(uploadOperation);
    }

    return uploadOperation();
  }

  /**
   * Upload file to Google Cloud Storage
   */
  private async uploadToGCS(
    fileData: MulterFile,
    relativePath: string,
    provider: any
  ): Promise<string> {
    if (!this.gcsBucket) {
      throw new Error('GCS bucket not initialized');
    }

    const fileName = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const uploadOperation = async () => {
      const file = this.gcsBucket!.file(fileName);

      // Upload the file
      await file.save(fileData.buffer, {
        metadata: {
          contentType: fileData.mimetype,
          metadata: {
            originalName: fileData.originalname,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      return `gs://${provider.bucket}/${fileName}`;
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(uploadOperation);
    }

    return uploadOperation();
  }

  /**
   * Get file by UUID
   */
  async getFileById(id: string): Promise<StorageFile | null> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }

      const fileRecord = await this.databaseService.getStorageFileById(id);
      if (!fileRecord) {
        return null;
      }

      return this.dbRecordToStorageFile(fileRecord);
    } catch (error) {
      this.logger.error('Failed to get file by ID:', error);
      return null;
    }
  }

  /**
   * Get file content by UUID
   */
  async getFileContent(id: string): Promise<Buffer | null> {
    const startTime = Date.now();
    let error: string | undefined;
    let success = false;
    let provider: string = this.config.active_provider || 'local';

    try {
      const file = await this.getFileById(id);
      if (!file) {
        return null;
      }

      // Download with failover support
      const downloadOperation = async (
        providerName: string
      ): Promise<Buffer | null> => {
        const provider = this.config.providers?.[providerName];
        if (!provider) {
          throw new Error(`Provider '${providerName}' not found`);
        }

        const executeDownload = async () => {
          switch (provider.type) {
            case 'local':
              return await this.getFileContentFromLocal(file);
            case 's3':
              return await this.getFileContentFromS3(file, provider);
            case 'azure':
              return await this.getFileContentFromAzure(file, provider);
            case 'gcs':
              return await this.getFileContentFromGCS(file, provider);
            default:
              throw new Error(`Unsupported provider type: ${provider.type}`);
          }
        };

        // Apply timeout
        const timeout = getTimeoutForOperation('download', this.timeoutConfig);
        const executeWithTimeout = () =>
          withTimeout(executeDownload, timeout, 'download');

        // Apply circuit breaker if configured
        if (this.circuitBreakerManager) {
          const breaker = this.circuitBreakerManager.getBreaker(providerName);
          return breaker.execute(executeWithTimeout);
        }

        return executeWithTimeout();
      };

      let result: Buffer | null;
      if (this.failoverManager) {
        result = await this.failoverManager.executeWithFailover(
          downloadOperation,
          'download'
        );
      } else {
        // No failover - use active provider
        const activeProvider = this.config.active_provider || 'local';
        provider = activeProvider;
        result = await downloadOperation(activeProvider);
      }

      success = result !== null;
      const fileSize = result?.length || 0;

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        this.metricsCollector.recordDownload(
          success,
          fileSize,
          latency,
          provider
        );
      }

      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('Failed to get file content:', err);

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        const errorCode =
          err instanceof Error && (err as any).code
            ? (err as any).code
            : 'UNKNOWN_ERROR';
        this.metricsCollector.recordDownload(
          false,
          0,
          latency,
          provider,
          errorCode
        );
      }

      return null;
    }
  }

  /**
   * Get file content from local storage
   */
  private async getFileContentFromLocal(
    file: StorageFile
  ): Promise<Buffer | null> {
    if (!(await fs.pathExists(file.provider_path))) {
      this.logger.error(`File not found on disk: ${file.provider_path}`);
      return null;
    }

    return await fs.readFile(file.provider_path);
  }

  /**
   * Get file content from S3
   */
  private async getFileContentFromS3(
    file: StorageFile,
    provider: any
  ): Promise<Buffer | null> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from provider_path (s3://bucket/key)
    const key = file.provider_path.replace(`s3://${provider.bucket}/`, '');

    const downloadOperation = async () => {
      const command = new GetObjectCommand({
        Bucket: provider.bucket,
        Key: key,
      });

      const response = await this.s3Client!.send(command);

      if (!response.Body) {
        return null;
      }

      // Convert stream to buffer (AWS SDK v3)
      const chunks: Uint8Array[] = [];

      if (response.Body) {
        // Use the streamToUint8Array helper or handle the readable stream
        const stream = response.Body as any;

        if (typeof stream.transformToByteArray === 'function') {
          // Use AWS SDK's built-in method if available
          const byteArray = await stream.transformToByteArray();
          return Buffer.from(byteArray);
        } else {
          // Handle as a readable stream
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          return Buffer.concat(chunks);
        }
      }

      return Buffer.alloc(0);
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(downloadOperation);
    }

    return downloadOperation();
  }

  /**
   * Get file content from Azure Blob Storage
   */
  private async getFileContentFromAzure(
    file: StorageFile,
    provider: any
  ): Promise<Buffer | null> {
    if (!this.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    // Extract blob name from provider_path (azure://account/container/blobname)
    const blobName = file.provider_path.replace(
      `azure://${provider.account_name}/${provider.container_name}/`,
      ''
    );

    const downloadOperation = async () => {
      const blockBlobClient =
        this.azureContainerClient!.getBlockBlobClient(blobName);

      const downloadResponse = await blockBlobClient.download();

      if (!downloadResponse.readableStreamBody) {
        return null;
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];

      for await (const chunk of downloadResponse.readableStreamBody) {
        if (chunk instanceof Buffer) {
          chunks.push(chunk);
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk));
        } else {
          chunks.push(Buffer.from(chunk as Uint8Array));
        }
      }

      return Buffer.concat(chunks);
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(downloadOperation);
    }

    try {
      return await downloadOperation();
    } catch (error) {
      this.logger.error('Failed to download from Azure:', error);
      return null;
    }
  }

  /**
   * Get file content from Google Cloud Storage
   */
  private async getFileContentFromGCS(
    file: StorageFile,
    provider: any
  ): Promise<Buffer | null> {
    if (!this.gcsBucket) {
      throw new Error('GCS bucket not initialized');
    }

    // Extract file name from provider_path (gs://bucket/filename)
    const fileName = file.provider_path.replace(`gs://${provider.bucket}/`, '');

    const downloadOperation = async () => {
      const gcsFile = this.gcsBucket!.file(fileName);

      // Check if file exists
      const [exists] = await gcsFile.exists();
      if (!exists) {
        return null;
      }

      // Download file content
      const [buffer] = await gcsFile.download();
      return Buffer.from(buffer);
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(downloadOperation);
    }

    try {
      return await downloadOperation();
    } catch (error) {
      this.logger.error('Failed to download from GCS:', error);
      return null;
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folderName: string): Promise<StorageFile[]> {
    const startTime = Date.now();
    let provider: string | undefined;
    let success = false;
    let error: string | undefined;

    try {
      const listOperation = async () => {
        // Check cache first (if enabled)
        if (this.cacheAdapter) {
          const cached = await this.cacheAdapter.getCachedFiles(folderName);
          if (cached !== null) {
            return cached;
          }
        }

        // Cache miss or no cache - query database
        if (!this.databaseService) {
          throw new Error('Database service not initialized');
        }

        const fileRecords =
          await this.databaseService.getStorageFilesByFolder(folderName);
        const files = fileRecords.map((record: any) =>
          this.dbRecordToStorageFile(record)
        );

        // Cache the result (if cache enabled)
        if (this.cacheAdapter) {
          await this.cacheAdapter.setCachedFiles(folderName, files);
        }

        return files;
      };

      // Apply timeout
      const timeout = getTimeoutForOperation('list', this.timeoutConfig);
      const result = await withTimeout(listOperation, timeout, 'list');

      success = true;
      const activeProvider = this.config.active_provider || 'local';
      provider = activeProvider;

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        this.metricsCollector.recordList(success, latency, provider);
      }

      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('Failed to list files:', err);

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        const activeProvider = this.config.active_provider || 'local';
        provider = activeProvider;
        const errorCode =
          err instanceof Error && (err as any).code
            ? (err as any).code
            : 'UNKNOWN_ERROR';
        this.metricsCollector.recordList(false, latency, provider, errorCode);
      }

      return [];
    }
  }

  /**
   * Delete file by UUID
   */
  async deleteFile(id: string, userId?: string): Promise<boolean> {
    // Apply concurrency limiting if configured
    if (this.concurrencyLimiter) {
      return this.concurrencyLimiter.limitDelete(() =>
        this._deleteFile(id, userId)
      );
    }
    return this._deleteFile(id, userId);
  }

  /**
   * Internal delete file implementation
   */
  private async _deleteFile(id: string, userId?: string): Promise<boolean> {
    const startTime = Date.now();
    let provider: string | undefined;
    let success = false;
    let error: string | undefined;

    try {
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }

      const file = await this.getFileById(id);
      if (!file) {
        return false;
      }

      // Delete with failover support
      const deleteOperation = async (providerName: string): Promise<void> => {
        const provider = this.config.providers?.[providerName];
        if (!provider) {
          throw new Error(`Provider '${providerName}' not found`);
        }

        const executeDelete = async () => {
          switch (provider.type) {
            case 'local':
              await this.deleteFromLocal(file);
              break;
            case 's3':
              await this.deleteFromS3(file, provider);
              break;
            case 'azure':
              await this.deleteFromAzure(file, provider);
              break;
            case 'gcs':
              await this.deleteFromGCS(file, provider);
              break;
            default:
              throw new Error(`Unsupported provider type: ${provider.type}`);
          }
        };

        // Apply timeout
        const timeout = getTimeoutForOperation('delete', this.timeoutConfig);
        const executeWithTimeout = () =>
          withTimeout(executeDelete, timeout, 'delete');

        // Apply circuit breaker if configured
        if (this.circuitBreakerManager) {
          const breaker = this.circuitBreakerManager.getBreaker(providerName);
          return breaker.execute(executeWithTimeout);
        }

        return executeWithTimeout();
      };

      if (this.failoverManager) {
        await this.failoverManager.executeWithFailover(
          deleteOperation,
          'delete'
        );
      } else {
        // No failover - use active provider
        const activeProvider = this.config.active_provider || 'local';
        await deleteOperation(activeProvider);
      }

      // Delete from database
      const deleted = await this.databaseService.deleteStorageFile(id);

      // Invalidate cache for folder
      if (this.cacheAdapter && deleted) {
        await this.cacheAdapter.invalidateFolder(file.folder);
      }

      // Extract provider name for metrics
      const activeProvider = this.config.active_provider || 'local';
      provider = activeProvider;
      success = deleted;

      this.logOperation({
        operation: 'delete',
        path: file.provider_path,
        user_id: userId,
        timestamp: new Date(),
        success: deleted,
        metadata: { file_id: id, provider },
      });

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        this.metricsCollector.recordDelete(success, latency, provider);
      }

      return deleted;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('Failed to delete file:', err);

      // Extract provider name for metrics
      const activeProvider = this.config.active_provider || 'local';
      provider = activeProvider;

      this.logOperation({
        operation: 'delete',
        path: `file:${id}`,
        user_id: userId,
        timestamp: new Date(),
        success: false,
        error,
      });

      // Record metrics
      if (this.metricsCollector) {
        const latency = Date.now() - startTime;
        const errorCode =
          err instanceof Error && (err as any).code
            ? (err as any).code
            : 'UNKNOWN_ERROR';
        this.metricsCollector.recordDelete(false, latency, provider, errorCode);
      }

      return false;
    }
  }

  /**
   * Delete file from local storage
   */
  private async deleteFromLocal(file: StorageFile): Promise<void> {
    if (await fs.pathExists(file.provider_path)) {
      await fs.remove(file.provider_path);
    }
  }

  /**
   * Delete file from S3
   */
  private async deleteFromS3(file: StorageFile, provider: any): Promise<void> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from provider_path (s3://bucket/key)
    const key = file.provider_path.replace(`s3://${provider.bucket}/`, '');

    const deleteOperation = async () => {
      const command = new DeleteObjectCommand({
        Bucket: provider.bucket,
        Key: key,
      });

      await this.s3Client!.send(command);
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(deleteOperation);
    }

    return deleteOperation();
  }

  /**
   * Delete file from Azure Blob Storage
   */
  private async deleteFromAzure(
    file: StorageFile,
    provider: any
  ): Promise<void> {
    if (!this.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    // Extract blob name from provider_path (azure://account/container/blobname)
    const blobName = file.provider_path.replace(
      `azure://${provider.account_name}/${provider.container_name}/`,
      ''
    );

    const deleteOperation = async () => {
      const blockBlobClient =
        this.azureContainerClient!.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(deleteOperation);
    }

    return deleteOperation();
  }

  /**
   * Delete file from Google Cloud Storage
   */
  private async deleteFromGCS(file: StorageFile, provider: any): Promise<void> {
    if (!this.gcsBucket) {
      throw new Error('GCS bucket not initialized');
    }

    // Extract file name from provider_path (gs://bucket/filename)
    const fileName = file.provider_path.replace(`gs://${provider.bucket}/`, '');

    const deleteOperation = async () => {
      const gcsFile = this.gcsBucket!.file(fileName);
      await gcsFile.delete();
    };

    // Apply retry logic if retry manager is configured
    if (this.retryManager) {
      return this.retryManager.withRetry(deleteOperation);
    }

    return deleteOperation();
  }

  /**
   * Update file metadata
   */
  async updateFile(
    id: string,
    updates: {
      description?: string;
      updated_by?: string;
    }
  ): Promise<boolean> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }

      return await this.databaseService.updateStorageFile(id, updates);
    } catch (error) {
      this.logger.error('Failed to update file:', error);
      return false;
    }
  }

  /**
   * Generate stored filename with UUID
   */
  private generateStoredFilename(file: MulterFile, uuid: string): string {
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension);

    // Keep original filename readable: "document.550e8400-....pdf"
    return `${baseName}.${uuid}${extension}`;
  }

  /**
   * Validate file against folder configuration
   */
  private validateFile(
    file: MulterFile,
    folder: StorageFolder
  ): FileValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file type
    const fileExtension = path
      .extname(file.originalname)
      .toLowerCase()
      .slice(1);
    if (!folder.allowed_types.includes(fileExtension)) {
      errors.push(
        `File type '${fileExtension}' not allowed in folder '${folder.path}'`
      );
    }

    // Check file size
    const maxSizeBytes = this.parseSizeString(folder.max_size);
    if (file.size > maxSizeBytes) {
      errors.push(
        `File size ${this.formatBytes(file.size)} exceeds limit ${folder.max_size}`
      );
    }

    // Check for suspicious file types
    if (['exe', 'bat', 'cmd', 'sh', 'ps1'].includes(fileExtension)) {
      warnings.push(`Executable file type '${fileExtension}' detected`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Parse size string (e.g., "10MB" -> bytes)
   */
  private parseSizeString(sizeStr: string): number {
    const units: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
    if (!match) {
      return 1024 * 1024; // Default to 1MB
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return value * (units[unit] || 1);
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Batch upload files
   */
  async batchUpload(
    request: BatchUploadRequest,
    options?: {
      maxConcurrency?: number;
      onProgress?: (progress: BatchOperationProgress) => void;
    }
  ): Promise<BatchUploadResponse> {
    const maxConcurrency = options?.maxConcurrency || 5;
    const results: BatchUploadResult[] = [];
    const affectedFolders = new Set<string>();

    try {
      // Validate batch request
      const validation = this.validateBatchUpload(request);
      if (!validation.valid) {
        // If validation fails completely, return all as failed
        return {
          successful: [],
          failed: request.files.map((file) => ({
            file: {} as StorageFile,
            success: false,
            error: validation.errors.join(', '),
          })),
          total: request.files.length,
          successfulCount: 0,
          failedCount: request.files.length,
        };
      }

      // Process files with concurrency control
      let completed = 0;
      const processFile = async (
        file: MulterFile
      ): Promise<BatchUploadResult> => {
        try {
          const uploadRequest: UploadFileRequest = {
            file,
            folder: request.folder,
            uploaded_by: request.uploaded_by,
          };

          const result = await this.uploadFile(uploadRequest);

          // Report progress
          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.files.length,
              current: file.originalname,
              percentage: Math.round((completed / request.files.length) * 100),
            });
          }

          if (result.success && result.file) {
            affectedFolders.add(request.folder);
            return {
              file: result.file,
              success: true,
            };
          } else {
            const errorCode = this.extractErrorCode(
              result.error || 'Upload failed'
            );
            return {
              file: {} as StorageFile,
              success: false,
              error: result.error || 'Upload failed',
              errorCode,
            };
          }
        } catch (error) {
          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.files.length,
              current: file.originalname,
              percentage: Math.round((completed / request.files.length) * 100),
            });
          }

          const errorCode = this.extractErrorCode(error);
          return {
            file: {} as StorageFile,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode,
          };
        }
      };

      // Process files in batches with concurrency limit
      for (let i = 0; i < request.files.length; i += maxConcurrency) {
        const batch = request.files.slice(i, i + maxConcurrency);
        const batchResults = await Promise.all(batch.map(processFile));
        results.push(...batchResults);
      }

      // Separate successful and failed
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Generate error summary
      const errorSummary =
        failed.length > 0
          ? this.generateErrorSummary(
              failed.map((f) => ({
                error: f.error || 'Unknown error',
                errorCode: f.errorCode,
              }))
            )
          : undefined;

      // Invalidate cache for affected folders
      if (this.cacheAdapter && affectedFolders.size > 0) {
        for (const folder of affectedFolders) {
          await this.cacheAdapter.invalidateFolder(folder);
        }
      }

      const response = {
        successful,
        failed,
        total: request.files.length,
        successfulCount: successful.length,
        failedCount: failed.length,
        errorSummary,
      };

      // If all failed, throw BatchOperationError
      if (successful.length === 0 && failed.length > 0) {
        throw new BatchOperationError(
          'All files failed to upload',
          {
            operation: 'upload',
            total: request.files.length,
            successful: 0,
            failed: failed.length,
            errors: failed.map((f) => ({
              item:
                f.file?.original_name || f.file?.stored_filename || 'unknown',
              error: f.error || 'Unknown error',
              errorCode: f.errorCode,
            })),
          },
          { folder: request.folder }
        );
      }

      return response;
    } catch (error) {
      this.logger.error('Batch upload failed:', error);
      // Return partial results if any were successful
      return {
        successful: results.filter((r) => r.success),
        failed: results.filter((r) => !r.success),
        total: request.files.length,
        successfulCount: results.filter((r) => r.success).length,
        failedCount: results.filter((r) => !r.success).length,
      };
    }
  }

  /**
   * Batch delete files
   */
  async batchDelete(
    request: BatchDeleteRequest,
    options?: {
      maxConcurrency?: number;
      onProgress?: (progress: BatchOperationProgress) => void;
    }
  ): Promise<BatchDeleteResponse> {
    const maxConcurrency = options?.maxConcurrency || 10;
    const results: BatchDeleteResult[] = [];
    const affectedFolders = new Set<string>();

    try {
      // Validate batch request
      if (!request.fileIds || request.fileIds.length === 0) {
        return {
          successful: [],
          failed: [],
          total: 0,
          successfulCount: 0,
          failedCount: 0,
        };
      }

      let completed = 0;
      const processDelete = async (
        fileId: string
      ): Promise<BatchDeleteResult> => {
        try {
          // Get file first to track affected folders
          const file = await this.getFileById(fileId);
          if (file) {
            affectedFolders.add(file.folder);
          }

          const success = await this.deleteFile(fileId, request.userId);

          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.fileIds.length,
              current: file?.original_name,
              percentage: Math.round(
                (completed / request.fileIds.length) * 100
              ),
            });
          }

          if (success) {
            return {
              fileId,
              success: true,
            };
          } else {
            return {
              fileId,
              success: false,
              error: file ? 'Delete failed' : 'File not found',
              errorCode: file
                ? 'STORAGE_DELETE_FAILED'
                : 'STORAGE_FILE_NOT_FOUND',
            };
          }
        } catch (error) {
          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.fileIds.length,
              percentage: Math.round(
                (completed / request.fileIds.length) * 100
              ),
            });
          }

          const errorCode = this.extractErrorCode(error);
          return {
            fileId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode,
          };
        }
      };

      // Process deletes in batches with concurrency limit
      for (let i = 0; i < request.fileIds.length; i += maxConcurrency) {
        const batch = request.fileIds.slice(i, i + maxConcurrency);
        const batchResults = await Promise.all(batch.map(processDelete));
        results.push(...batchResults);
      }

      // Separate successful and failed
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Generate error summary
      const errorSummary =
        failed.length > 0
          ? this.generateErrorSummary(
              failed.map((f) => ({
                error: f.error || 'Unknown error',
                errorCode: f.errorCode,
              }))
            )
          : undefined;

      // Invalidate cache for affected folders
      if (this.cacheAdapter && affectedFolders.size > 0) {
        for (const folder of affectedFolders) {
          await this.cacheAdapter.invalidateFolder(folder);
        }
      }

      const response = {
        successful,
        failed,
        total: request.fileIds.length,
        successfulCount: successful.length,
        failedCount: failed.length,
        errorSummary,
      };

      // If all failed, throw BatchOperationError
      if (successful.length === 0 && failed.length > 0) {
        throw new BatchOperationError('All files failed to delete', {
          operation: 'delete',
          total: request.fileIds.length,
          successful: 0,
          failed: failed.length,
          errors: failed.map((f) => ({
            item: f.fileId,
            error: f.error || 'Unknown error',
            errorCode: f.errorCode,
          })),
        });
      }

      return response;
    } catch (error) {
      this.logger.error('Batch delete failed:', error);
      // Return partial results if any were successful
      return {
        successful: results.filter((r) => r.success),
        failed: results.filter((r) => !r.success),
        total: request.fileIds.length,
        successfulCount: results.filter((r) => r.success).length,
        failedCount: results.filter((r) => !r.success).length,
      };
    }
  }

  /**
   * Validate batch upload request
   */
  private validateBatchUpload(request: BatchUploadRequest): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check folder exists
    const folder = this.config.folders[request.folder];
    if (!folder) {
      errors.push(`Folder '${request.folder}' not found`);
      return { valid: false, errors };
    }

    // Get batch limits from config
    const globalConfig = this.config.global || {};
    const maxFilesPerBatch = 50; // Default, will be configurable
    const maxBatchSizeBytes = 524288000; // 500MB default

    // Validate file count
    if (request.files.length > maxFilesPerBatch) {
      errors.push(
        `Batch size exceeds maximum: ${request.files.length} > ${maxFilesPerBatch} files`
      );
    }

    // Validate total batch size
    const totalSize = request.files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > maxBatchSizeBytes) {
      errors.push(
        `Total batch size exceeds maximum: ${this.formatBytes(totalSize)} > ${this.formatBytes(maxBatchSizeBytes)}`
      );
    }

    // Validate each file
    for (const file of request.files) {
      const validation = this.validateFile(file, folder);
      if (!validation.valid) {
        errors.push(`${file.originalname}: ${validation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get local storage base path
   */
  private getLocalStoragePath(): string {
    const localProvider = this.config.providers?.local;
    if (localProvider) {
      const storagePath = localProvider.path || 'storage';
      // If path is absolute, use it directly; otherwise resolve relative to basePath
      return path.isAbsolute(storagePath)
        ? storagePath
        : path.resolve(this.basePath, storagePath);
    }
    return path.resolve(this.basePath, 'storage');
  }

  /**
   * Convert database record to StorageFile
   */
  private dbRecordToStorageFile(record: any): StorageFile {
    return {
      id: record.id,
      original_name: record.original_name,
      stored_filename: record.stored_filename,
      folder: record.folder,
      relative_path: record.relative_path,
      provider_path: record.provider_path,
      size: record.size,
      mime_type: record.mime_type,
      description: record.description,
      uploaded_by: record.uploaded_by,
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    };
  }

  /**
   * Upload file from stream (for large files)
   */
  async uploadFileStream(
    request: StreamUploadRequest
  ): Promise<UploadFileResponse> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }

      const folder = this.config.folders[request.folder];
      if (!folder) {
        return {
          success: false,
          error: `Storage folder '${request.folder}' not found`,
        };
      }

      // Get stream threshold from config or default
      const globalConfig = this.config.global || {};
      const streamThreshold = request.options?.threshold || 10 * 1024 * 1024; // 10MB default
      const useStream = request.size ? request.size > streamThreshold : true; // Default to streaming if size unknown

      // Generate UUID and filename
      const fileId = uuidv4();
      const storedFilename = this.generateStoredFilenameFromName(
        request.filename,
        fileId
      );
      const relativePath = `${request.folder}/${storedFilename}`;

      // Get active provider
      const activeProvider = this.config.active_provider || 'local';
      const provider = this.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(`Active provider '${activeProvider}' not found`);
      }

      let providerPath: string;
      let actualSize = request.size || 0;

      // Upload to provider using stream
      switch (provider.type) {
        case 'local':
          providerPath = await this.uploadStreamToLocal(
            request.stream,
            relativePath
          );
          // Get actual file size
          const fullPath = path.join(this.getLocalStoragePath(), relativePath);
          const stats = await fs.stat(fullPath);
          actualSize = stats.size;
          break;
        case 's3':
          providerPath = await this.uploadStreamToS3(
            request.stream,
            relativePath,
            provider,
            request.contentType ||
              mime.lookup(request.filename) ||
              'application/octet-stream',
            request.options?.metadata
          );
          actualSize = request.size || 0; // S3 will set size
          break;
        case 'azure':
          providerPath = await this.uploadStreamToAzure(
            request.stream,
            relativePath,
            provider,
            request.contentType ||
              mime.lookup(request.filename) ||
              'application/octet-stream',
            request.options?.metadata
          );
          actualSize = request.size || 0; // Azure will set size
          break;
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      // Create storage file record
      const storageFile: StorageFile = {
        id: fileId,
        original_name: request.filename,
        stored_filename: storedFilename,
        folder: request.folder,
        relative_path: relativePath,
        provider_path: providerPath,
        size: actualSize,
        mime_type:
          request.contentType ||
          mime.lookup(request.filename) ||
          'application/octet-stream',
        description: request.description,
        uploaded_by: request.uploaded_by,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Save to database
      await this.databaseService.createStorageFile(storageFile);

      // Invalidate cache for folder
      if (this.cacheAdapter) {
        await this.cacheAdapter.invalidateFolder(request.folder);
      }

      // Log operation
      this.logOperation({
        operation: 'upload',
        path: providerPath,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: true,
        metadata: {
          folder: request.folder,
          size: actualSize,
          file_id: fileId,
          provider: provider.type,
          streamed: useStream,
        },
      });

      return {
        success: true,
        file: storageFile,
      };
    } catch (error) {
      this.logger.error('Stream upload failed:', error);

      this.logOperation({
        operation: 'upload',
        path: request.folder,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stream upload failed',
      };
    }
  }

  /**
   * Download file as stream (supports range requests)
   */
  async downloadFileStream(
    fileId: string,
    options?: StreamDownloadOptions
  ): Promise<Readable | null> {
    // Apply concurrency limiting if configured
    if (this.concurrencyLimiter) {
      return this.concurrencyLimiter.limitDownload(() =>
        this._downloadFileStream(fileId, options)
      );
    }
    return this._downloadFileStream(fileId, options);
  }

  /**
   * Internal download file stream implementation
   */
  private async _downloadFileStream(
    fileId: string,
    options?: StreamDownloadOptions
  ): Promise<Readable | null> {
    try {
      const file = await this.getFileById(fileId);
      if (!file) {
        return null;
      }

      const activeProvider = this.config.active_provider || 'local';
      const provider = this.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(`Active provider '${activeProvider}' not found`);
      }

      switch (provider.type) {
        case 'local':
          return this.downloadStreamFromLocal(file, options);
        case 's3':
          return this.downloadStreamFromS3(file, provider, options);
        case 'azure':
          return this.downloadStreamFromAzure(file, provider, options);
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }
    } catch (error) {
      this.logger.error('Stream download failed:', error);
      return null;
    }
  }

  /**
   * Upload stream to local storage
   */
  private async uploadStreamToLocal(
    stream: Readable,
    relativePath: string
  ): Promise<string> {
    const fullPath = path.join(this.getLocalStoragePath(), relativePath);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(fullPath));

    // Create write stream
    const writeStream = fs.createWriteStream(fullPath);

    // Pipe stream to file
    return new Promise((resolve, reject) => {
      stream
        .pipe(writeStream)
        .on('finish', () => resolve(fullPath))
        .on('error', reject);
    });
  }

  /**
   * Upload stream to S3
   */
  private async uploadStreamToS3(
    stream: Readable,
    relativePath: string,
    provider: any,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const key = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const command = new PutObjectCommand({
      Bucket: provider.bucket,
      Key: key,
      Body: stream as any, // AWS SDK accepts streams
      ContentType: contentType,
      Metadata: {
        originalName: path.basename(relativePath),
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
    });

    await this.s3Client.send(command);

    return `s3://${provider.bucket}/${key}`;
  }

  /**
   * Upload stream to Azure Blob Storage
   */
  private async uploadStreamToAzure(
    stream: Readable,
    relativePath: string,
    provider: any,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    if (!this.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    const blobName = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;
    const blockBlobClient =
      this.azureContainerClient.getBlockBlobClient(blobName);

    // Azure SDK supports uploadStream
    await blockBlobClient.uploadStream(stream as any, undefined, undefined, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
      metadata: {
        originalName: path.basename(relativePath),
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
      tier: provider.options?.access_tier || 'Hot',
    });

    return `azure://${provider.account_name}/${provider.container_name}/${blobName}`;
  }

  /**
   * Download stream from local storage (with range support)
   */
  private async downloadStreamFromLocal(
    file: StorageFile,
    options?: StreamDownloadOptions
  ): Promise<Readable> {
    const readStream = fs.createReadStream(file.provider_path, {
      start: options?.start,
      end: options?.end,
    });

    return readStream;
  }

  /**
   * Download stream from S3 (with range support)
   */
  private async downloadStreamFromS3(
    file: StorageFile,
    provider: any,
    options?: StreamDownloadOptions
  ): Promise<Readable> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from provider_path (s3://bucket/key)
    const key = file.provider_path.replace(`s3://${provider.bucket}/`, '');

    const command = new GetObjectCommand({
      Bucket: provider.bucket,
      Key: key,
      Range:
        options?.start !== undefined || options?.end !== undefined
          ? `bytes=${options.start || 0}-${options.end || ''}`
          : undefined,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    // Convert AWS SDK stream to Node.js Readable
    return response.Body as Readable;
  }

  /**
   * Download stream from Azure (with range support)
   */
  private async downloadStreamFromAzure(
    file: StorageFile,
    provider: any,
    options?: StreamDownloadOptions
  ): Promise<Readable> {
    if (!this.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    // Extract blob name from provider_path
    const blobName = file.provider_path.replace(
      `azure://${provider.account_name}/${provider.container_name}/`,
      ''
    );

    const blockBlobClient =
      this.azureContainerClient.getBlockBlobClient(blobName);

    const downloadResponse = await blockBlobClient.download(
      options?.start,
      options?.end !== undefined
        ? options.end - (options.start || 0) + 1
        : undefined
    );

    if (!downloadResponse.readableStreamBody) {
      throw new Error('Empty response body from Azure');
    }

    // Convert Azure stream to Node.js Readable
    return downloadResponse.readableStreamBody as Readable;
  }

  /**
   * Generate stored filename from original name (for stream uploads)
   */
  private generateStoredFilenameFromName(
    originalName: string,
    fileId: string
  ): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${sanitizedBaseName}_${fileId}${ext}`;
  }

  /**
   * Extract error code from error object
   */
  private extractErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return String(error.code);
    }
    if (error instanceof Error) {
      // Try to extract from error message patterns
      const message = error.message;
      if (message.includes('quota')) return 'STORAGE_QUOTA_EXCEEDED';
      if (message.includes('timeout')) return 'STORAGE_TIMEOUT';
      if (message.includes('not found')) return 'STORAGE_FILE_NOT_FOUND';
      if (message.includes('unauthorized') || message.includes('permission'))
        return 'STORAGE_UNAUTHORIZED';
    }
    if (typeof error === 'string') {
      if (error.includes('quota')) return 'STORAGE_QUOTA_EXCEEDED';
      if (error.includes('timeout')) return 'STORAGE_TIMEOUT';
      if (error.includes('not found')) return 'STORAGE_FILE_NOT_FOUND';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Generate error summary from failed operations
   */
  private generateErrorSummary(
    failed: Array<{ error: string; errorCode?: string }>
  ): {
    byType: Record<string, number>;
    byError: Array<{ error: string; count: number }>;
    totalErrors: number;
  } {
    const byType: Record<string, number> = {};
    const byError: Record<string, number> = {};

    for (const failure of failed) {
      // Count by error code
      const errorCode = failure.errorCode || 'UNKNOWN_ERROR';
      byType[errorCode] = (byType[errorCode] || 0) + 1;

      // Count by error message
      const errorMessage = failure.error;
      byError[errorMessage] = (byError[errorMessage] || 0) + 1;
    }

    // Convert to array and sort by count
    const byErrorArray = Object.entries(byError)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count);

    return {
      byType,
      byError: byErrorArray,
      totalErrors: failed.length,
    };
  }

  /**
   * Log storage operation for audit
   */
  private logOperation(operation: StorageOperation): void {
    this.logger.info('Storage operation:', {
      operation: operation.operation,
      path: operation.path,
      user_id: operation.user_id,
      success: operation.success,
      error: operation.error,
      metadata: operation.metadata,
    });
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
    await this.initializeStorage();
  }
}
