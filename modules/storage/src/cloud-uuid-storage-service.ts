import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
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
import type {
  StorageConfig,
  StorageFolder,
  StorageFile,
  UploadFileRequest,
  UploadFileResponse,
  FileValidationResult,
  StorageOperation,
  MulterFile,
} from './types/storage.types.js';
import { CredentialManager } from './credential-manager.js';
import { Logger } from '@civicpress/core';

export class CloudUuidStorageService {
  private config: StorageConfig;
  private logger: Logger;
  private basePath: string;
  private databaseService: any; // Will be injected
  private credentialManager: CredentialManager;
  private s3Client: S3Client | null = null;
  private azureBlobServiceClient: BlobServiceClient | null = null;
  private azureContainerClient: ContainerClient | null = null;

  constructor(config: StorageConfig, basePath: string = '.system-data') {
    this.config = config;
    this.basePath = basePath;
    this.logger = new Logger();
    this.credentialManager = new CredentialManager();
  }

  /**
   * Set database service for file tracking
   */
  setDatabaseService(databaseService: any): void {
    this.databaseService = databaseService;
  }

  /**
   * Initialize the storage service
   */
  async initialize(): Promise<void> {
    await this.initializeStorage();
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
          throw new Error('Google Cloud Storage not yet implemented');
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
    const storagePath = path.resolve(this.basePath, provider.path || 'storage');
    await fs.ensureDir(storagePath);

    // Create configured folders
    for (const [folderName, folderConfig] of Object.entries(
      this.config.folders
    )) {
      const folderPath = path.join(storagePath, folderConfig.path);
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
   * Upload a file with UUID tracking
   */
  async uploadFile(request: UploadFileRequest): Promise<UploadFileResponse> {
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
      let fileData: MulterFile;
      if (Buffer.isBuffer(request.file)) {
        throw new Error('Buffer uploads not yet supported - use MulterFile');
      } else {
        fileData = request.file as MulterFile;
      }

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

      // Upload to active provider
      const activeProvider = this.config.active_provider || 'local';
      const provider = this.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(`Active provider '${activeProvider}' not found`);
      }

      let providerPath: string;

      switch (provider.type) {
        case 'local':
          providerPath = await this.uploadToLocal(fileData, relativePath);
          break;
        case 's3':
          providerPath = await this.uploadToS3(
            fileData,
            relativePath,
            provider
          );
          break;
        case 'azure':
          providerPath = await this.uploadToAzure(
            fileData,
            relativePath,
            provider
          );
          break;
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
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
          provider: provider.type,
        },
      });

      return {
        success: true,
        file: storageFile,
      };
    } catch (error) {
      this.logger.error('File upload failed:', error);

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
        error: error instanceof Error ? error.message : 'Upload failed',
      };
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
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const key = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

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

    await this.s3Client.send(command);

    return `s3://${provider.bucket}/${key}`;
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

    // Get block blob client
    const blockBlobClient =
      this.azureContainerClient.getBlockBlobClient(blobName);

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
    try {
      const file = await this.getFileById(id);
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
          return await this.getFileContentFromLocal(file);
        case 's3':
          return await this.getFileContentFromS3(file, provider);
        case 'azure':
          return await this.getFileContentFromAzure(file, provider);
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }
    } catch (error) {
      this.logger.error('Failed to get file content:', error);
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

    const command = new GetObjectCommand({
      Bucket: provider.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);

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

    const blockBlobClient =
      this.azureContainerClient.getBlockBlobClient(blobName);

    try {
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
    } catch (error) {
      this.logger.error('Failed to download from Azure:', error);
      return null;
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folderName: string): Promise<StorageFile[]> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }

      const fileRecords =
        await this.databaseService.getStorageFilesByFolder(folderName);
      return fileRecords.map((record: any) =>
        this.dbRecordToStorageFile(record)
      );
    } catch (error) {
      this.logger.error('Failed to list files:', error);
      return [];
    }
  }

  /**
   * Delete file by UUID
   */
  async deleteFile(id: string, userId?: string): Promise<boolean> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }

      const file = await this.getFileById(id);
      if (!file) {
        return false;
      }

      const activeProvider = this.config.active_provider || 'local';
      const provider = this.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(`Active provider '${activeProvider}' not found`);
      }

      // Delete from storage provider
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
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      // Delete from database
      const deleted = await this.databaseService.deleteStorageFile(id);

      this.logOperation({
        operation: 'delete',
        path: file.provider_path,
        user_id: userId,
        timestamp: new Date(),
        success: deleted,
        metadata: { file_id: id, provider: provider.type },
      });

      return deleted;
    } catch (error) {
      this.logger.error('Failed to delete file:', error);

      this.logOperation({
        operation: 'delete',
        path: `file:${id}`,
        user_id: userId,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

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

    const command = new DeleteObjectCommand({
      Bucket: provider.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
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

    const blockBlobClient =
      this.azureContainerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
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
