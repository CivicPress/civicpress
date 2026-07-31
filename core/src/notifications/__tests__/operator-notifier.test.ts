/**
 * OperatorNotifier + OperatorNotificationStore — the operator notification
 * center ("inbox"). Exercised against a real SQLite DatabaseService so the
 * actual SQL (dedupe, status transitions, unread counts) is covered.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseService } from '../../database/database-service.js';
import { OperatorNotifier } from '../operator-notifier.js';

describe('OperatorNotifier / operator notification center', () => {
  let dir: string;
  let db: DatabaseService;
  let notifier: OperatorNotifier;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'civic-opnotify-'));
    db = new DatabaseService({
      type: 'sqlite',
      sqlite: { file: join(dir, 'test.db') },
    });
    await db.initialize();
    notifier = new OperatorNotifier(db);
  });

  afterEach(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a notification and surfaces it as unread', async () => {
    const id = await notifier.systemError({
      title: 'Backup failed',
      body: 'disk full',
    });
    expect(id).toBeTypeOf('number');

    const { notifications, total, unread } = await notifier.list();
    expect(total).toBe(1);
    expect(unread).toBe(1);
    expect(notifications[0]).toMatchObject({
      type: 'system_error',
      severity: 'critical',
      title: 'Backup failed',
      status: 'unread',
    });
  });

  it('parses the JSON data payload back into an object', async () => {
    await notifier.passwordResetRequested({
      userId: 7,
      username: 'j.tremblay',
      email: 'j@example.org',
    });
    const { notifications } = await notifier.list();
    expect(notifications[0].type).toBe('password_reset_request');
    expect(notifications[0].severity).toBe('action');
    expect(notifications[0].data).toEqual({
      userId: 7,
      username: 'j.tremblay',
      email: 'j@example.org',
    });
  });

  it('never stores a reset token in the operator task', async () => {
    await notifier.passwordResetRequested({ userId: 1, username: 'a' });
    const { notifications } = await notifier.list();
    const blob = JSON.stringify(notifications[0]);
    expect(blob).not.toMatch(/token/i);
  });

  it('dedupes an active recurring signal, but not after dismissal', async () => {
    const first = await notifier.updateAvailable({ version: '2.0.0' });
    const second = await notifier.updateAvailable({ version: '2.0.0' });
    // Same active dedupe_key → collapses to the same row.
    expect(second).toBe(first);
    let list = await notifier.list();
    expect(list.total).toBe(1);

    // After dismissal, the next occurrence is a fresh, actionable row.
    await notifier.dismiss(first as number);
    const third = await notifier.updateAvailable({ version: '2.0.0' });
    expect(third).not.toBe(first);
    list = await notifier.list();
    expect(list.total).toBe(2);
  });

  it('markRead flips exactly one unread row and drops the unread count', async () => {
    const id = (await notifier.systemError({ title: 'x' })) as number;
    expect(await notifier.countUnread()).toBe(1);

    expect(await notifier.markRead(id)).toBe(true);
    expect(await notifier.countUnread()).toBe(0);
    // Idempotent: re-reading an already-read row changes nothing.
    expect(await notifier.markRead(id)).toBe(false);
  });

  it('markAllRead clears every unread notification', async () => {
    await notifier.systemError({ title: 'a' });
    await notifier.securityAlert({ title: 'b' });
    expect(await notifier.countUnread()).toBe(2);

    const changed = await notifier.markAllRead();
    expect(changed).toBe(2);
    expect(await notifier.countUnread()).toBe(0);
  });

  it('dismiss removes a row from the active feed and is idempotent', async () => {
    const id = (await notifier.systemError({ title: 'a' })) as number;
    expect(await notifier.dismiss(id)).toBe(true);
    expect(await notifier.dismiss(id)).toBe(false);

    const active = await notifier.list({ status: 'unread' });
    expect(active.total).toBe(0);
    const dismissed = await notifier.list({ status: 'dismissed' });
    expect(dismissed.total).toBe(1);
  });

  it('filters by status and type', async () => {
    await notifier.systemError({ title: 'err' });
    const secId = (await notifier.securityAlert({ title: 'sec' })) as number;
    await notifier.markRead(secId);

    const unread = await notifier.list({ status: 'unread' });
    expect(unread.notifications.map((n) => n.type)).toEqual(['system_error']);

    const security = await notifier.list({ type: 'security_alert' });
    expect(security.total).toBe(1);
    expect(security.notifications[0].status).toBe('read');
  });
});
