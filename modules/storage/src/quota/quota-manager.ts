/**
 * Quota Manager
 *
 * Manages storage quotas and enforces limits
 */

import { Logger } from '@civicpress/core';
import { QuotaExceededError } from '../errors/storage-errors.js';
import { StorageUsageReporter } from '../reporting/storage-usage-reporter.js';

export interface QuotaConfig {
  enabled: boolean;
  global?: {
    limit: number; // bytes, 0 = unlimited
    limitFormatted: string;
  };
  folders: Record<
    string,
    {
      limit: number; // bytes, 0 = unlimited
      limitFormatted: string;
    }
  >;
  /** How long an unreleased reservation holds headroom before being reclaimed. */
  reservationTtlMs?: number;
}

/**
 * Headroom held for an upload that has been admitted but whose bytes are not
 * yet reflected in the usage figures.
 */
export interface QuotaReservation {
  id: string;
  folder: string;
  size: number;
  /** Epoch ms after which the reservation is assumed leaked and reclaimed. */
  expiresAt: number;
}

/**
 * Generous by design: it only has to outlive a legitimate upload (including a
 * slow multi-GB stream), because its sole job is to reclaim headroom from a
 * caller that died before releasing.
 */
const DEFAULT_RESERVATION_TTL_MS = 15 * 60 * 1000;

/**
 * Quota manager for storage operations
 */
export class QuotaManager {
  private logger: Logger;
  private usageReporter: StorageUsageReporter;
  private config: QuotaConfig;

  /**
   * Headroom held for uploads that have been admitted but whose bytes have not
   * yet landed in the usage figures.
   *
   * A bare check is a read-then-decide: every concurrent upload awaits the same
   * usage read, so each independently concludes it fits and N uploads can
   * jointly overshoot a near-full quota by up to N x maxFileSize. A reservation
   * is recorded in the SAME synchronous turn as the decision that granted it
   * (see `admit`), so the next caller to resume already accounts for it.
   */
  private reservations = new Map<string, QuotaReservation>();
  private reservationSeq = 0;

  constructor(
    usageReporter: StorageUsageReporter,
    config: Partial<QuotaConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.usageReporter = usageReporter;
    this.config = {
      enabled: config.enabled !== false, // Default to enabled
      global: config.global,
      folders: config.folders || {},
      reservationTtlMs: config.reservationTtlMs,
    };
  }

  /**
   * Check if quota is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  private get reservationTtlMs(): number {
    return this.config.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;
  }

  /**
   * Drop reservations whose TTL elapsed — the leak-proof half of the scheme. A
   * caller that dies between reserve() and release() must not hold headroom
   * forever.
   */
  private pruneExpiredReservations(now: number): void {
    for (const [id, reservation] of this.reservations) {
      if (reservation.expiresAt <= now) {
        this.reservations.delete(id);
        this.logger.warn(
          'Quota reservation expired without release; reclaiming headroom',
          { folder: reservation.folder, size: reservation.size }
        );
      }
    }
  }

  /** Bytes held by outstanding reservations, globally or for a single folder. */
  private reservedBytes(folder?: string): number {
    let total = 0;
    for (const reservation of this.reservations.values()) {
      if (folder === undefined || reservation.folder === folder) {
        total += reservation.size;
      }
    }
    return total;
  }

  /**
   * Read the usage figures the decision needs. This is the ONLY awaiting part
   * of admission, which is what lets `admit` stay synchronous.
   */
  private async readUsage(
    folder: string
  ): Promise<{ global: number; folder: number }> {
    const globalLimited = !!(
      this.config.global && this.config.global.limit > 0
    );
    const folderQuota = this.config.folders[folder];
    const folderLimited = !!(folderQuota && folderQuota.limit > 0);

    return {
      global: globalLimited
        ? (await this.usageReporter.getOverallUsage()).total.size
        : 0,
      folder: folderLimited
        ? ((await this.usageReporter.getFolderUsage(folder))?.size ?? 0)
        : 0,
    };
  }

  /**
   * Decide whether `fileSize` fits — counting outstanding reservations as used
   * — and optionally record a reservation for it.
   *
   * MUST remain synchronous end to end. An `await` between reading
   * `reservedBytes` and inserting the new reservation would reopen the exact
   * race this closes.
   */
  private admit(
    folder: string,
    fileSize: number,
    used: { global: number; folder: number },
    reserveHeadroom: boolean
  ): QuotaReservation | null {
    const now = Date.now();
    this.pruneExpiredReservations(now);

    // Check global quota first
    if (this.config.global && this.config.global.limit > 0) {
      const limit = this.config.global.limit;
      const currentUsage = used.global + this.reservedBytes();

      if (currentUsage + fileSize > limit) {
        throw new QuotaExceededError(
          {
            used: currentUsage,
            limit,
            available: Math.max(0, limit - currentUsage),
            unit: 'bytes',
          },
          {
            folder,
            fileSize,
            provider: 'global',
          }
        );
      }
    }

    // Check folder quota
    const folderQuota = this.config.folders[folder];
    if (folderQuota && folderQuota.limit > 0) {
      const limit = folderQuota.limit;
      const currentUsage = used.folder + this.reservedBytes(folder);

      if (currentUsage + fileSize > limit) {
        throw new QuotaExceededError(
          {
            used: currentUsage,
            limit,
            available: Math.max(0, limit - currentUsage),
            unit: 'bytes',
          },
          {
            folder,
            fileSize,
            provider: folder,
          }
        );
      }
    }

    if (!reserveHeadroom) {
      return null;
    }

    const reservation: QuotaReservation = {
      id: `quota-${++this.reservationSeq}`,
      folder,
      size: fileSize,
      expiresAt: now + this.reservationTtlMs,
    };
    this.reservations.set(reservation.id, reservation);
    return reservation;
  }

  /**
   * Check quota before upload WITHOUT holding headroom.
   *
   * Real upload paths should call `reserve()` instead: this call counts
   * existing reservations but records none of its own, so two concurrent
   * callers can still both be admitted.
   */
  async checkQuota(
    folder: string,
    fileSize: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const used = await this.readUsage(folder);
    this.admit(folder, fileSize, used, false);
    return { allowed: true };
  }

  /**
   * Reserve headroom for an in-flight upload, throwing QuotaExceededError if it
   * does not fit. The caller MUST hand the returned handle to `release()` in a
   * `finally`, once the upload has either landed in the usage figures or
   * failed.
   */
  async reserve(
    folder: string,
    fileSize: number
  ): Promise<QuotaReservation | null> {
    if (!this.config.enabled) {
      return null;
    }

    const used = await this.readUsage(folder);
    return this.admit(folder, fileSize, used, true);
  }

  /** Release reserved headroom. Safe with null and safe to call twice. */
  release(reservation: QuotaReservation | null | undefined): void {
    if (!reservation) {
      return;
    }
    this.reservations.delete(reservation.id);
  }

  /**
   * Get quota information for a folder
   */
  async getFolderQuota(folder: string): Promise<{
    limit: number;
    limitFormatted: string;
    used: number;
    usedFormatted: string;
    available: number;
    availableFormatted: string;
    percentage: number;
  } | null> {
    const folderQuota = this.config.folders[folder];
    if (!folderQuota || folderQuota.limit === 0) {
      return null; // No quota or unlimited
    }

    const folderUsage = await this.usageReporter.getFolderUsage(folder);
    const used = folderUsage?.size || 0;
    const available = Math.max(0, folderQuota.limit - used);
    const percentage =
      folderQuota.limit > 0 ? (used / folderQuota.limit) * 100 : 0;

    return {
      limit: folderQuota.limit,
      limitFormatted: folderQuota.limitFormatted,
      used,
      usedFormatted: this.formatBytes(used),
      available,
      availableFormatted: this.formatBytes(available),
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Get global quota information
   */
  async getGlobalQuota(): Promise<{
    limit: number;
    limitFormatted: string;
    used: number;
    usedFormatted: string;
    available: number;
    availableFormatted: string;
    percentage: number;
  } | null> {
    if (!this.config.global || this.config.global.limit === 0) {
      return null; // No quota or unlimited
    }

    const overallUsage = await this.usageReporter.getOverallUsage();
    const used = overallUsage.total.size;
    const available = Math.max(0, this.config.global.limit - used);
    const percentage =
      this.config.global.limit > 0
        ? (used / this.config.global.limit) * 100
        : 0;

    return {
      limit: this.config.global.limit,
      limitFormatted: this.config.global.limitFormatted,
      used,
      usedFormatted: this.formatBytes(used),
      available,
      availableFormatted: this.formatBytes(available),
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Update quota configuration
   */
  updateConfig(config: Partial<QuotaConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      folders: config.folders || this.config.folders,
    };
    this.logger.debug('Quota configuration updated');
  }

  /**
   * Get quota configuration
   */
  getConfig(): QuotaConfig {
    return { ...this.config };
  }
}
