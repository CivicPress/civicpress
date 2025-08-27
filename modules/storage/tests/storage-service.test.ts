import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { StorageService } from '../src/storage-service.js';
import { StorageConfigManager } from '../src/storage-config-manager.js';
import type { StorageConfig } from '../src/types/storage.types.js';

describe('StorageService', () => {
  let tempDir: string;
  let storageService: StorageService;
  let configManager: StorageConfigManager;
  let testConfig: StorageConfig;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = path.join(process.cwd(), 'temp-test-storage');
    await fs.ensureDir(tempDir);

    // Create test configuration
    testConfig = {
      backend: {
        type: 'local',
        path: 'storage',
      },
      folders: {
        test: {
          path: 'test',
          access: 'public',
          allowed_types: ['txt', 'md'],
          max_size: '1MB',
          description: 'Test folder',
        },
      },
      metadata: {
        auto_generate_thumbnails: false,
        store_exif: false,
        compress_images: false,
        backup_included: true,
      },
    };

    // Initialize services
    configManager = new StorageConfigManager(tempDir);
    storageService = new StorageService(testConfig, tempDir);

    // Initialize storage service
    await storageService.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('Configuration', () => {
    it('should load default configuration', async () => {
      const config = await configManager.loadConfig();
      expect(config.backend.type).toBe('local');
      expect(config.folders.public).toBeDefined();
      expect(config.folders.sessions).toBeDefined();
    });

    it('should validate configuration correctly', () => {
      const validation = configManager.validateConfig(testConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      const invalidConfig = { ...testConfig };
      delete (invalidConfig as any).folders;

      const validation = configManager.validateConfig(invalidConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'At least one storage folder must be configured'
      );
    });
  });

  describe('File Operations', () => {
    it('should create storage directories', async () => {
      const storagePath = path.join(tempDir, 'storage');
      const testFolderPath = path.join(storagePath, 'test');

      expect(await fs.pathExists(storagePath)).toBe(true);
      expect(await fs.pathExists(testFolderPath)).toBe(true);
    });

    it('should list files in folder', async () => {
      const files = await storageService.listFiles('test');
      expect(Array.isArray(files)).toBe(true);
      expect(files).toHaveLength(0); // Empty initially
    });

    it('should handle non-existent folder', async () => {
      await expect(storageService.listFiles('nonexistent')).rejects.toThrow(
        "Storage folder 'nonexistent' not found"
      );
    });
  });

  describe('Configuration Management', () => {
    it('should add new folder', async () => {
      const newFolder = {
        path: 'custom',
        access: 'authenticated' as const,
        allowed_types: ['pdf'],
        max_size: '5MB',
        description: 'Custom folder',
      };

      const updatedConfig = await configManager.addFolder('custom', newFolder);
      expect(updatedConfig.folders.custom).toEqual(newFolder);
    });

    it('should update folder configuration', async () => {
      // First add the test folder to the config manager
      const testFolder = {
        path: 'test',
        access: 'public' as const,
        allowed_types: ['txt', 'md'],
        max_size: '1MB',
        description: 'Test folder',
      };

      await configManager.addFolder('test', testFolder);

      const updates = {
        max_size: '2MB',
        description: 'Updated test folder',
      };

      const updatedConfig = await configManager.updateFolder('test', updates);
      expect(updatedConfig.folders.test.max_size).toBe('2MB');
      expect(updatedConfig.folders.test.description).toBe(
        'Updated test folder'
      );
    });

    it('should prevent removal of system folders', async () => {
      await expect(configManager.removeFolder('public')).rejects.toThrow(
        "Cannot remove system folder 'public'"
      );
    });
  });
});
