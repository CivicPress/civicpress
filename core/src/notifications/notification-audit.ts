import * as fs from 'fs';
import * as path from 'path';
import { coreError } from '../utils/core-output.js';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  action:
    | 'notification_sent'
    | 'notification_failed'
    | 'channel_test'
    | 'config_updated';
  details: {
    channels?: string[];
    template?: string;
    recipient?: string;
    success?: boolean;
    errors?: string[];
  };
  metadata?: Record<string, any>;
}

export class NotificationAudit {
  private auditLogPath: string;
  private maxEntries: number = 10000;

  constructor(dataDir: string = '.system-data') {
    this.auditLogPath = path.join(dataDir, 'notification-audit.jsonl');
  }

  /**
   * Log a notification event
   */
  async logNotification(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const auditEntry: AuditEntry = {
      ...entry,
      timestamp: new Date(),
    };

    await this.writeAuditEntry(auditEntry);
  }

  /**
   * Log a configuration change
   */
  async logConfigChange(
    userId: string,
    action: string,
    details: any
  ): Promise<void> {
    const auditEntry: AuditEntry = {
      id: this.generateAuditId(),
      timestamp: new Date(),
      userId,
      action: 'config_updated' as any,
      details: {
        action,
        ...details,
      },
    };

    await this.writeAuditEntry(auditEntry);
  }

  /**
   * Write audit entry to file
   */
  private async writeAuditEntry(entry: AuditEntry): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Append entry to log file
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.auditLogPath, logLine);

      // Rotate log if too large
      await this.rotateLogIfNeeded();
    } catch (error) {
      coreError(
        'Failed to write audit entry',
        'AUDIT_WRITE_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'notification:audit' }
      );
    }
  }

  /**
   * Rotate log file if it gets too large
   */
  private async rotateLogIfNeeded(): Promise<void> {
    try {
      if (!fs.existsSync(this.auditLogPath)) {
        return;
      }

      const stats = fs.statSync(this.auditLogPath);
      const lines = fs
        .readFileSync(this.auditLogPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim());

      if (lines.length > this.maxEntries) {
        // Keep only the last 80% of entries
        const keepCount = Math.floor(this.maxEntries * 0.8);
        const keptLines = lines.slice(-keepCount);

        fs.writeFileSync(this.auditLogPath, keptLines.join('\n') + '\n');
      }
    } catch (error) {
      coreError(
        'Failed to rotate audit log',
        'AUDIT_ROTATE_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'notification:audit' }
      );
    }
  }

  /**
   * Get notification statistics
   */
  async getStatistics(): Promise<{
    totalSent: number;
    totalFailed: number;
    channels: Record<string, { sent: number; failed: number }>;
  }> {
    const entries = await this.getAuditEntries();

    const stats = {
      totalSent: 0,
      totalFailed: 0,
      channels: {} as Record<string, { sent: number; failed: number }>,
    };

    entries.forEach((entry) => {
      if (
        entry.action === 'notification_sent' ||
        entry.action === 'notification_failed'
      ) {
        const success = entry.details.success || false;

        if (success) {
          stats.totalSent++;
        } else {
          stats.totalFailed++;
        }

        // Count by channel
        if (entry.details.channels) {
          entry.details.channels.forEach((channel) => {
            if (!stats.channels[channel]) {
              stats.channels[channel] = { sent: 0, failed: 0 };
            }

            if (success) {
              stats.channels[channel].sent++;
            } else {
              stats.channels[channel].failed++;
            }
          });
        }
      }
    });

    return stats;
  }

  /**
   * Get notification history
   */
  async getHistory(limit: number = 100): Promise<AuditEntry[]> {
    const entries = await this.getAuditEntries();
    return entries.slice(-limit).reverse();
  }

  /**
   * Get audit entries from log file
   */
  private async getAuditEntries(): Promise<AuditEntry[]> {
    try {
      if (!fs.existsSync(this.auditLogPath)) {
        return [];
      }

      const content = fs.readFileSync(this.auditLogPath, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim());

      return lines.map((line) => {
        const entry = JSON.parse(line);
        return {
          ...entry,
          timestamp: new Date(entry.timestamp),
        };
      });
    } catch (error) {
      coreError(
        'Failed to read audit entries',
        'AUDIT_READ_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'notification:audit' }
      );
      return [];
    }
  }

  /**
   * Generate unique audit ID
   */
  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear audit log
   */
  async clearAuditLog(): Promise<void> {
    try {
      if (fs.existsSync(this.auditLogPath)) {
        fs.unlinkSync(this.auditLogPath);
      }
    } catch (error) {
      coreError(
        'Failed to clear audit log',
        'AUDIT_CLEAR_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'notification:audit' }
      );
    }
  }
}
