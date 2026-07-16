/**
 * Phase 2b Task 7 — notifications-001 unit pinning.
 *
 * Pins the truthful-audit-log behavior that Phase 2a Task 6 introduced
 * in `core/src/notifications/notification-service.ts:194-216`. Before the
 * fix, `success: true` was hardcoded in every audit entry regardless of
 * actual channel delivery (5,156 leftover entries on .system-data had
 * 0 failures recorded; 89% had empty channels arrays). After the fix,
 * the audit entry reflects the real Promise.allSettled outcome.
 *
 * This file replaces the verified-by-inspection assertion from Phase 2a
 * with executable tests.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from '../../fixtures/test-setup';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { NotificationService } from '../../../core/src/notifications/notification-service.js';
import { NotificationConfig } from '../../../core/src/notifications/notification-config.js';
import { AuthTemplate } from '../../../core/src/notifications/templates/auth-template.js';

const TEST_DATA_DIR = '.system-data-test-truthful-audit';
const NOTIF_FIXTURE = join(__dirname, '../../fixtures/notifications.yml');
const NOTIF_CONFIG_PATH = join(TEST_DATA_DIR, 'notifications.yml');

/**
 * Minimal channel double. `sendBehavior` controls whether the
 * NotificationService records the channel as sent or failed:
 *  - 'success' → channel.send() resolves
 *  - 'failure' → channel.send() rejects with the given error
 */
function makeChannel(
  sendBehavior: 'success' | 'failure',
  failureMessage = 'channel boom'
) {
  return {
    name: 'mock-channel',
    send: vi.fn(async () => {
      if (sendBehavior === 'failure') {
        throw new Error(failureMessage);
      }
    }),
    isEnabled: () => true,
    getName: () => 'mock-channel',
    getProvider: () => 'mock',
  };
}

describe('NotificationService — truthful audit log (notifications-001)', () => {
  let service: NotificationService;
  let config: NotificationConfig;
  let auditSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    copyFileSync(NOTIF_FIXTURE, NOTIF_CONFIG_PATH);

    config = new NotificationConfig(TEST_DATA_DIR);
    service = new NotificationService(config);

    // Replace the real audit's logNotification with a spy so we can read
    // back what would have been persisted without touching .system-data.
    auditSpy = vi
      .spyOn((service as any).audit, 'logNotification')
      .mockResolvedValue(undefined);

    // Register a real template — required by the service.
    const tpl = new AuthTemplate('test_template', 'Hello {{name}}');
    service.registerTemplate('test_template', tpl);
  });

  afterEach(() => {
    auditSpy.mockRestore();
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('records success: true and action notification_sent when all channels succeed', async () => {
    service.registerChannel('email', makeChannel('success') as any);

    const response = await service.sendNotification({
      email: 'recipient@example.com',
      channels: ['email'],
      template: 'test_template',
      data: { name: 'Alice' },
    });

    expect(response.success).toBe(true);
    expect(response.sentChannels).toEqual(['email']);
    expect(response.failedChannels).toEqual([]);

    // Find the terminal audit entry (the per-attempt one with channels in details).
    const sendCall = auditSpy.mock.calls.find(
      ([entry]: any) =>
        entry?.action === 'notification_sent' ||
        entry?.action === 'notification_partial_or_failed'
    );
    expect(sendCall).toBeDefined();
    const entry = sendCall![0] as any;
    expect(entry.action).toBe('notification_sent');
    expect(entry.details.success).toBe(true);
    expect(entry.details.partial).toBe(false);
    expect(entry.details.channels).toEqual(['email']);
    expect(entry.details.failedChannels).toEqual([]);
    expect(entry.details.errors).toBeUndefined();
    expect(entry.details.template).toBe('test_template');
  });

  it('a notification with NO recipient fails the channel (never silently "sent")', async () => {
    // Post-audit Tier-C: getChannelRecipient returns '' for a missing
    // address, and the old sendToChannel dispatched to '' and logged
    // success. It must fail the channel instead.
    service.registerChannel('email', makeChannel('success') as any);

    const response = await service.sendNotification({
      // no `email` field → blank recipient
      channels: ['email'],
      template: 'test_template',
      data: { name: 'Nobody' },
    });

    expect(response.success).toBe(false);
    expect(response.failedChannels).toEqual(['email']);
    expect(response.sentChannels).toEqual([]);
  });

  it('records success: false and action notification_partial_or_failed when the only channel fails', async () => {
    service.registerChannel(
      'email',
      makeChannel('failure', 'SMTP timeout') as any
    );

    const response = await service.sendNotification({
      email: 'recipient@example.com',
      channels: ['email'],
      template: 'test_template',
      data: { name: 'Bob' },
    });

    expect(response.success).toBe(false);
    expect(response.sentChannels).toEqual([]);
    expect(response.failedChannels).toEqual(['email']);

    const sendCall = auditSpy.mock.calls.find(
      ([entry]: any) =>
        entry?.action === 'notification_sent' ||
        entry?.action === 'notification_partial_or_failed'
    );
    expect(sendCall).toBeDefined();
    const entry = sendCall![0] as any;
    expect(entry.action).toBe('notification_partial_or_failed');
    expect(entry.details.success).toBe(false);
    expect(entry.details.partial).toBe(false);
    expect(entry.details.channels).toEqual([]);
    expect(entry.details.failedChannels).toEqual(['email']);
    expect(entry.details.errors?.length).toBe(1);
    expect(entry.details.errors[0]).toMatch(/email/);
    expect(entry.details.errors[0]).toMatch(/SMTP timeout/);
  });

  it('records partial: true when some channels succeed and some fail', async () => {
    service.registerChannel('email', makeChannel('success') as any);
    service.registerChannel(
      'sms',
      makeChannel('failure', 'no provider configured') as any
    );

    const response = await service.sendNotification({
      email: 'recipient@example.com',
      phone: '+15555550000',
      channels: ['email', 'sms'],
      template: 'test_template',
      data: { name: 'Carol' },
    });

    expect(response.success).toBe(true); // at least one channel succeeded
    expect(response.sentChannels).toEqual(['email']);
    expect(response.failedChannels).toEqual(['sms']);

    const sendCall = auditSpy.mock.calls.find(
      ([entry]: any) =>
        entry?.action === 'notification_sent' ||
        entry?.action === 'notification_partial_or_failed'
    );
    expect(sendCall).toBeDefined();
    const entry = sendCall![0] as any;
    expect(entry.action).toBe('notification_partial_or_failed');
    expect(entry.details.success).toBe(false); // success requires ZERO failures
    expect(entry.details.partial).toBe(true);
    expect(entry.details.channels).toEqual(['email']);
    expect(entry.details.failedChannels).toEqual(['sms']);
    expect(entry.details.errors?.length).toBe(1);
    expect(entry.details.errors[0]).toMatch(/sms/);
  });

  it('records the template name in every audit entry', async () => {
    service.registerChannel('email', makeChannel('success') as any);

    await service.sendNotification({
      email: 'recipient@example.com',
      channels: ['email'],
      template: 'test_template',
      data: { name: 'Dave' },
    });

    const sendCall = auditSpy.mock.calls.find(
      ([entry]: any) =>
        entry?.action === 'notification_sent' ||
        entry?.action === 'notification_partial_or_failed'
    );
    expect((sendCall![0] as any).details.template).toBe('test_template');
  });

  it('never hardcodes success: true — regression pin for the original notifications-001 symptom', async () => {
    // The audit's pre-fix behavior was to record success: true regardless
    // of channel outcome. This test fails if anyone ever wires that back
    // up: a known-failing channel must produce success: false.
    service.registerChannel(
      'email',
      makeChannel('failure', 'definitely broken') as any
    );

    await service.sendNotification({
      email: 'recipient@example.com',
      channels: ['email'],
      template: 'test_template',
      data: { name: 'Eve' },
    });

    const sendCall = auditSpy.mock.calls.find(
      ([entry]: any) =>
        entry?.action === 'notification_sent' ||
        entry?.action === 'notification_partial_or_failed'
    );
    const entry = sendCall![0] as any;
    expect(entry.details.success).not.toBe(true);
    expect(entry.details.success).toBe(false);
  });
});
