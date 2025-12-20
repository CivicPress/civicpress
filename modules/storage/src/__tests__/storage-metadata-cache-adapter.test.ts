/**
 * Unit Tests for Storage Metadata Cache Adapter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedCacheManager } from '@civicpress/core';
import { Logger } from '@civicpress/core';
import { StorageMetadataCacheAdapter } from '../cache/storage-metadata-cache-adapter.js';
import type { StorageFile } from '../types/storage.types.js';

describe('StorageMetadataCacheAdapter', () => {
  let cacheManager: UnifiedCacheManager;
  let adapter: StorageMetadataCacheAdapter;
  let mockLogger: Logger;

  beforeEach(async () => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    cacheManager = new UnifiedCacheManager(mockLogger);

    // Register the storageMetadata cache
    await cacheManager.registerFromConfig('storageMetadata', {
      strategy: 'memory',
      enabled: true,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxSize: 1000,
    });

    await cacheManager.initialize();
    adapter = new StorageMetadataCacheAdapter(cacheManager, mockLogger);
  });

  describe('getCachedFiles', () => {
    it('should return null when cache is empty', async () => {
      const result = await adapter.getCachedFiles('public');
      expect(result).toBeNull();
    });

    it('should return cached files after setting them', async () => {
      const mockFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', mockFiles);
      const result = await adapter.getCachedFiles('public');

      expect(result).toEqual(mockFiles);
    });

    it('should log cache hit when file is cached', async () => {
      const mockFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', mockFiles);
      await adapter.getCachedFiles('public');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cache hit for folder: public'
      );
    });

    it('should log cache miss when file is not cached', async () => {
      await adapter.getCachedFiles('public');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cache miss for folder: public'
      );
    });
  });

  describe('setCachedFiles', () => {
    it('should cache files for a folder', async () => {
      const mockFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', mockFiles);
      const result = await adapter.getCachedFiles('public');

      expect(result).toEqual(mockFiles);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cached 1 files for folder: public'
      );
    });

    it('should support custom TTL', async () => {
      const mockFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', mockFiles, 60000); // 1 minute TTL
      const result = await adapter.getCachedFiles('public');

      expect(result).toEqual(mockFiles);
    });
  });

  describe('invalidateFolder', () => {
    it('should remove cached files for a folder', async () => {
      const mockFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', mockFiles);
      await adapter.invalidateFolder('public');
      const result = await adapter.getCachedFiles('public');

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Invalidated cache for folder: public'
      );
    });

    it('should not affect other folders', async () => {
      const publicFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const privateFiles: StorageFile[] = [
        {
          id: 'file-2',
          original_name: 'private.pdf',
          stored_filename: 'uuid-private.pdf',
          folder: 'private',
          relative_path: 'private/uuid-private.pdf',
          provider_path: '/storage/private/uuid-private.pdf',
          size: 2048,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', publicFiles);
      await adapter.setCachedFiles('private', privateFiles);
      await adapter.invalidateFolder('public');

      expect(await adapter.getCachedFiles('public')).toBeNull();
      expect(await adapter.getCachedFiles('private')).toEqual(privateFiles);
    });
  });

  describe('invalidateFile', () => {
    it('should invalidate the parent folder cache', async () => {
      const mockFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', mockFiles);
      await adapter.invalidateFile('file-1', 'public');
      const result = await adapter.getCachedFiles('public');

      expect(result).toBeNull();
    });
  });

  describe('invalidateAll', () => {
    it('should remove all cached folders', async () => {
      const publicFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const privateFiles: StorageFile[] = [
        {
          id: 'file-2',
          original_name: 'private.pdf',
          stored_filename: 'uuid-private.pdf',
          folder: 'private',
          relative_path: 'private/uuid-private.pdf',
          provider_path: '/storage/private/uuid-private.pdf',
          size: 2048,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', publicFiles);
      await adapter.setCachedFiles('private', privateFiles);
      await adapter.invalidateAll();

      expect(await adapter.getCachedFiles('public')).toBeNull();
      expect(await adapter.getCachedFiles('private')).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Invalidated all storage caches'
      );
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      const mockFiles: StorageFile[] = [
        {
          id: 'file-1',
          original_name: 'test.pdf',
          stored_filename: 'uuid-test.pdf',
          folder: 'public',
          relative_path: 'public/uuid-test.pdf',
          provider_path: '/storage/public/uuid-test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await adapter.setCachedFiles('public', mockFiles);
      const stats = await adapter.getCacheStats();

      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      if (stats) {
        expect(stats.size).toBeGreaterThan(0);
      }
    });
  });
});
