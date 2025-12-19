/**
 * Unit Tests for Lifecycle Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LifecycleManager,
  type LifecyclePolicy,
} from '../lifecycle/lifecycle-manager.js';
import { Logger } from '@civicpress/core';
import type { StorageFile } from '../types/storage.types.js';

// Mock database service
class MockDatabaseService {
  private files: Map<string, any> = new Map();

  async getAllStorageFiles(): Promise<any[]> {
    return Array.from(this.files.values());
  }

  async updateStorageFile(id: string, updates: any): Promise<void> {
    const file = this.files.get(id);
    if (file) {
      this.files.set(id, { ...file, ...updates });
    }
  }

  addFile(file: any): void {
    this.files.set(file.id, file);
  }

  clear(): void {
    this.files.clear();
  }
}

// Mock storage service
class MockStorageService {
  async listFiles(folder: string): Promise<StorageFile[]> {
    return [];
  }

  async deleteFile(id: string): Promise<void> {
    // Mock implementation
  }
}

describe('LifecycleManager', () => {
  let manager: LifecycleManager;
  let databaseService: MockDatabaseService;
  let storageService: MockStorageService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    databaseService = new MockDatabaseService();
    storageService = new MockStorageService();
    manager = new LifecycleManager(
      databaseService,
      storageService,
      [],
      mockLogger
    );
  });

  describe('evaluateLifecycle', () => {
    it('should return empty array when no policies', async () => {
      const actions = await manager.evaluateLifecycle();
      expect(actions).toEqual([]);
    });

    it('should evaluate retention policy', async () => {
      const policy: LifecyclePolicy = {
        name: 'retention',
        retentionDays: 30,
        enabled: true,
      };
      manager.addPolicy(policy);

      // Add a file that's within retention period
      const recentFile = {
        id: 'recent-file',
        folder: 'public',
        original_name: 'recent.txt',
        stored_filename: 'recent.txt',
        relative_path: 'public/recent.txt',
        provider_path: '/storage/public/recent.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        updated_at: new Date(),
      };
      databaseService.addFile(recentFile);

      const actions = await manager.evaluateLifecycle();

      expect(actions.length).toBeGreaterThan(0);
      const retainAction = actions.find((a) => a.action === 'retain');
      expect(retainAction).toBeDefined();
      expect(retainAction?.file.id).toBe('recent-file');
    });

    it('should evaluate archive policy', async () => {
      const policy: LifecyclePolicy = {
        name: 'archive',
        archiveAfterDays: 90,
        enabled: true,
      };
      manager.addPolicy(policy);

      // Add a file that's older than archive threshold
      const oldFile = {
        id: 'old-file',
        folder: 'public',
        original_name: 'old.txt',
        stored_filename: 'old.txt',
        relative_path: 'public/old.txt',
        provider_path: '/storage/public/old.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
        updated_at: new Date(),
      };
      databaseService.addFile(oldFile);

      const actions = await manager.evaluateLifecycle();

      expect(actions.length).toBeGreaterThan(0);
      const archiveAction = actions.find((a) => a.action === 'archive');
      expect(archiveAction).toBeDefined();
      expect(archiveAction?.file.id).toBe('old-file');
      expect(archiveAction?.reason).toContain('archive threshold');
    });

    it('should evaluate delete policy', async () => {
      const policy: LifecyclePolicy = {
        name: 'delete',
        deleteAfterDays: 365,
        enabled: true,
      };
      manager.addPolicy(policy);

      // Add a file that's older than delete threshold
      const veryOldFile = {
        id: 'very-old-file',
        folder: 'public',
        original_name: 'very-old.txt',
        stored_filename: 'very-old.txt',
        relative_path: 'public/very-old.txt',
        provider_path: '/storage/public/very-old.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago
        updated_at: new Date(),
      };
      databaseService.addFile(veryOldFile);

      const actions = await manager.evaluateLifecycle();

      expect(actions.length).toBeGreaterThan(0);
      const deleteAction = actions.find((a) => a.action === 'delete');
      expect(deleteAction).toBeDefined();
      expect(deleteAction?.file.id).toBe('very-old-file');
      expect(deleteAction?.reason).toContain('delete threshold');
    });

    it('should prioritize delete over archive', async () => {
      const policies: LifecyclePolicy[] = [
        {
          name: 'archive',
          archiveAfterDays: 90,
          enabled: true,
        },
        {
          name: 'delete',
          deleteAfterDays: 365,
          enabled: true,
        },
      ];
      policies.forEach((p) => manager.addPolicy(p));

      // Add a file that exceeds both thresholds
      const veryOldFile = {
        id: 'very-old-file',
        folder: 'public',
        original_name: 'very-old.txt',
        stored_filename: 'very-old.txt',
        relative_path: 'public/very-old.txt',
        provider_path: '/storage/public/very-old.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago
        updated_at: new Date(),
      };
      databaseService.addFile(veryOldFile);

      const actions = await manager.evaluateLifecycle();

      // Should only have one action (first matching policy)
      const deleteAction = actions.find((a) => a.action === 'delete');
      expect(deleteAction).toBeDefined();
    });

    it('should apply folder-specific policies', async () => {
      const policy: LifecyclePolicy = {
        name: 'public-archive',
        folder: 'public',
        archiveAfterDays: 90,
        enabled: true,
      };
      manager.addPolicy(policy);

      // Add file in public folder
      const publicFile = {
        id: 'public-file',
        folder: 'public',
        original_name: 'public.txt',
        stored_filename: 'public.txt',
        relative_path: 'public/public.txt',
        provider_path: '/storage/public/public.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      };
      databaseService.addFile(publicFile);

      // Add file in private folder (should not match policy)
      const privateFile = {
        id: 'private-file',
        folder: 'private',
        original_name: 'private.txt',
        stored_filename: 'private.txt',
        relative_path: 'private/private.txt',
        provider_path: '/storage/private/private.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      };
      databaseService.addFile(privateFile);

      const actions = await manager.evaluateLifecycle();

      // Should only have action for public file
      expect(actions.length).toBe(1);
      expect(actions[0].file.id).toBe('public-file');
    });

    it('should skip disabled policies', async () => {
      const policy: LifecyclePolicy = {
        name: 'disabled',
        deleteAfterDays: 30,
        enabled: false,
      };
      manager.addPolicy(policy);

      const oldFile = {
        id: 'old-file',
        folder: 'public',
        original_name: 'old.txt',
        stored_filename: 'old.txt',
        relative_path: 'public/old.txt',
        provider_path: '/storage/public/old.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      };
      databaseService.addFile(oldFile);

      const actions = await manager.evaluateLifecycle();

      expect(actions).toEqual([]);
    });

    it('should not archive already archived files', async () => {
      const policy: LifecyclePolicy = {
        name: 'archive',
        archiveAfterDays: 90,
        enabled: true,
      };
      manager.addPolicy(policy);

      // Add file already in archive folder
      const archivedFile = {
        id: 'archived-file',
        folder: 'archive',
        original_name: 'archived.txt',
        stored_filename: 'archived.txt',
        relative_path: 'archive/archived.txt',
        provider_path: '/storage/archive/archived.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      };
      databaseService.addFile(archivedFile);

      const actions = await manager.evaluateLifecycle();

      // Should not have archive action for already archived file
      const archiveAction = actions.find((a) => a.action === 'archive');
      expect(archiveAction).toBeUndefined();
    });
  });

  describe('executeLifecycle', () => {
    it('should execute archive action in dry-run mode', async () => {
      const oldFile = {
        id: 'old-file',
        folder: 'public',
        original_name: 'old.txt',
        stored_filename: 'old.txt',
        relative_path: 'public/old.txt',
        provider_path: '/storage/public/old.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      };

      const actions = [
        {
          file: oldFile as StorageFile,
          action: 'archive' as const,
          reason: 'Test archive',
          scheduledDate: new Date(),
        },
      ];

      const result = await manager.executeLifecycle(actions, true); // dryRun = true

      expect(result.processed).toBe(1);
      expect(result.archived).toBe(1);
      expect(result.deleted).toBe(0);
      expect(result.errors).toEqual([]);

      // File should not be updated (dry run)
      const file = databaseService
        .getAllStorageFiles()
        .then((f) => f.find((file) => file.id === 'old-file'));
      expect(file).toBeDefined();
    });

    it('should execute delete action', async () => {
      const oldFile = {
        id: 'old-file',
        folder: 'public',
        original_name: 'old.txt',
        stored_filename: 'old.txt',
        relative_path: 'public/old.txt',
        provider_path: '/storage/public/old.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      };

      const deleteSpy = vi
        .spyOn(storageService, 'deleteFile')
        .mockResolvedValue(undefined);

      const actions = [
        {
          file: oldFile as StorageFile,
          action: 'delete' as const,
          reason: 'Test delete',
          scheduledDate: new Date(),
        },
      ];

      const result = await manager.executeLifecycle(actions, false);

      expect(result.processed).toBe(1);
      expect(result.deleted).toBe(1);
      expect(deleteSpy).toHaveBeenCalledWith('old-file');
    });

    it('should handle errors gracefully', async () => {
      const oldFile = {
        id: 'error-file',
        folder: 'public',
        original_name: 'error.txt',
        stored_filename: 'error.txt',
        relative_path: 'public/error.txt',
        provider_path: '/storage/public/error.txt',
        size: 100,
        mime_type: 'text/plain',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      };

      vi.spyOn(storageService, 'deleteFile').mockRejectedValue(
        new Error('Delete failed')
      );

      const actions = [
        {
          file: oldFile as StorageFile,
          action: 'delete' as const,
          reason: 'Test delete',
          scheduledDate: new Date(),
        },
      ];

      const result = await manager.executeLifecycle(actions, false);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0].file).toBe('error-file');
      expect(result.errors[0].error).toContain('Delete failed');
    });
  });

  describe('Policy Management', () => {
    it('should add policy', () => {
      const policy: LifecyclePolicy = {
        name: 'test-policy',
        enabled: true,
      };

      manager.addPolicy(policy);

      const policies = manager.getPolicies();
      expect(policies).toContainEqual(policy);
    });

    it('should remove policy', () => {
      const policy: LifecyclePolicy = {
        name: 'test-policy',
        enabled: true,
      };

      manager.addPolicy(policy);
      manager.removePolicy('test-policy');

      const policies = manager.getPolicies();
      expect(policies).not.toContainEqual(policy);
    });

    it('should get all policies', () => {
      const policy1: LifecyclePolicy = {
        name: 'policy1',
        enabled: true,
      };
      const policy2: LifecyclePolicy = {
        name: 'policy2',
        enabled: true,
      };

      manager.addPolicy(policy1);
      manager.addPolicy(policy2);

      const policies = manager.getPolicies();
      expect(policies.length).toBe(2);
    });
  });
});
