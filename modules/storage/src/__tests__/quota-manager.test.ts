/**
 * Unit Tests for Quota Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuotaManager } from '../quota/quota-manager.js';
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

  /**
   * checkQuota on its own is a read-then-decide: every concurrent upload awaits
   * the same usage read, concludes independently that it fits, and is admitted.
   * N uploads into a near-full folder could therefore overshoot the limit by up
   * to N x maxFileSize. `reserve()` records the granted headroom in the same
   * synchronous turn as the decision, so the next caller to resume sees it.
   */
  describe('reserve / release — concurrent admission', () => {
    const tenKbFolder = {
      enabled: true,
      folders: { public: { limit: 10000, limitFormatted: '10KB' } },
    };

    it('admits only as many concurrent uploads as actually fit', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        tenKbFolder,
        mockLogger
      );
      usageReporter.setFolderUsage('public', 0);

      // Three 4KB uploads race into a 10KB folder. Two fit, the third must not.
      const results = await Promise.allSettled([
        quotaManager.reserve('public', 4000),
        quotaManager.reserve('public', 4000),
        quotaManager.reserve('public', 4000),
      ]);

      const granted = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter((r) => r.status === 'rejected');

      expect(granted).toHaveLength(2);
      expect(refused).toHaveLength(1);
      expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        QuotaExceededError
      );
    });

    it('does not overshoot the GLOBAL limit under concurrency', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        {
          enabled: true,
          global: { limit: 10000, limitFormatted: '10KB' },
        },
        mockLogger
      );
      usageReporter.setOverallUsage(0);

      const results = await Promise.allSettled([
        quotaManager.reserve('public', 6000),
        quotaManager.reserve('other', 6000),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });

    it('frees the headroom again on release', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        tenKbFolder,
        mockLogger
      );
      usageReporter.setFolderUsage('public', 0);

      const first = await quotaManager.reserve('public', 8000);
      await expect(quotaManager.reserve('public', 4000)).rejects.toThrow(
        QuotaExceededError
      );

      // The upload failed and released its headroom; the next one now fits.
      quotaManager.release(first);
      await expect(
        quotaManager.reserve('public', 4000)
      ).resolves.toBeTruthy();
    });

    it('release is safe with null and when called twice', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        tenKbFolder,
        mockLogger
      );
      const reservation = await quotaManager.reserve('public', 1000);

      expect(() => quotaManager.release(null)).not.toThrow();
      expect(() => quotaManager.release(reservation)).not.toThrow();
      expect(() => quotaManager.release(reservation)).not.toThrow();
    });

    it('counts outstanding reservations as used when quota is disabled-safe', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        { ...tenKbFolder, enabled: false },
        mockLogger
      );

      // Disabled: no reservation is taken and nothing is refused.
      await expect(quotaManager.reserve('public', 999999)).resolves.toBeNull();
    });

    it('reclaims headroom from a reservation that was never released (TTL)', async () => {
      vi.useFakeTimers();
      try {
        quotaManager = new QuotaManager(
          usageReporter as any,
          { ...tenKbFolder, reservationTtlMs: 60_000 },
          mockLogger
        );
        usageReporter.setFolderUsage('public', 0);

        // A caller dies between reserve() and release().
        await quotaManager.reserve('public', 9000);
        await expect(quotaManager.reserve('public', 4000)).rejects.toThrow(
          QuotaExceededError
        );

        // Once the TTL lapses the leaked headroom comes back.
        vi.setSystemTime(Date.now() + 61_000);
        await expect(
          quotaManager.reserve('public', 4000)
        ).resolves.toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('demonstrates the race reserve() closes: concurrent checkQuota over-admits', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        tenKbFolder,
        mockLogger
      );
      usageReporter.setFolderUsage('public', 0);

      // checkQuota records nothing, so each concurrent caller decides against
      // the same pre-upload usage read and ALL are admitted — 12KB into a 10KB
      // folder. This is why the upload paths call reserve() instead.
      const results = await Promise.allSettled([
        quotaManager.checkQuota('public', 4000),
        quotaManager.checkQuota('public', 4000),
        quotaManager.checkQuota('public', 4000),
      ]);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    });

    it('checkQuota accounts for headroom already reserved by in-flight uploads', async () => {
      quotaManager = new QuotaManager(
        usageReporter as any,
        tenKbFolder,
        mockLogger
      );
      usageReporter.setFolderUsage('public', 0);

      await quotaManager.reserve('public', 8000);

      // Usage still reads 0, but 8KB is spoken for.
      await expect(quotaManager.checkQuota('public', 4000)).rejects.toThrow(
        QuotaExceededError
      );
    });
  });
});
