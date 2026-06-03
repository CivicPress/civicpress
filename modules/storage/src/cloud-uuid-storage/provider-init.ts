/**
 * Provider SDK client bootstrap collaborator for CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Owns the
 * per-provider SDK client construction:
 *   - initializeLocalStorage (filesystem prep)
 *   - initializeS3Storage    (AWS S3 client + credentials)
 *   - initializeAzureStorage (Azure Blob client + container)
 *   - initializeGCSStorage   (Google Cloud Storage client + bucket)
 *   - performHealthCheck     (per-provider lightweight probe)
 *
 * The ops collaborators (upload/download/file-mgmt/streaming) call back
 * into the orchestrator's lazy-init paths when an SDK client is missing —
 * the orchestrator exposes thin wrappers that forward to this module.
 */

import fs from 'fs-extra';
import path from 'path';
import {
  loadAwsS3Sdk,
  loadAzureBlobSdk,
  loadGcsStorageSdk,
} from './sdk-loader.js';
import { getLocalStoragePath } from './internals.js';
import type { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import type {
  StorageProvider,
  S3Credentials,
  AzureCredentials,
  GCSCredentials,
} from '../types/storage.types.js';

export interface ProviderInitDeps {
  host: CloudUuidStorageService;
}

export class ProviderInit {
  constructor(private readonly deps: ProviderInitDeps) {}

  /**
   * Initialize storage based on active provider
   */
  async initializeStorage(): Promise<void> {
    const host = this.deps.host;
    try {
      const activeProvider = host.config.active_provider || 'local';
      const provider = host.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(
          `Active provider '${activeProvider}' not found in configuration`
        );
      }

      host.logger.info(
        `Initializing storage with provider: ${activeProvider}`
      );

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
      host.logger.error('Failed to initialize storage:', error);
      throw new Error(`Storage initialization failed: ${error}`);
    }
  }

  /**
   * Initialize local storage
   */
  async initializeLocalStorage(provider: StorageProvider): Promise<void> {
    const host = this.deps.host;
    // Use the same path resolution logic as getLocalStoragePath()
    const storagePath = provider.path || 'storage';
    const resolvedPath = path.isAbsolute(storagePath)
      ? storagePath
      : path.resolve(host.basePath, storagePath);
    await fs.ensureDir(resolvedPath);

    // Create configured folders
    for (const [folderName, folderConfig] of Object.entries(
      host.config.folders
    )) {
      const folderPath = path.join(resolvedPath, folderConfig.path);
      await fs.ensureDir(folderPath);
      host.logger.info(
        `Initialized local folder: ${folderName} -> ${folderPath}`
      );
    }
  }

  /**
   * Initialize S3 storage
   */
  async initializeS3Storage(provider: StorageProvider): Promise<void> {
    const host = this.deps.host;
    const credentials = await host.credentialManager.getCredentials('s3');

    if (!credentials) {
      throw new Error('S3 credentials not found');
    }

    const { S3Client } = await loadAwsS3Sdk();
    host.s3Client = new S3Client({
      region: provider.region,
      credentials: {
        accessKeyId: (credentials as S3Credentials).accessKeyId,
        secretAccessKey: (credentials as S3Credentials).secretAccessKey,
        ...((credentials as S3Credentials).sessionToken && {
          sessionToken: (credentials as S3Credentials).sessionToken,
        }),
      },
      ...(provider.endpoint && { endpoint: provider.endpoint }),
      forcePathStyle: provider.options?.force_path_style || false,
    });

    host.logger.info(
      `Initialized S3 storage: region=${provider.region}, bucket=${provider.bucket}`
    );
  }

  /**
   * Initialize Azure Blob Storage
   */
  async initializeAzureStorage(provider: StorageProvider): Promise<void> {
    const host = this.deps.host;
    const credentials = await host.credentialManager.getCredentials('azure');

    if (!credentials) {
      throw new Error('Azure credentials not found');
    }

    // Initialize Azure Blob Service Client
    const azureCreds = credentials as AzureCredentials;
    const { BlobServiceClient, StorageSharedKeyCredential } =
      await loadAzureBlobSdk();
    if (azureCreds.connectionString) {
      // Use connection string if available
      host.azureBlobServiceClient = BlobServiceClient.fromConnectionString(
        azureCreds.connectionString
      );
    } else if (azureCreds.accountKey && provider.account_name) {
      // Use account name and key
      const accountUrl = `https://${provider.account_name}.blob.core.windows.net`;
      const sharedKeyCredential = new StorageSharedKeyCredential(
        provider.account_name,
        azureCreds.accountKey
      );
      host.azureBlobServiceClient = new BlobServiceClient(
        accountUrl,
        sharedKeyCredential
      );
    } else {
      throw new Error(
        'Azure credentials incomplete - need either connectionString or accountName + accountKey'
      );
    }

    if (!provider.container_name) {
      throw new Error('Azure provider missing container_name');
    }

    // Get container client
    host.azureContainerClient = host.azureBlobServiceClient.getContainerClient(
      provider.container_name
    );

    // Ensure container exists
    try {
      await host.azureContainerClient.createIfNotExists({
        access: 'blob', // Default to blob-level access
      });
    } catch (error) {
      host.logger.warn(
        'Container might already exist or access denied:',
        error
      );
    }

    host.logger.info(
      `Initialized Azure storage: account=${provider.account_name}, container=${provider.container_name}`
    );
  }

  /**
   * Initialize Google Cloud Storage
   */
  async initializeGCSStorage(provider: StorageProvider): Promise<void> {
    const host = this.deps.host;
    const credentials = await host.credentialManager.getCredentials('gcs');

    if (!credentials) {
      throw new Error('GCS credentials not found');
    }

    const gcsCredentials = credentials as GCSCredentials;

    // Initialize GCS Storage client
    const storageOptions: Record<string, unknown> = {
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
      host.logger.debug(`Using GCS service account key: ${keyPath}`);
    } else if (gcsCredentials.credentials) {
      // Use credentials object if provided
      storageOptions.credentials = gcsCredentials.credentials;
    }
    // Otherwise, use Application Default Credentials (ADC)

    const { Storage } = await loadGcsStorageSdk();
    host.gcsStorage = new Storage(storageOptions);

    // Get bucket
    const bucketName = provider.bucket;
    if (!bucketName) {
      throw new Error('GCS bucket name is required');
    }

    host.gcsBucket = host.gcsStorage.bucket(bucketName);

    // Ensure bucket exists (or verify access if create_bucket is false)
    try {
      const [exists] = await host.gcsBucket.exists();
      if (!exists) {
        // Create bucket if it doesn't exist (optional, based on config)
        if (provider.options?.create_bucket !== false) {
          await host.gcsBucket.create({
            location: provider.options?.location || 'US',
            storageClass: provider.options?.storage_class || 'STANDARD',
          });
          host.logger.info(`Created GCS bucket: ${bucketName}`);
        } else {
          throw new Error(`GCS bucket '${bucketName}' does not exist`);
        }
      } else {
        host.logger.info(`GCS bucket '${bucketName}' exists and is accessible`);
      }
    } catch (error) {
      // If create_bucket is false and we can't check existence, try a lightweight operation instead
      // This handles cases where the service account has object permissions but not bucket permissions
      if (provider.options?.create_bucket === false) {
        host.logger.warn(
          `Could not verify GCS bucket '${bucketName}' existence (may lack storage.buckets.get permission). Will attempt to use bucket directly.`,
          error instanceof Error ? error.message : String(error)
        );
        // Don't throw - assume bucket exists and try to use it
        // The first actual operation will fail if bucket doesn't exist or is inaccessible
      } else {
        host.logger.error(
          `Failed to check/create GCS bucket '${bucketName}':`,
          error
        );
        throw error;
      }
    }

    host.logger.info(
      `Initialized GCS storage: project=${storageOptions.projectId}, bucket=${bucketName}`
    );
  }

  /**
   * Perform health check for a provider
   */
  async performHealthCheck(providerName: string): Promise<void> {
    const host = this.deps.host;
    const provider = host.config.providers?.[providerName];
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found`);
    }

    // Perform a lightweight operation to check provider health
    // For local: check if storage path exists
    // For S3: try to list objects (with limit 1)
    // For Azure: try to list blobs (with limit 1)

    switch (provider.type) {
      case 'local': {
        // Check if storage path exists
        const localPath = getLocalStoragePath(host);
        const exists = await fs.pathExists(localPath);
        if (!exists) {
          throw new Error(`Local storage path does not exist: ${localPath}`);
        }
        break;
      }
      case 's3': {
        if (!host.s3Client) {
          await this.initializeS3Storage(provider);
        }
        // Try to list objects (limit 1)
        const { ListObjectsV2Command } = await loadAwsS3Sdk();
        const listCommand = new ListObjectsV2Command({
          Bucket: provider.bucket,
          MaxKeys: 1,
        });
        await host.s3Client!.send(listCommand);
        break;
      }
      case 'azure': {
        if (!host.azureContainerClient) {
          await this.initializeAzureStorage(provider);
        }
        // Try to list blobs (limit 1)
        const blobs = host.azureContainerClient!.listBlobsFlat();
        await blobs.next(); // Just check if we can access the container
        break;
      }
      case 'gcs': {
        if (!host.gcsBucket) {
          await this.initializeGCSStorage(provider);
        }
        // Try to list files (limit 1)
        const [_files] = await host.gcsBucket!.getFiles({ maxResults: 1 });
        // Just check if we can access the bucket
        break;
      }
      default:
        throw new Error(
          `Unsupported provider type for health check: ${provider.type}`
        );
    }
  }
}
