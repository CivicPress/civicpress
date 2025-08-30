import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
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
import { Logger } from '@civicpress/core';

export class UuidStorageService {
  private config: StorageConfig;
  private logger: Logger;
  private basePath: string;
  private databaseService: any; // Will be injected

  constructor(config: StorageConfig, basePath: string = '.system-data') {
    this.config = config;
    this.basePath = basePath;
    this.logger = new Logger();
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
   * Initialize storage directories
   */
  private async initializeStorage(): Promise<void> {
    try {
      if (this.config.backend?.type === 'local') {
        const storagePath = path.resolve(
          this.basePath,
          this.config.backend.path || 'storage'
        );

        // Create base storage directory
        await fs.ensureDir(storagePath);

        // Create configured folders
        for (const [folderName, folderConfig] of Object.entries(
          this.config.folders
        )) {
          const folderPath = path.join(storagePath, folderConfig.path);
          await fs.ensureDir(folderPath);
          this.logger.info(
            `Initialized storage folder: ${folderName} -> ${folderPath}`
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize storage:', error);
      throw new Error(`Storage initialization failed: ${error}`);
    }
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
      const fullPath = path.join(this.getStoragePath(), relativePath);

      // Ensure directory exists
      await fs.ensureDir(path.dirname(fullPath));

      // Write file to storage
      await fs.writeFile(fullPath, fileData.buffer);

      // Create storage file record
      const storageFile: StorageFile = {
        id: fileId,
        original_name: fileData.originalname,
        stored_filename: storedFilename,
        folder: request.folder,
        relative_path: relativePath,
        provider_path: fullPath,
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
        path: fullPath,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: true,
        metadata: {
          folder: request.folder,
          size: fileData.size,
          file_id: fileId,
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

      // Check if file exists on disk
      if (!(await fs.pathExists(file.provider_path))) {
        this.logger.error(`File not found on disk: ${file.provider_path}`);
        return null;
      }

      return await fs.readFile(file.provider_path);
    } catch (error) {
      this.logger.error('Failed to get file content:', error);
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

      // Delete from filesystem
      if (await fs.pathExists(file.provider_path)) {
        await fs.remove(file.provider_path);
      }

      // Delete from database
      const deleted = await this.databaseService.deleteStorageFile(id);

      this.logOperation({
        operation: 'delete',
        path: file.provider_path,
        user_id: userId,
        timestamp: new Date(),
        success: deleted,
        metadata: { file_id: id },
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
   * Get storage base path
   */
  private getStoragePath(): string {
    if (this.config.backend?.type === 'local') {
      return path.resolve(this.basePath, this.config.backend.path || 'storage');
    }
    throw new Error('Only local storage is currently supported');
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
