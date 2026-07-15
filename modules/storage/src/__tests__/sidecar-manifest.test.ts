/**
 * FA-STOR-004: sidecar manifests + DB reconstruction.
 *
 * Each locally-stored file gets a `<file>.meta.json` sidecar so the storage_files
 * DB rows can be rebuilt from disk after a metadata-DB loss.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StorageDatabaseService } from '../types/storage.types.js';
import { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import { UnifiedCacheManager } from '@civicpress/core';
import type { StorageConfig } from '../types/storage.types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';

class MockDatabaseService {
  files: Map<string, any> = new Map();
  async createStorageFile(file: any): Promise<void> {
    this.files.set(file.id, file);
  }
  async upsertStorageFile(file: any): Promise<void> {
    this.files.set(file.id, file);
  }
  async getStorageFilesByFolder(folder: string): Promise<any[]> {
    return Array.from(this.files.values()).filter((f) => f.folder === folder);
  }
  async getAllStorageFiles(): Promise<any[]> {
    return Array.from(this.files.values());
  }
  async deleteStorageFile(id: string): Promise<boolean> {
    return this.files.delete(id);
  }
  async getStorageFileById(id: string): Promise<any | null> {
    return this.files.get(id) || null;
  }
  async updateStorageFile(): Promise<boolean> {
    return true;
  }
  clear(): void {
    this.files.clear();
  }
}

describe('Sidecar manifests (FA-STOR-004)', () => {
  let storageService: CloudUuidStorageService;
  let databaseService: MockDatabaseService;
  let cacheManager: UnifiedCacheManager;
  let testDataDir: string;
  let storageDir: string;

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
      path.join(os.tmpdir(), 'civicpress-sidecar-test-')
    );
    storageDir = path.join(testDataDir, 'storage');
    await fs.mkdir(path.join(storageDir, 'public'), { recursive: true });

    const config: StorageConfig = {
      backend: { type: 'local' },
      active_provider: 'local',
      providers: { local: { type: 'local', enabled: true, path: storageDir } },
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
    storageService.setDatabaseService(
      databaseService as unknown as StorageDatabaseService
    );
  });

  const upload = async (filename: string) => {
    const content = Buffer.from(`content of ${filename}`);
    const result = await storageService.uploadFileStream({
      stream: Readable.from([content]),
      filename,
      folder: 'public',
      contentType: 'text/plain',
      size: content.length,
      uploaded_by: 'test-user',
    });
    expect(result.success).toBe(true);
    return result.file!;
  };

  it('writes a .meta.json sidecar next to the stored file', async () => {
    const file = await upload('report.txt');
    const sidecarPath =
      path.join(storageDir, file.relative_path) + '.meta.json';
    const manifest = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));
    expect(manifest.id).toBe(file.id);
    expect(manifest.original_name).toBe('report.txt');
    expect(manifest.relative_path).toBe(file.relative_path);
  });

  it('removes the sidecar when the file is deleted', async () => {
    const file = await upload('doomed.txt');
    const sidecarPath =
      path.join(storageDir, file.relative_path) + '.meta.json';
    await fs.access(sidecarPath); // exists
    await storageService.deleteFile(file.id);
    await expect(fs.access(sidecarPath)).rejects.toBeTruthy();
  });

  it('rebuilds the DB rows from sidecars after a DB loss', async () => {
    const a = await upload('a.txt');
    const b = await upload('b.txt');

    // Simulate total metadata-DB loss.
    databaseService.clear();
    expect(await databaseService.getAllStorageFiles()).toHaveLength(0);

    const { restored, failed } = await storageService.reconstructFromManifests();
    expect(failed).toBe(0);
    expect(restored).toBe(2);

    const ids = (await databaseService.getAllStorageFiles()).map(
      (f: any) => f.id
    );
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });
});
