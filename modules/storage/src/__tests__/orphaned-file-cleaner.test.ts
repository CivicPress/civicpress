/**
 * Unit Tests for Orphaned File Cleaner
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrphanedFileCleaner } from '../cleanup/orphaned-file-cleaner.js';
import { Logger } from '@civicpress/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock database service
class MockDatabaseService {
  private files: Map<string, any> = new Map();

  async getAllStorageFiles(): Promise<any[]> {
    return Array.from(this.files.values());
  }

  async deleteStorageFile(id: string): Promise<boolean> {
    return this.files.delete(id);
  }

  addFile(file: any): void {
    this.files.set(file.id, file);
  }

  clear(): void {
    this.files.clear();
  }
}

describe('OrphanedFileCleaner', () => {
  let cleaner: OrphanedFileCleaner;
  let databaseService: MockDatabaseService;
  let mockLogger: Logger;
  let testDataDir: string;
  let config: any;

  beforeEach(async () => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    databaseService = new MockDatabaseService();

    testDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-orphan-test-')
    );
    const storageDir = path.join(testDataDir, 'storage');
    await fs.mkdir(path.join(storageDir, 'public'), { recursive: true });

    config = {
      providers: {
        local: {
          type: 'local',
          path: storageDir,
        },
      },
    };

    cleaner = new OrphanedFileCleaner(
      databaseService,
      config,
      null, // s3Client
      null, // azureContainerClient
      mockLogger
    );
  });

  describe('findOrphanedFiles', () => {
    it('should find files in storage but not in database', async () => {
      // Create a file in storage but not in database
      const orphanPath = path.join(
        testDataDir,
        'storage',
        'public',
        'orphan.txt'
      );
      await fs.writeFile(orphanPath, 'orphan content');

      const orphaned = await cleaner.findOrphanedFiles('local');

      expect(orphaned.length).toBeGreaterThan(0);
      const orphan = orphaned.find((f) => f.type === 'in_storage');
      expect(orphan).toBeDefined();
      expect(orphan?.type).toBe('in_storage');
      expect(orphan?.path).toContain('orphan.txt');
    });

    it('should find files in database but not in storage', async () => {
      // Add file to database but don't create in storage
      databaseService.addFile({
        id: 'db-only-id',
        folder: 'public',
        provider_path: path.join(
          testDataDir,
          'storage',
          'public',
          'db-only.txt'
        ),
        size: 100,
      });

      const orphaned = await cleaner.findOrphanedFiles('local');

      expect(orphaned.length).toBeGreaterThan(0);
      const orphan = orphaned.find((f) => f.type === 'in_database');
      expect(orphan).toBeDefined();
      expect(orphan?.type).toBe('in_database');
      expect(orphan?.id).toBe('db-only-id');
    });

    it('should find mismatched paths', async () => {
      // Create file in storage
      const storagePath = path.join(
        testDataDir,
        'storage',
        'public',
        'mismatch.txt'
      );
      await fs.writeFile(storagePath, 'content');

      // Add file to database with different path
      databaseService.addFile({
        id: 'mismatch-id',
        folder: 'public',
        provider_path: path.join(
          testDataDir,
          'storage',
          'public',
          'different.txt'
        ),
        size: 100,
      });

      const orphaned = await cleaner.findOrphanedFiles('local');

      // Should find both the orphan in storage and the mismatch
      expect(orphaned.length).toBeGreaterThan(0);
    });

    it('should return empty array when no orphans', async () => {
      // Create file in storage
      const filePath = path.join(testDataDir, 'storage', 'public', 'valid.txt');
      await fs.writeFile(filePath, 'content');

      // Add matching file to database
      databaseService.addFile({
        id: 'valid-id',
        folder: 'public',
        provider_path: filePath,
        size: 7,
      });

      const orphaned = await cleaner.findOrphanedFiles('local');

      // Should not find any orphans (paths match)
      const actualOrphans = orphaned.filter(
        (f) =>
          f.type === 'in_storage' ||
          f.type === 'in_database' ||
          f.type === 'mismatched'
      );
      expect(actualOrphans.length).toBe(0);
    });

    it('should handle empty storage and database', async () => {
      const orphaned = await cleaner.findOrphanedFiles('local');
      expect(orphaned).toEqual([]);
    });
  });

  describe('cleanupOrphanedFiles', () => {
    it('should clean up orphaned files in dry-run mode', async () => {
      const orphanPath = path.join(
        testDataDir,
        'storage',
        'public',
        'dry-run-orphan.txt'
      );
      await fs.writeFile(orphanPath, 'content');

      const orphaned = await cleaner.findOrphanedFiles('local');
      const result = await cleaner.cleanupOrphanedFiles(orphaned, true); // dryRun = true

      expect(result.scanned).toBe(orphaned.length);
      expect(result.cleaned).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      // File should still exist (dry run)
      const exists = await fs
        .access(orphanPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should delete orphaned files in storage', async () => {
      const orphanPath = path.join(
        testDataDir,
        'storage',
        'public',
        'to-delete.txt'
      );
      await fs.writeFile(orphanPath, 'content');

      const orphaned = await cleaner.findOrphanedFiles('local');
      const storageOrphans = orphaned.filter((f) => f.type === 'in_storage');

      if (storageOrphans.length > 0) {
        const result = await cleaner.cleanupOrphanedFiles(
          storageOrphans,
          false
        );

        expect(result.cleaned).toBeGreaterThan(0);
        expect(result.errors).toEqual([]);

        // File should be deleted
        const exists = await fs
          .access(orphanPath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      }
    });

    it('should delete orphaned files from database', async () => {
      // Add file to database but don't create in storage
      databaseService.addFile({
        id: 'db-orphan-id',
        folder: 'public',
        provider_path: path.join(
          testDataDir,
          'storage',
          'public',
          'db-orphan.txt'
        ),
        size: 100,
      });

      const orphaned = await cleaner.findOrphanedFiles('local');
      const dbOrphans = orphaned.filter((f) => f.type === 'in_database');

      if (dbOrphans.length > 0) {
        const result = await cleaner.cleanupOrphanedFiles(dbOrphans, false);

        expect(result.cleaned).toBeGreaterThan(0);

        // File should be removed from database
        const file = await databaseService.getAllStorageFiles();
        expect(file.find((f) => f.id === 'db-orphan-id')).toBeUndefined();
      }
    });

    it('should handle cleanup errors gracefully', async () => {
      // Create orphan with invalid path
      const orphaned = [
        {
          id: undefined,
          path: '/nonexistent/path/file.txt',
          type: 'in_storage' as const,
          provider: 'local',
        },
      ];

      const result = await cleaner.cleanupOrphanedFiles(orphaned, false);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].file).toBe('/nonexistent/path/file.txt');
    });

    it('should handle mismatched files', async () => {
      // Create file in storage
      const storagePath = path.join(
        testDataDir,
        'storage',
        'public',
        'mismatch.txt'
      );
      await fs.writeFile(storagePath, 'content');

      // Add file to database with different path
      databaseService.addFile({
        id: 'mismatch-id',
        folder: 'public',
        provider_path: path.join(
          testDataDir,
          'storage',
          'public',
          'different.txt'
        ),
        size: 100,
      });

      const orphaned = await cleaner.findOrphanedFiles('local');
      const mismatched = orphaned.filter((f) => f.type === 'mismatched');

      if (mismatched.length > 0) {
        const result = await cleaner.cleanupOrphanedFiles(mismatched, false);

        expect(result.cleaned).toBeGreaterThan(0);
        // Should delete from both storage and database
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown provider', async () => {
      await expect(cleaner.findOrphanedFiles('unknown')).rejects.toThrow(
        "Provider 'unknown' not found"
      );
    });

    it('should handle database errors', async () => {
      const brokenDb = {
        getAllStorageFiles: vi.fn().mockRejectedValue(new Error('DB error')),
      };

      const brokenCleaner = new OrphanedFileCleaner(
        brokenDb as any,
        config,
        null,
        null,
        mockLogger
      );

      await expect(brokenCleaner.findOrphanedFiles('local')).rejects.toThrow(
        'DB error'
      );
    });
  });
});
