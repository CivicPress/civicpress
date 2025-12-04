import * as fs from 'fs';
import * as path from 'path';
import { coreError } from '../utils/core-output.js';

export type ActivityOutcome = 'success' | 'failure';
export type ActivitySource = 'api' | 'cli' | 'ui' | 'core';

export interface ActivityActor {
  id?: number | string;
  username?: string;
  role?: string;
}

export interface ActivityTarget {
  type: 'config' | 'user' | 'record' | 'system' | string;
  id?: string | number;
  name?: string;
  path?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string; // ISO string
  source: ActivitySource;
  actor?: ActivityActor;
  action: string; // e.g., config:save, users:update, records:create
  target?: ActivityTarget;
  outcome: ActivityOutcome;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Minimal append-only JSONL audit logger for high-level actions.
 * Writes to .system-data/activity.log by default.
 */
export class AuditLogger {
  private readonly logPath: string;
  private readonly maxEntries: number;

  constructor(options?: {
    dataDir?: string;
    fileName?: string;
    maxEntries?: number;
  }) {
    const dataDir = options?.dataDir ?? '.system-data';
    const fileName = options?.fileName ?? 'activity.log';
    this.logPath = path.join(dataDir, fileName);
    this.maxEntries = options?.maxEntries ?? 10000;
  }

  async log(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const line: ActivityLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };
    await this.append(line);
  }

  /**
   * Read and return latest N entries (newest first)
   */
  async tail(limit: number = 100): Promise<ActivityLogEntry[]> {
    const entries = await this.readAll();
    return entries.slice(-limit).reverse();
  }

  private async append(entry: ActivityLogEntry): Promise<void> {
    try {
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
      await this.rotateIfNeeded();
    } catch (err) {
      // Best-effort audit; never throw
      coreError(
        '[AuditLogger] Failed to write entry',
        'AUDIT_WRITE_FAILED',
        {
          error: err instanceof Error ? err.message : String(err),
        },
        { operation: 'audit:log' }
      );
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      if (!fs.existsSync(this.logPath)) return;
      const lines = fs
        .readFileSync(this.logPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim());
      if (lines.length > this.maxEntries) {
        const keep = Math.floor(this.maxEntries * 0.8);
        const kept = lines.slice(-keep);
        fs.writeFileSync(this.logPath, kept.join('\n') + '\n');
      }
    } catch (err) {
      coreError(
        '[AuditLogger] Rotate failed',
        'AUDIT_ROTATE_FAILED',
        {
          error: err instanceof Error ? err.message : String(err),
        },
        { operation: 'audit:rotate' }
      );
    }
  }

  private async readAll(): Promise<ActivityLogEntry[]> {
    try {
      if (!fs.existsSync(this.logPath)) return [];
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim());
      return lines.map((l) => JSON.parse(l));
    } catch (err) {
      coreError(
        '[AuditLogger] Read failed',
        'AUDIT_READ_FAILED',
        {
          error: err instanceof Error ? err.message : String(err),
        },
        { operation: 'audit:read' }
      );
      return [];
    }
  }

  private generateId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
