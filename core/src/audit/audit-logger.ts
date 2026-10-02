import * as fs from 'fs';
import * as path from 'path';
import { getInstanceContext } from '../config/instance-context.js';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

/**
 * Minimal append-only JSONL audit logger for high-level actions.
 *
 * Writes to `<systemDataDir>/activity.log` — the instance's system-state
 * directory, alongside the database and secrets.
 *
 * ## Why the path is resolved lazily
 *
 * This used to default to the RELATIVE string `'.system-data'`, joined in the
 * constructor, so the destination was `<process.cwd()>/.system-data/activity.log`
 * — fixed at construction time, from whatever directory the process happened to
 * start in. Five API route modules build one at module scope
 * (`routes/config.ts`, `routes/notifications.ts`, `routes/audit.ts`,
 * `routes/records/handlers-common.ts`, `routes/users/handlers-common.ts`), i.e.
 * at import time, long before any instance context is installed. An eagerly
 * computed path can therefore never be right for them. Resolving per use means
 * the log always follows the instance that is actually current.
 *
 * That default also disagreed with core, which passed `{ dataDir: config.dataDir }`
 * and so wrote `<dataDir>/activity.log` — a third location. All three now agree
 * on `<systemDataDir>/activity.log`, which is where the bulk of the trail
 * already lived (the API's cwd default landed there whenever the process was
 * started from the instance root, which is the normal case and the one the
 * Docker image arranges). See docs/backlog/2026-07-post-audit-hardening.md.
 */
export class AuditLogger {
  /** Explicit destination directory; when unset the instance context decides. */
  private readonly dir?: string;
  private readonly fileName: string;
  private readonly maxEntries: number;
  // FA-CORE-004: track dropped audit writes so an invisible gap in the
  // trust/transparency trail (full disk, permissions) is observable rather
  // than merely logged-and-forgotten. With failFast the write also rethrows.
  private writeFailureCount = 0;
  private readonly failFast: boolean;

  constructor(options?: {
    /**
     * Directory to write the log into. Omit it — the instance context is the
     * right answer for every production caller. Deliberately NOT named
     * `dataDir`: that name is what led core to pass `config.dataDir` and split
     * the trail across two files.
     */
    dir?: string;
    fileName?: string;
    maxEntries?: number;
    failFast?: boolean;
  }) {
    this.dir = options?.dir;
    this.fileName = options?.fileName ?? 'activity.log';
    this.maxEntries = options?.maxEntries ?? 10000;
    this.failFast = options?.failFast ?? false;
  }

  /**
   * Resolved per use, never cached — see the class comment. An absolute path
   * from the instance context, so it cannot follow the working directory.
   */
  private get logPath(): string {
    return path.join(
      this.dir ?? getInstanceContext().systemDataDir,
      this.fileName
    );
  }

  /** Number of audit entries that failed to persist since construction. */
  getWriteFailureCount(): number {
    return this.writeFailureCount;
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
      this.writeFailureCount++;
      coreError(
        '[AuditLogger] Failed to write entry',
        'AUDIT_WRITE_FAILED',
        {
          error: err instanceof Error ? err.message : String(err),
          writeFailureCount: this.writeFailureCount,
        },
        { operation: 'audit:log' }
      );
      // Fail-fast callers (e.g. a strict compliance deployment) surface the
      // gap immediately; the default stays best-effort and never throws.
      if (this.failFast) {
        throw err instanceof Error
          ? err
          : new Error(`Audit write failed: ${String(err)}`);
      }
    }
  }

  /**
   * Past `maxEntries` lines, move the oldest fifth of the file into a dated
   * archive beside it and keep the newest four fifths as the live file — the
   * same 8,000 lines `tail()` could always see. Nothing is deleted: until
   * 2026-10-02 this rewrote the live file keeping those 8,000 and discarded
   * the rest, so the trail had a fixed horizon measured in events, not time.
   * The database table is the queryable trail; the archives are the on-disk
   * record of everything that was ever appended.
   */
  private async rotateIfNeeded(): Promise<void> {
    try {
      if (!fs.existsSync(this.logPath)) return;
      const lines = fs
        .readFileSync(this.logPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim());
      if (lines.length > this.maxEntries) {
        const keep = Math.floor(this.maxEntries * 0.8);
        const archived = lines.slice(0, lines.length - keep);
        const kept = lines.slice(-keep);
        fs.writeFileSync(this.archivePath(), archived.join('\n') + '\n');
        fs.writeFileSync(this.logPath, kept.join('\n') + '\n');
      }
    } catch (err) {
      this.writeFailureCount++;
      coreError(
        '[AuditLogger] Rotate failed',
        'AUDIT_ROTATE_FAILED',
        {
          error: err instanceof Error ? err.message : String(err),
          writeFailureCount: this.writeFailureCount,
        },
        { operation: 'audit:rotate' }
      );
    }
  }

  /**
   * `<dir>/<name>-<UTC stamp>-<seq>.<ext>`: the stamp to the millisecond and a
   * zero-padded sequence, so archives sort by name in the order they were
   * written — also when several rotations land in the same millisecond.
   */
  private archivePath(): string {
    const ext = path.extname(this.fileName);
    const base = path.basename(this.fileName, ext);
    const stamp = new Date().toISOString().replace(/[-:.]/g, '');
    const dir = path.dirname(this.logPath);
    for (let seq = 0; ; seq++) {
      const candidate = path.join(
        dir,
        `${base}-${stamp}-${String(seq).padStart(3, '0')}${ext}`
      );
      if (!fs.existsSync(candidate)) return candidate;
    }
  }

  /**
   * Every entry ever appended, oldest first: the dated archives, then the
   * live file. The complete on-disk trail, for an export or a forensic read;
   * the table is the one to query.
   */
  async readEverything(): Promise<ActivityLogEntry[]> {
    const out: ActivityLogEntry[] = [];
    for (const file of this.listArchives()) {
      out.push(...this.parseFile(file));
    }
    out.push(...(await this.readAll()));
    return out;
  }

  private parseFile(file: string): ActivityLogEntry[] {
    try {
      return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as ActivityLogEntry);
    } catch {
      return [];
    }
  }

  /** The dated archives beside the live file, oldest first. */
  listArchives(): string[] {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) return [];
    const ext = path.extname(this.fileName);
    const base = path.basename(this.fileName, ext);
    const prefix = `${base}-`;
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
      .sort()
      .map((f) => path.join(dir, f));
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
