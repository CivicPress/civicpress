/**
 * Enrollment Code Cleanup Service
 *
 * Periodically removes expired enrollment codes from the database
 */

import type { Logger } from '@civicpress/core';
import { coreInfo } from '@civicpress/core';
import { EnrollmentCodeModel } from '../models/enrollment-code.js';

export class EnrollmentCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private enrollmentCodeModel: EnrollmentCodeModel,
    private logger: Logger,
    private intervalMs: number = 60 * 60 * 1000 // 1 hour default
  ) {}

  /**
   * Start the cleanup service
   */
  start(): void {
    if (this.cleanupInterval) {
      this.logger.warn('Enrollment cleanup service already started');
      return;
    }

    this.logger.info('Starting enrollment code cleanup service', {
      operation: 'broadcast-box:cleanup:start',
      intervalMs: this.intervalMs,
    });

    // Run cleanup immediately on start
    this.runCleanup().catch((error) => {
      this.logger.error('Initial enrollment cleanup failed', {
        operation: 'broadcast-box:cleanup:initial',
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup().catch((error) => {
        this.logger.error('Periodic enrollment cleanup failed', {
          operation: 'broadcast-box:cleanup:periodic',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.intervalMs);
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.info('Enrollment cleanup service stopped', {
        operation: 'broadcast-box:cleanup:stop',
      });
    }
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<number> {
    if (this.isRunning) {
      this.logger.debug('Cleanup already running, skipping');
      return 0;
    }

    this.isRunning = true;

    try {
      const deletedCount = await this.enrollmentCodeModel.deleteExpired();

      if (deletedCount > 0) {
        coreInfo('Expired enrollment codes cleaned up', {
          operation: 'broadcast-box:cleanup:completed',
          deletedCount,
        });
      } else {
        this.logger.debug('No expired enrollment codes to clean up', {
          operation: 'broadcast-box:cleanup:completed',
        });
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired enrollment codes', {
        operation: 'broadcast-box:cleanup:error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}
