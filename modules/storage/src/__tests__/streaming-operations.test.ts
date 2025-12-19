/**
 * Unit Tests for Streaming Operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import { UnifiedCacheManager } from '@civicpress/core';
import { Logger } from '@civicpress/core';
import type { StorageConfig } from '../types/storage.types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';

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

describe('Streaming Operations', () => {
  let storageService: CloudUuidStorageService;
  let databaseService: MockDatabaseService;
  let cacheManager: UnifiedCacheManager;
  let testDataDir: string;
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

    testDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-streaming-test-')
    );
    const storageDir = path.join(testDataDir, 'storage');
    await fs.mkdir(path.join(storageDir, 'public'), { recursive: true });

    config = {
      backend: { type: 'local' },
      active_provider: 'local',
      providers: {
        local: {
          type: 'local',
          enabled: true,
          path: storageDir,
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
      testDataDir,
      cacheManager
    );
    storageService.setDatabaseService(databaseService);
  });

  describe('uploadFileStream', () => {
    it('should upload file from stream', async () => {
      const content = Buffer.from('Test file content for streaming');
      const stream = Readable.from([content]);

      const result = await storageService.uploadFileStream({
        stream,
        filename: 'stream-test.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file?.original_name).toBe('stream-test.txt');
      expect(result.file?.size).toBe(content.length);

      // Verify file exists
      const filePath = path.join(
        testDataDir,
        'storage',
        'public',
        result.file!.stored_filename
      );
      const fileContent = await fs.readFile(filePath);
      expect(fileContent).toEqual(content);
    });

    it('should handle large file streams', async () => {
      // Create a large buffer (1MB)
      const largeContent = Buffer.alloc(1024 * 1024, 'x');
      const stream = Readable.from([largeContent]);

      const result = await storageService.uploadFileStream({
        stream,
        filename: 'large-stream.bin',
        folder: 'public',
        contentType: 'application/octet-stream',
        uploaded_by: 'test-user',
      });

      expect(result.success).toBe(true);
      expect(result.file?.size).toBe(largeContent.length);
    });

    it('should handle chunked stream data', async () => {
      const chunks = ['Chunk 1', 'Chunk 2', 'Chunk 3'];
      const stream = Readable.from(chunks);

      const result = await storageService.uploadFileStream({
        stream,
        filename: 'chunked-test.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();

      // Verify content
      const filePath = path.join(
        testDataDir,
        'storage',
        'public',
        result.file!.stored_filename
      );
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe('Chunk 1Chunk 2Chunk 3');
    });

    it('should handle stream errors', async () => {
      const errorStream = new Readable({
        read() {
          this.emit('error', new Error('Stream error'));
        },
      });

      const result = await storageService.uploadFileStream({
        stream: errorStream,
        filename: 'error-test.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('downloadFileStream', () => {
    it('should download file as stream', async () => {
      // First upload a file
      const content = Buffer.from('Test content for download');
      const uploadResult = await storageService.uploadFileStream({
        stream: Readable.from([content]),
        filename: 'download-test.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      if (!uploadResult.file) {
        throw new Error('File upload failed');
      }

      // Download as stream
      const downloadStream = await storageService.downloadFileStream(
        uploadResult.file.id
      );

      expect(downloadStream).toBeDefined();
      expect(downloadStream).not.toBeNull();

      // Read stream content
      const chunks: Buffer[] = [];
      for await (const chunk of downloadStream!) {
        chunks.push(chunk);
      }
      const downloadedContent = Buffer.concat(chunks);
      expect(downloadedContent).toEqual(content);
    });

    it('should handle range requests', async () => {
      // Upload a file
      const content = Buffer.from('0123456789ABCDEF');
      const uploadResult = await storageService.uploadFileStream({
        stream: Readable.from([content]),
        filename: 'range-test.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      if (!uploadResult.file) {
        throw new Error('File upload failed');
      }

      // Download with range (bytes 5-9)
      const downloadStream = await storageService.downloadFileStream(
        uploadResult.file.id,
        { start: 5, end: 9 }
      );

      const chunks: Buffer[] = [];
      for await (const chunk of downloadStream!) {
        chunks.push(chunk);
      }
      const downloadedContent = Buffer.concat(chunks);
      expect(downloadedContent.toString()).toBe('56789');
    });

    it('should return error for non-existent file', async () => {
      await expect(
        storageService.downloadFileStream('non-existent-id')
      ).rejects.toThrow();
    });

    it('should handle invalid range requests', async () => {
      const content = Buffer.from('Test content');
      const uploadResult = await storageService.uploadFileStream({
        stream: Readable.from([content]),
        filename: 'range-error-test.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      if (!uploadResult.file) {
        throw new Error('File upload failed');
      }

      // Invalid range (start > end)
      await expect(
        storageService.downloadFileStream(uploadResult.file.id, {
          start: 10,
          end: 5,
        })
      ).rejects.toThrow();
    });
  });

  describe('Stream Error Handling', () => {
    it('should handle stream read errors during upload', async () => {
      const errorStream = new Readable({
        read() {
          process.nextTick(() => {
            this.emit('error', new Error('Read error'));
          });
        },
      });

      const result = await storageService.uploadFileStream({
        stream: errorStream,
        filename: 'error-stream.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle stream close events', async () => {
      const content = Buffer.from('Test content');
      const stream = Readable.from([content]);

      const result = await storageService.uploadFileStream({
        stream,
        filename: 'close-test.txt',
        folder: 'public',
        contentType: 'text/plain',
        uploaded_by: 'test-user',
      });

      expect(result.success).toBe(true);
    });
  });
});
