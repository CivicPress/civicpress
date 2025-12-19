/**
 * Integration Tests for Storage Cache Integration
 *
 * Tests the integration between CloudUuidStorageService and the cache adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import { UnifiedCacheManager, DatabaseService, Logger } from '@civicpress/core';
import type {
  StorageConfig,
  StorageFile,
  MulterFile,
} from '../types/storage.types.js';

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

  clear(): void {
    this.files.clear();
  }
}

describe('Storage Cache Integration', () => {
  let storageService: CloudUuidStorageService;
  let cacheManager: UnifiedCacheManager;
  let databaseService: MockDatabaseService;
  let testDataDir: string;
  let systemDataDir: string;
  let config: StorageConfig;

  beforeEach(async () => {
    // Create temporary directories
    testDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-storage-test-')
    );
    systemDataDir = path.join(testDataDir, '.system-data');
    await fs.mkdir(systemDataDir, { recursive: true });

    // Create storage directory
    const storageDir = path.join(systemDataDir, 'storage');
    await fs.mkdir(path.join(storageDir, 'public'), { recursive: true });
    await fs.mkdir(path.join(storageDir, 'private'), { recursive: true });

    // Setup config
    config = {
      backend: { type: 'local', path: 'storage' },
      providers: {
        local: {
          type: 'local',
          enabled: true,
          path: 'storage',
        },
      },
      active_provider: 'local',
      folders: {
        public: {
          path: 'public',
          access: 'public',
          allowed_types: ['pdf', 'txt'],
          max_size: '10MB',
        },
        private: {
          path: 'private',
          access: 'private',
          allowed_types: ['pdf'],
          max_size: '5MB',
        },
      },
      metadata: {
        auto_generate_thumbnails: false,
        store_exif: false,
        compress_images: false,
        backup_included: false,
      },
    };

    // Initialize cache manager
    const logger = new Logger({ quiet: true });
    cacheManager = new UnifiedCacheManager(logger);
    await cacheManager.registerFromConfig('storageMetadata', {
      strategy: 'memory',
      enabled: true,
      defaultTTL: 5 * 60 * 1000,
      maxSize: 1000,
    });
    await cacheManager.initialize();

    // Initialize database service
    databaseService = new MockDatabaseService();

    // Initialize storage service
    storageService = new CloudUuidStorageService(
      config,
      systemDataDir,
      cacheManager
    );
    storageService.setDatabaseService(databaseService as any);
    await storageService.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await cacheManager.shutdown();
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  describe('listFiles caching', () => {
    it('should cache listFiles results', async () => {
      // Create a mock file
      const mockFile: MulterFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
        size: 12,
      } as any;

      // Upload file
      await storageService.uploadFile({
        file: mockFile,
        folder: 'public',
        uploaded_by: 'user-1',
      });

      // First call - should query database (cache miss)
      const firstCall = await storageService.listFiles('public');
      expect(firstCall).toHaveLength(1);

      // Clear database to ensure we're using cache
      databaseService.clear();

      // Second call - should use cache (cache hit)
      const secondCall = await storageService.listFiles('public');
      expect(secondCall).toHaveLength(1);
      expect(secondCall[0].original_name).toBe('test.pdf');
    });

    it('should invalidate cache after upload', async () => {
      const mockFile1: MulterFile = {
        fieldname: 'file',
        originalname: 'file1.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('content 1'),
        size: 10,
      } as any;

      // Upload first file
      await storageService.uploadFile({
        file: mockFile1,
        folder: 'public',
        uploaded_by: 'user-1',
      });

      // List files - should cache result
      let files = await storageService.listFiles('public');
      expect(files).toHaveLength(1);

      // Upload second file
      const mockFile2: MulterFile = {
        fieldname: 'file',
        originalname: 'file2.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('content 2'),
        size: 10,
      } as any;

      await storageService.uploadFile({
        file: mockFile2,
        folder: 'public',
        uploaded_by: 'user-1',
      });

      // List files again - should get updated list (cache invalidated)
      files = await storageService.listFiles('public');
      expect(files).toHaveLength(2);
    });

    it('should invalidate cache after delete', async () => {
      const mockFile: MulterFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
        size: 12,
      } as any;

      // Upload file
      const uploadResult = await storageService.uploadFile({
        file: mockFile,
        folder: 'public',
        uploaded_by: 'user-1',
      });

      expect(uploadResult.success).toBe(true);
      const fileId = uploadResult.file!.id;

      // List files - should cache result
      let files = await storageService.listFiles('public');
      expect(files).toHaveLength(1);

      // Delete file
      await storageService.deleteFile(fileId, 'user-1');

      // List files again - should be empty (cache invalidated)
      files = await storageService.listFiles('public');
      expect(files).toHaveLength(0);
    });

    it('should cache different folders separately', async () => {
      const mockFile1: MulterFile = {
        fieldname: 'file',
        originalname: 'public.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('public content'),
        size: 14,
      } as any;

      const mockFile2: MulterFile = {
        fieldname: 'file',
        originalname: 'private.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('private content'),
        size: 15,
      } as any;

      // Upload to different folders
      await storageService.uploadFile({
        file: mockFile1,
        folder: 'public',
        uploaded_by: 'user-1',
      });

      await storageService.uploadFile({
        file: mockFile2,
        folder: 'private',
        uploaded_by: 'user-1',
      });

      // List both folders
      const publicFiles = await storageService.listFiles('public');
      const privateFiles = await storageService.listFiles('private');

      expect(publicFiles).toHaveLength(1);
      expect(privateFiles).toHaveLength(1);

      // Clear database to ensure cache works
      databaseService.clear();

      // Should still get cached results
      const cachedPublic = await storageService.listFiles('public');
      const cachedPrivate = await storageService.listFiles('private');

      expect(cachedPublic).toHaveLength(1);
      expect(cachedPrivate).toHaveLength(1);
      expect(cachedPublic[0].folder).toBe('public');
      expect(cachedPrivate[0].folder).toBe('private');
    });
  });

  describe('cache without cache manager', () => {
    it('should work without cache manager (backward compatibility)', async () => {
      const serviceWithoutCache = new CloudUuidStorageService(
        config,
        systemDataDir
      );
      serviceWithoutCache.setDatabaseService(databaseService as any);
      await serviceWithoutCache.initialize();

      const mockFile: MulterFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
        size: 12,
      } as any;

      await serviceWithoutCache.uploadFile({
        file: mockFile,
        folder: 'public',
        uploaded_by: 'user-1',
      });

      const files = await serviceWithoutCache.listFiles('public');
      expect(files).toHaveLength(1);
    });
  });
});
