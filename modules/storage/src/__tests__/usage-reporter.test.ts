/**
 * Unit Tests for Storage Usage Reporter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageUsageReporter } from '../reporting/storage-usage-reporter.js';
import { UnifiedCacheManager } from '@civicpress/core';
import { Logger } from '@civicpress/core';

// Mock database service
class MockDatabaseService {
  private files: any[] = [];

  async getAllStorageFiles(): Promise<any[]> {
    return this.files;
  }

  async getStorageFilesByFolder(folder: string): Promise<any[]> {
    return this.files.filter((f) => f.folder === folder);
  }

  addFile(file: any): void {
    this.files.push(file);
  }

  clear(): void {
    this.files = [];
  }
}

describe('StorageUsageReporter', () => {
  let reporter: StorageUsageReporter;
  let databaseService: MockDatabaseService;
  let cacheManager: UnifiedCacheManager;
  let mockLogger: Logger;

  beforeEach(async () => {
    mockLogger = {
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
    reporter = new StorageUsageReporter(
      databaseService,
      cacheManager,
      mockLogger
    );
  });

  describe('getOverallUsage', () => {
    it('should calculate usage from database', async () => {
      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });
      databaseService.addFile({
        id: 'file2',
        folder: 'private',
        size: 2000,
        provider: 'local',
      });

      const usage = await reporter.getOverallUsage();

      expect(usage.total.files).toBe(2);
      expect(usage.total.size).toBe(3000);
      expect(usage.total.sizeFormatted).toBeDefined();
      expect(usage.byFolder.public).toBeDefined();
      expect(usage.byFolder.public.files).toBe(1);
      expect(usage.byFolder.public.size).toBe(1000);
      expect(usage.byFolder.private.files).toBe(1);
      expect(usage.byFolder.private.size).toBe(2000);
      expect(usage.timestamp).toBeInstanceOf(Date);
    });

    it('should return zero usage when no files', async () => {
      const usage = await reporter.getOverallUsage();

      expect(usage.total.files).toBe(0);
      expect(usage.total.size).toBe(0);
      expect(usage.byFolder).toEqual({});
    });

    it('should cache usage report', async () => {
      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });

      // First call
      const usage1 = await reporter.getOverallUsage();
      expect(usage1.total.files).toBe(1);

      // Clear database
      databaseService.clear();

      // Second call should return cached result
      const usage2 = await reporter.getOverallUsage();
      expect(usage2.total.files).toBe(1); // Still 1 from cache
    });

    it('should group by provider', async () => {
      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });
      databaseService.addFile({
        id: 'file2',
        folder: 'public',
        size: 2000,
        provider: 's3',
      });

      const usage = await reporter.getOverallUsage();

      expect(usage.byProvider.local).toBeDefined();
      expect(usage.byProvider.local.files).toBe(1);
      expect(usage.byProvider.local.size).toBe(1000);
      expect(usage.byProvider.s3).toBeDefined();
      expect(usage.byProvider.s3.files).toBe(1);
      expect(usage.byProvider.s3.size).toBe(2000);
    });

    it('should format sizes correctly', async () => {
      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1024, // 1 KB
        provider: 'local',
      });
      databaseService.addFile({
        id: 'file2',
        folder: 'public',
        size: 1048576, // 1 MB
        provider: 'local',
      });

      const usage = await reporter.getOverallUsage();

      expect(usage.total.sizeFormatted).toContain('MB');
      expect(usage.byFolder.public.sizeFormatted).toBeDefined();
    });
  });

  describe('getFolderUsage', () => {
    it('should return usage for specific folder', async () => {
      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });
      databaseService.addFile({
        id: 'file2',
        folder: 'public',
        size: 2000,
        provider: 'local',
      });
      databaseService.addFile({
        id: 'file3',
        folder: 'private',
        size: 3000,
        provider: 'local',
      });

      const usage = await reporter.getFolderUsage('public');

      expect(usage).toBeDefined();
      expect(usage?.files).toBe(2);
      expect(usage?.size).toBe(3000);
      expect(usage?.sizeFormatted).toBeDefined();
    });

    it('should return null for empty folder', async () => {
      const usage = await reporter.getFolderUsage('public');
      expect(usage).toBeNull();
    });

    it('should cache folder usage', async () => {
      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });

      // First call
      const usage1 = await reporter.getFolderUsage('public');
      expect(usage1?.files).toBe(1);

      // Remove file
      databaseService.clear();

      // Second call should return cached result
      const usage2 = await reporter.getFolderUsage('public');
      expect(usage2?.files).toBe(1); // Still 1 from cache
    });

    it('should handle files without size', async () => {
      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: null,
        provider: 'local',
      });
      databaseService.addFile({
        id: 'file2',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });

      const usage = await reporter.getFolderUsage('public');

      expect(usage?.size).toBe(1000); // Should ignore null sizes
    });
  });

  describe('Cache Behavior', () => {
    it('should work without cache manager', async () => {
      const reporterNoCache = new StorageUsageReporter(
        databaseService,
        undefined,
        mockLogger
      );

      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });

      const usage = await reporterNoCache.getOverallUsage();
      expect(usage.total.files).toBe(1);
    });

    it('should handle cache errors gracefully', async () => {
      // Create reporter with cache
      const reporterWithCache = new StorageUsageReporter(
        databaseService,
        cacheManager,
        mockLogger
      );

      databaseService.addFile({
        id: 'file1',
        folder: 'public',
        size: 1000,
        provider: 'local',
      });

      // Should not throw even if cache fails
      const usage = await reporterWithCache.getOverallUsage();
      expect(usage.total.files).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when database service not initialized', async () => {
      const reporterNoDb = new StorageUsageReporter(
        null as any,
        undefined,
        mockLogger
      );

      await expect(reporterNoDb.getOverallUsage()).rejects.toThrow(
        'Database service not initialized'
      );
    });

    it('should throw error when database service not initialized for folder', async () => {
      const reporterNoDb = new StorageUsageReporter(
        null as any,
        undefined,
        mockLogger
      );

      await expect(reporterNoDb.getFolderUsage('public')).rejects.toThrow(
        'Database service not initialized'
      );
    });
  });
});
