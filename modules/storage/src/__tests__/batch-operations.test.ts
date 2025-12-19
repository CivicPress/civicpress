/**
 * Unit Tests for Batch Operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import { UnifiedCacheManager } from '@civicpress/core';
import { Logger } from '@civicpress/core';
import type {
  StorageConfig,
  MulterFile,
  BatchUploadRequest,
} from '../types/storage.types.js';
import { BatchOperationError } from '../errors/storage-errors.js';

// Mock database service
class MockDatabaseService {
  private files: Map<string, any> = new Map();

  async createStorageFile(file: any): Promise<void> {
    this.files.set(file.id, file);
  }

  async getStorageFilesByFolder(folder: string): Promise<any[]> {
    return Array.from(this.files.values()).filter((f) => f.folder === folder);
  }

  async deleteStorageFile(id: string): Promise<boolean> {
    return this.files.delete(id);
  }

  async getStorageFileById(id: string): Promise<any | null> {
    return this.files.get(id) || null;
  }

  async getAllStorageFiles(): Promise<any[]> {
    return Array.from(this.files.values());
  }

  clear(): void {
    this.files.clear();
  }
}

describe('Batch Operations', () => {
  let storageService: CloudUuidStorageService;
  let databaseService: MockDatabaseService;
  let cacheManager: UnifiedCacheManager;
  let config: StorageConfig;

  beforeEach(async () => {
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    cacheManager = new UnifiedCacheManager(mockLogger);
    await cacheManager.registerFromConfig('storageMetadata', {
      strategy: 'memory',
      enabled: true,
      defaultTTL: 5 * 60 * 1000,
      maxSize: 1000,
    });
    await cacheManager.initialize();

    databaseService = new MockDatabaseService();

    config = {
      backend: { type: 'local' },
      active_provider: 'local',
      providers: {
        local: {
          type: 'local',
          enabled: true,
          path: '.test-storage',
        },
      },
      folders: {
        public: {
          path: 'public',
          access: 'public',
          allowed_types: ['*'],
          max_size: '100MB',
        },
      },
      metadata: {} as any,
    };

    storageService = new CloudUuidStorageService(
      config,
      '.test-storage',
      cacheManager
    );
    storageService.setDatabaseService(databaseService);
  });

  describe('Batch Upload', () => {
    const createMockFile = (name: string, size: number = 1000): MulterFile => {
      return {
        fieldname: 'file',
        originalname: name,
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size,
        destination: '',
        filename: name,
        path: '',
        buffer: Buffer.alloc(size),
      } as MulterFile;
    };

    it('should upload multiple files successfully', async () => {
      const files = [
        createMockFile('file1.txt'),
        createMockFile('file2.txt'),
        createMockFile('file3.txt'),
      ];

      const request: BatchUploadRequest = {
        files,
        folder: 'public',
        uploaded_by: 'test-user',
      };

      const result = await storageService.batchUpload(request);

      expect(result.successfulCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.successful.length).toBe(3);
      expect(result.failed.length).toBe(0);
    });

    it('should handle partial failures', async () => {
      // Mock uploadFile to fail for second file
      const originalUpload = storageService.uploadFile.bind(storageService);
      let callCount = 0;
      vi.spyOn(storageService, 'uploadFile').mockImplementation(async (req) => {
        callCount++;
        if (callCount === 2) {
          return {
            success: false,
            error: 'Upload failed',
          };
        }
        return originalUpload(req);
      });

      const files = [
        createMockFile('file1.txt'),
        createMockFile('file2.txt'),
        createMockFile('file3.txt'),
      ];

      const request: BatchUploadRequest = {
        files,
        folder: 'public',
        uploaded_by: 'test-user',
      };

      const result = await storageService.batchUpload(request);

      expect(result.successfulCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.successful.length).toBe(2);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].error).toBe('Upload failed');
    });

    it('should include error summary on partial failure', async () => {
      // Mock uploadFile to fail for some files
      const originalUpload = storageService.uploadFile.bind(storageService);
      let callCount = 0;
      vi.spyOn(storageService, 'uploadFile').mockImplementation(async (req) => {
        callCount++;
        if (callCount === 2 || callCount === 3) {
          return {
            success: false,
            error: 'Quota exceeded',
          };
        }
        return originalUpload(req);
      });

      const files = [
        createMockFile('file1.txt'),
        createMockFile('file2.txt'),
        createMockFile('file3.txt'),
      ];

      const request: BatchUploadRequest = {
        files,
        folder: 'public',
        uploaded_by: 'test-user',
      };

      const result = await storageService.batchUpload(request);

      expect(result.errorSummary).toBeDefined();
      expect(result.errorSummary?.totalErrors).toBe(2);
      expect(result.errorSummary?.byError.length).toBeGreaterThan(0);
    });

    it('should throw BatchOperationError when all files fail', async () => {
      // Mock uploadFile to always fail
      vi.spyOn(storageService, 'uploadFile').mockResolvedValue({
        success: false,
        error: 'All failed',
      });

      const files = [createMockFile('file1.txt'), createMockFile('file2.txt')];

      const request: BatchUploadRequest = {
        files,
        folder: 'public',
        uploaded_by: 'test-user',
      };

      await expect(storageService.batchUpload(request)).rejects.toThrow(
        BatchOperationError
      );
    });

    it('should respect concurrency limits', async () => {
      const files = Array.from({ length: 10 }, (_, i) =>
        createMockFile(`file${i}.txt`)
      );

      const request: BatchUploadRequest = {
        files,
        folder: 'public',
        uploaded_by: 'test-user',
      };

      const progressCalls: any[] = [];
      const result = await storageService.batchUpload(request, {
        maxConcurrency: 3,
        onProgress: (progress) => {
          progressCalls.push(progress);
        },
      });

      expect(result.successfulCount).toBe(10);
      // Progress should be called for each file
      expect(progressCalls.length).toBe(10);
      expect(progressCalls[progressCalls.length - 1].completed).toBe(10);
      expect(progressCalls[progressCalls.length - 1].total).toBe(10);
    });

    it('should include error codes in failed results', async () => {
      // Mock uploadFile to fail with specific error
      vi.spyOn(storageService, 'uploadFile').mockImplementation(async (req) => {
        const file =
          typeof req.file === 'object' && 'originalname' in req.file
            ? req.file
            : ({
                originalname: 'unknown',
                size: 0,
                mimetype: 'application/octet-stream',
              } as MulterFile);

        if (file.originalname === 'file2.txt') {
          return {
            success: false,
            error: 'Quota exceeded',
          };
        }
        return {
          success: true,
          file: {
            id: 'test-id',
            original_name: file.originalname,
            stored_filename: file.originalname,
            folder: req.folder,
            relative_path: `${req.folder}/${file.originalname}`,
            provider_path: `/test/${file.originalname}`,
            size: file.size,
            mime_type: file.mimetype,
            created_at: new Date(),
            updated_at: new Date(),
          },
        };
      });

      const files = [createMockFile('file1.txt'), createMockFile('file2.txt')];

      const request: BatchUploadRequest = {
        files,
        folder: 'public',
        uploaded_by: 'test-user',
      };

      const result = await storageService.batchUpload(request);

      expect(result.failed.length).toBe(1);
      expect(result.failed[0].errorCode).toBeDefined();
    });
  });

  describe('Batch Delete', () => {
    it('should delete multiple files successfully', async () => {
      // First, create some files
      const file1 = await storageService.uploadFile({
        file: createMockFile('file1.txt'),
        folder: 'public',
        uploaded_by: 'test-user',
      });

      const file2 = await storageService.uploadFile({
        file: createMockFile('file2.txt'),
        folder: 'public',
        uploaded_by: 'test-user',
      });

      if (!file1.file || !file2.file) {
        throw new Error('Files not uploaded');
      }

      const result = await storageService.batchDelete({
        fileIds: [file1.file.id, file2.file.id],
        userId: 'test-user',
      });

      expect(result.successfulCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle partial failures in batch delete', async () => {
      // Create one file
      const file1 = await storageService.uploadFile({
        file: createMockFile('file1.txt'),
        folder: 'public',
        uploaded_by: 'test-user',
      });

      if (!file1.file) {
        throw new Error('File not uploaded');
      }

      // Try to delete existing and non-existing file
      const result = await storageService.batchDelete({
        fileIds: [file1.file.id, 'non-existent-id'],
        userId: 'test-user',
      });

      expect(result.successfulCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.failed[0].errorCode).toBe('STORAGE_FILE_NOT_FOUND');
    });

    it('should include error summary on partial failure', async () => {
      // Create one file
      const file1 = await storageService.uploadFile({
        file: createMockFile('file1.txt'),
        folder: 'public',
        uploaded_by: 'test-user',
      });

      if (!file1.file) {
        throw new Error('File not uploaded');
      }

      const result = await storageService.batchDelete({
        fileIds: [file1.file.id, 'non-existent-1', 'non-existent-2'],
        userId: 'test-user',
      });

      expect(result.errorSummary).toBeDefined();
      expect(result.errorSummary?.totalErrors).toBe(2);
    });

    it('should throw BatchOperationError when all deletes fail', async () => {
      await expect(
        storageService.batchDelete({
          fileIds: ['non-existent-1', 'non-existent-2'],
          userId: 'test-user',
        })
      ).rejects.toThrow(BatchOperationError);
    });

    it('should call progress callback during batch delete', async () => {
      const file1 = await storageService.uploadFile({
        file: createMockFile('file1.txt'),
        folder: 'public',
        uploaded_by: 'test-user',
      });

      if (!file1.file) {
        throw new Error('File not uploaded');
      }

      const progressCalls: any[] = [];
      await storageService.batchDelete(
        {
          fileIds: [file1.file.id, 'non-existent'],
          userId: 'test-user',
        },
        {
          onProgress: (progress) => {
            progressCalls.push(progress);
          },
        }
      );

      expect(progressCalls.length).toBe(2);
      expect(progressCalls[progressCalls.length - 1].completed).toBe(2);
    });
  });

  function createMockFile(name: string, size: number = 1000): MulterFile {
    return {
      fieldname: 'file',
      originalname: name,
      encoding: '7bit',
      mimetype: 'application/octet-stream',
      size,
      destination: '',
      filename: name,
      path: '',
      buffer: Buffer.alloc(size),
    } as MulterFile;
  }
});
