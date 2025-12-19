/**
 * Unit Tests for Quota Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuotaManager } from '../quota/quota-manager.js';
import { StorageUsageReporter } from '../reporting/storage-usage-reporter.js';
import { QuotaExceededError } from '../errors/storage-errors.js';
import { Logger } from '@civicpress/core';

// Mock usage reporter
class MockUsageReporter {
  private folderUsage: Map<string, { files: number; size: number }> = new Map();
  private overallUsage = { files: 0, size: 0 };

  async getOverallUsage() {
    return {
      total: {
        files: this.overallUsage.files,
        size: this.overallUsage.size,
        sizeFormatted: this.formatBytes(this.overallUsage.size),
      },
      byFolder: {},
      byProvider: {},
      timestamp: new Date(),
    };
  }

  async getFolderUsage(folder: string) {
    const usage = this.folderUsage.get(folder);
    if (!usage) return null;

    return {
      files: usage.files,
      size: usage.size,
      sizeFormatted: this.formatBytes(usage.size),
    };
  }

  setFolderUsage(folder: string, size: number, files: number = 1) {
    this.folderUsage.set(folder, { files, size });
  }

  setOverallUsage(size: number, files: number = 1) {
    this.overallUsage = { files, size };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

describe('QuotaManager', () => {
  let quotaManager: QuotaManager;
  let usageReporter: MockUsageReporter;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    usageReporter = new MockUsageReporter();
    quotaManager = new QuotaManager(usageReporter as any, {}, mockLogger);
  });

  describe('isEnabled', () => {
    it('should be enabled by default', () => {
      expect(quotaManager.isEnabled()).toBe(true);
    });

    it('should respect enabled flag', () => {
      const disabledManager = new QuotaManager(
        usageReporter as any,
        { enabled: false },
        mockLogger
      );
      expect(disabledManager.isEnabled()).toBe(false);
    });
  });

  describe('checkQuota - Folder Quota', () => {
    it('should allow upload when under quota', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          folders: {
            public: {
              limit: 10000, // 10KB
              limitFormatted: '10KB',
            },
          },
        },
        mockLogger
      );

      usageReporter.setFolderUsage('public', 5000); // 5KB used

      const result = await quotaManager.checkQuota('public', 2000); // 2KB file
      expect(result.allowed).toBe(true);
    });

    it('should throw QuotaExceededError when folder quota exceeded', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          folders: {
            public: {
              limit: 10000, // 10KB
              limitFormatted: '10KB',
            },
          },
        },
        mockLogger
      );

      usageReporter.setFolderUsage('public', 9000); // 9KB used

      await expect(
        quotaManager.checkQuota('public', 2000) // 2KB file would exceed
      ).rejects.toThrow(QuotaExceededError);
    });

    it('should allow upload when folder has no quota', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          folders: {},
        },
        mockLogger
      );

      const result = await quotaManager.checkQuota('public', 10000);
      expect(result.allowed).toBe(true);
    });

    it('should allow upload when folder quota is unlimited (0)', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          folders: {
            public: {
              limit: 0, // Unlimited
              limitFormatted: '0',
            },
          },
        },
        mockLogger
      );

      const result = await quotaManager.checkQuota('public', 100000);
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkQuota - Global Quota', () => {
    it('should allow upload when under global quota', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          global: {
            limit: 100000, // 100KB
            limitFormatted: '100KB',
          },
        },
        mockLogger
      );

      usageReporter.setOverallUsage(50000); // 50KB used

      const result = await quotaManager.checkQuota('public', 20000); // 20KB file
      expect(result.allowed).toBe(true);
    });

    it('should throw QuotaExceededError when global quota exceeded', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          global: {
            limit: 100000, // 100KB
            limitFormatted: '100KB',
          },
        },
        mockLogger
      );

      usageReporter.setOverallUsage(95000); // 95KB used

      await expect(
        quotaManager.checkQuota('public', 10000) // 10KB file would exceed
      ).rejects.toThrow(QuotaExceededError);
    });

    it('should check global quota before folder quota', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          global: {
            limit: 50000, // 50KB
            limitFormatted: '50KB',
          },
          folders: {
            public: {
              limit: 100000, // 100KB (higher than global)
              limitFormatted: '100KB',
            },
          },
        },
        mockLogger
      );

      usageReporter.setOverallUsage(45000); // 45KB used globally
      usageReporter.setFolderUsage('public', 10000); // 10KB used in folder

      // Should fail on global quota even though folder quota allows it
      await expect(
        quotaManager.checkQuota('public', 10000) // 10KB file
      ).rejects.toThrow(QuotaExceededError);
    });
  });

  describe('getFolderQuota', () => {
    it('should return folder quota information', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          folders: {
            public: {
              limit: 10000, // 10KB
              limitFormatted: '10KB',
            },
          },
        },
        mockLogger
      );

      usageReporter.setFolderUsage('public', 6000); // 6KB used

      const quota = await quotaManager.getFolderQuota('public');

      expect(quota).toBeDefined();
      expect(quota?.limit).toBe(10000);
      expect(quota?.used).toBe(6000);
      expect(quota?.available).toBe(4000);
      expect(quota?.percentage).toBeCloseTo(60, 1);
    });

    it('should return null for folder without quota', async () => {
      const quota = await quotaManager.getFolderQuota('public');
      expect(quota).toBeNull();
    });

    it('should return null for unlimited quota', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          folders: {
            public: {
              limit: 0, // Unlimited
              limitFormatted: '0',
            },
          },
        },
        mockLogger
      );

      const quota = await quotaManager.getFolderQuota('public');
      expect(quota).toBeNull();
    });
  });

  describe('getGlobalQuota', () => {
    it('should return global quota information', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          global: {
            limit: 100000, // 100KB
            limitFormatted: '100KB',
          },
        },
        mockLogger
      );

      usageReporter.setOverallUsage(75000); // 75KB used

      const quota = await quotaManager.getGlobalQuota();

      expect(quota).toBeDefined();
      expect(quota?.limit).toBe(100000);
      expect(quota?.used).toBe(75000);
      expect(quota?.available).toBe(25000);
      expect(quota?.percentage).toBeCloseTo(75, 1);
    });

    it('should return null when no global quota', async () => {
      const quota = await quotaManager.getGlobalQuota();
      expect(quota).toBeNull();
    });

    it('should return null for unlimited global quota', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          global: {
            limit: 0, // Unlimited
            limitFormatted: '0',
          },
        },
        mockLogger
      );

      const quota = await quotaManager.getGlobalQuota();
      expect(quota).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should update quota configuration', () => {
      quotaManager.updateConfig({
        folders: {
          public: {
            limit: 5000,
            limitFormatted: '5KB',
          },
        },
      });

      const config = quotaManager.getConfig();
      expect(config.folders.public).toBeDefined();
      expect(config.folders.public.limit).toBe(5000);
    });
  });
});
