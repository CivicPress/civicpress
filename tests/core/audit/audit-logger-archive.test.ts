import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditLogger } from '../../../core/src/audit/audit-logger.js';
import { NotificationAudit } from '../../../core/src/notifications/notification-audit.js';

// Past the line limit the activity file is archived beside itself, not cut.
// It used to keep the newest 8,000 of 10,000 lines and delete the rest.

describe('AuditLogger rotation', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'civic-audit-archive-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('archives the oldest fifth, keeping the newest four fifths live, deleting nothing', async () => {
    const logger = new AuditLogger({ dir, maxEntries: 10 });
    for (let i = 1; i <= 11; i++) {
      await logger.log({
        source: 'core',
        action: `a:${i}`,
        outcome: 'success',
      });
    }
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(2);
    const archive = files.find((f) => f !== 'activity.log')!;
    expect(archive).toMatch(/^activity-\d{8}T\d{9}Z-\d{3}\.log$/);
    const archived = readFileSync(join(dir, archive), 'utf8')
      .trim()
      .split('\n');
    const live = readFileSync(join(dir, 'activity.log'), 'utf8')
      .trim()
      .split('\n');
    expect(archived.length + live.length).toBe(11);
    expect(live).toHaveLength(8); // four fifths of 10
    expect(JSON.parse(live[live.length - 1]).action).toBe('a:11');
    expect(JSON.parse(archived[0]).action).toBe('a:1');
    expect(logger.listArchives()).toEqual([join(dir, archive)]);
  });

  it('readEverything returns the archives then the live file, oldest first', async () => {
    const logger = new AuditLogger({ dir, maxEntries: 5 });
    for (let i = 1; i <= 13; i++) {
      await logger.log({
        source: 'core',
        action: `a:${i}`,
        outcome: 'success',
      });
    }
    const all = await logger.readEverything();
    expect(all.map((e) => e.action)).toEqual(
      Array.from({ length: 13 }, (_, i) => `a:${i + 1}`)
    );
    expect(logger.listArchives().length).toBeGreaterThanOrEqual(2);
  });

  it('the notification audit log archives the same way', async () => {
    const audit = new NotificationAudit(dir);
    (audit as unknown as { maxEntries: number }).maxEntries = 10;
    for (let i = 1; i <= 11; i++) {
      await audit.logNotification({
        id: `n${i}`,
        action: 'notification_sent',
        details: { success: true },
      });
    }
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('notification-audit'))
      .sort();
    expect(files).toHaveLength(2);
    expect(files.find((f) => f !== 'notification-audit.jsonl')).toMatch(
      /^notification-audit-\d{8}T\d{9}Z-\d{3}\.jsonl$/
    );
    const live = readFileSync(join(dir, 'notification-audit.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(live).toHaveLength(8);
  });
});
