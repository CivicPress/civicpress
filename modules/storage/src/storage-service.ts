import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import type { Request } from 'express';
import {
  StorageConfig,
  StorageFolder,
  FileInfo,
  UploadResult,
  FileValidationResult,
  StorageOperation,
} from './types/storage.types.js';
import { Logger } from '@civicpress/core';

// Define the file type interface for multer
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

export class StorageService {
  private config: StorageConfig;
  private logger: Logger;
  private basePath: string;

  constructor(config: StorageConfig, basePath: string = '.system-data') {
    this.config = config;
    this.basePath = basePath;
    this.logger = new Logger();
  }

  /**
   * Initialize the storage service (must be called after construction)
   */
  async initialize(): Promise<void> {
    await this.initializeStorage();
  }

  /**
   * Initialize storage directories and validate configuration
   */
  private async initializeStorage(): Promise<void> {
    try {
      if (this.config.backend.type === 'local') {
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
   * Upload a file to a specific folder
   */
  async uploadFile(
    folderName: string,
    file: MulterFile,
    userId?: string
  ): Promise<UploadResult> {
    try {
      const folder = this.config.folders[folderName];
      if (!folder) {
        throw new Error(`Storage folder '${folderName}' not found`);
      }

      // Validate file
      const validation = this.validateFile(file, folder);
      if (!validation.valid) {
        return {
          success: false,
          file: this.createFileInfo(file),
          path: '',
          url: '',
          error: validation.errors.join(', '),
        };
      }

      // Generate file path
      const fileName = this.generateFileName(file);
      const filePath = path.join(this.getStoragePath(), folder.path, fileName);

      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Write file
      await fs.writeFile(filePath, file.buffer);

      // Create file info
      const fileInfo = await this.getFileInfo(filePath, file);

      // Log operation
      this.logOperation({
        operation: 'upload',
        path: filePath,
        user_id: userId,
        timestamp: new Date(),
        success: true,
        metadata: { folder: folderName, size: file.size },
      });

      return {
        success: true,
        file: fileInfo,
        path: filePath,
        url: this.getFileUrl(folderName, fileName),
        error: undefined,
      };
    } catch (error) {
      this.logger.error('File upload failed:', error);

      this.logOperation({
        operation: 'upload',
        path: file.originalname,
        user_id: userId,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        file: this.createFileInfo(file),
        path: '',
        url: '',
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folderName: string): Promise<FileInfo[]> {
    try {
      const folder = this.config.folders[folderName];
      if (!folder) {
        throw new Error(`Storage folder '${folderName}' not found`);
      }

      const folderPath = path.join(this.getStoragePath(), folder.path);
      const files = await fs.readdir(folderPath);

      const fileInfos: FileInfo[] = [];

      for (const fileName of files) {
        const filePath = path.join(folderPath, fileName);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const fileInfo = await this.getFileInfo(filePath, {
            originalname: fileName,
          } as MulterFile);
          fileInfos.push(fileInfo);
        }
      }

      return fileInfos;
    } catch (error) {
      this.logger.error('Failed to list files:', error);
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string, userId?: string): Promise<boolean> {
    try {
      await fs.remove(filePath);

      this.logOperation({
        operation: 'delete',
        path: filePath,
        user_id: userId,
        timestamp: new Date(),
        success: true,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to delete file:', error);

      this.logOperation({
        operation: 'delete',
        path: filePath,
        user_id: userId,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }

  /**
   * Get file information
   */
  async getFileInfo(filePath: string, file?: MulterFile): Promise<FileInfo> {
    const stats = await fs.stat(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    return {
      name: file?.originalname || path.basename(filePath),
      path: filePath,
      size: stats.size,
      mime_type: mimeType,
      created: stats.birthtime,
      modified: stats.mtime,
    };
  }

  /**
   * Find file by original name in a folder
   */
  async findFileByOriginalName(
    folderName: string,
    originalName: string
  ): Promise<string | null> {
    try {
      const folder = this.config.folders[folderName];
      if (!folder) {
        return null;
      }

      const folderPath = path.join(this.getStoragePath(), folder.path);
      const files = await fs.readdir(folderPath);

      for (const fileName of files) {
        // Check if the file starts with the original name (before the timestamp)
        if (
          fileName.startsWith(
            path.basename(originalName, path.extname(originalName))
          )
        ) {
          return path.join(folderPath, fileName);
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to find file by original name:', error);
      return null;
    }
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
   * Generate unique filename
   */
  private generateFileName(file: MulterFile): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(file.originalname);
    const name = path.basename(file.originalname, extension);

    return `${name}-${timestamp}-${random}${extension}`;
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
    if (this.config.backend.type === 'local') {
      return path.resolve(this.basePath, this.config.backend.path || 'storage');
    }
    throw new Error('Only local storage is currently supported');
  }

  /**
   * Get file URL for public access
   */
  private getFileUrl(folderName: string, fileName: string): string {
    return `/storage/${folderName}/${fileName}`;
  }

  /**
   * Create basic file info from upload
   */
  private createFileInfo(file: MulterFile): FileInfo {
    return {
      name: file.originalname,
      path: '',
      size: file.size,
      mime_type: file.mimetype || 'application/octet-stream',
      created: new Date(),
      modified: new Date(),
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
