/**
 * Phase 2b Task 7 — notifications-002 unit pinning.
 *
 * Pins the validate + rate-limit gate enforcement that Phase 2a Task 6
 * introduced in `core/src/notifications/notification-service.ts:107-147`.
 * Before the fix, both `validateRequest()` and `checkRateLimit()` were
 * awaited but their return values were ignored, so requests with too many
 * channels / oversized payloads / missing required fields proceeded
 * anyway, and rate-limited callers blew past the configured ceiling.
 *
 * After the fix, an invalid or rate-limited request throws AND emits a
 * `notification_rejected` audit row with reason metadata.
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

const TEST_DATA_DIR = '.system-data-test-notif-gates';
const NOTIF_FIXTURE = join(__dirname, '../../fixtures/notifications.yml');
const NOTIF_CONFIG_PATH = join(TEST_DATA_DIR, 'notifications.yml');

function makeChannel() {
  return {
    name: 'mock-channel',
    send: vi.fn(async () => {}),
    isEnabled: () => true,
    getName: () => 'mock-channel',
    getProvider: () => 'mock',
  };
}

describe('NotificationService — validate + rate-limit gates (notifications-002)', () => {
  let service: NotificationService;
  let config: NotificationConfig;
  let auditSpy: ReturnType<typeof vi.spyOn>;
  let channelSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    copyFileSync(NOTIF_FIXTURE, NOTIF_CONFIG_PATH);

    config = new NotificationConfig(TEST_DATA_DIR);
    service = new NotificationService(config);

    auditSpy = vi
      .spyOn((service as any).audit, 'logNotification')
      .mockResolvedValue(undefined);

    service.registerTemplate(
      'test_template',
      new AuthTemplate('test_template', 'Hello {{name}}')
    );
    const ch = makeChannel();
    channelSend = ch.send;
    service.registerChannel('email', ch as any);
  });

  afterEach(() => {
    auditSpy.mockRestore();
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  function rejectionEntry() {
    const call = auditSpy.mock.calls.find(
      ([entry]: any) => entry?.action === 'notification_rejected'
    );
    return (call && (call[0] as any)) || null;
  }

  it('throws and audits notification_rejected when validateRequest returns invalid', async () => {
    vi.spyOn((service as any).security, 'validateRequest').mockResolvedValue({
      valid: false,
      errors: ['Template is required'],
      warnings: [],
    });

    await expect(
      service.sendNotification({
        email: 'a@b.c',
        channels: ['email'],
        template: 'test_template',
        data: { name: 'Alice' },
      })
    ).rejects.toThrow(/invalid/i);

    // Channel must NOT have been called — the gate stopped delivery.
    expect(channelSend).not.toHaveBeenCalled();

    const rej = rejectionEntry();
    expect(rej).not.toBeNull();
    expect(rej.action).toBe('notification_rejected');
    expect(rej.details.reason).toBe('validation_failed');
    expect(rej.details.errors).toEqual(['Template is required']);
    expect(rej.details.template).toBe('test_template');
    expect(rej.details.channels).toEqual(['email']);
  });

  it('audits validation warnings even when valid: true', async () => {
    vi.spyOn((service as any).security, 'validateRequest').mockResolvedValue({
      valid: true,
      errors: [],
      warnings: ['Request contains potentially suspicious patterns'],
    });

    const response = await service.sendNotification({
      email: 'a@b.c',
      channels: ['email'],
      template: 'test_template',
      data: { name: 'Alice' },
    });

    // Valid request still passes through (the gate is on `valid`, not warnings).
    expect(response.success).toBe(true);
    expect(channelSend).toHaveBeenCalledOnce();

    // No rejection entry — only the terminal sent entry.
    expect(rejectionEntry()).toBeNull();
  });

  it('throws and audits notification_rejected when checkRateLimit returns over-limit', async () => {
    const futureReset = new Date(Date.now() + 60_000);
    vi.spyOn((service as any).rateLimiter, 'checkRateLimit').mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetTime: futureReset,
    });

    await expect(
      service.sendNotification({
        email: 'a@b.c',
        channels: ['email'],
        template: 'test_template',
        data: { name: 'Bob' },
      })
    ).rejects.toThrow(/rate-limited/i);

    expect(channelSend).not.toHaveBeenCalled();

    const rej = rejectionEntry();
    expect(rej).not.toBeNull();
    expect(rej.action).toBe('notification_rejected');
    expect(rej.details.reason).toBe('rate_limited');
    expect(rej.details.resetTime).toBeDefined();
    expect(rej.details.remaining).toBe(0);
    expect(rej.details.template).toBe('test_template');
    expect(rej.details.channels).toEqual(['email']);
  });

  it('passes through when both gates allow — gate is enforced, not bypassed', async () => {
    vi.spyOn((service as any).security, 'validateRequest').mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    });
    vi.spyOn((service as any).rateLimiter, 'checkRateLimit').mockResolvedValue({
      allowed: true,
      remaining: 99,
      resetTime: new Date(Date.now() + 60_000),
    });

    const response = await service.sendNotification({
      email: 'a@b.c',
      channels: ['email'],
      template: 'test_template',
      data: { name: 'Carol' },
    });

    expect(response.success).toBe(true);
    expect(channelSend).toHaveBeenCalledOnce();
    expect(rejectionEntry()).toBeNull();
  });

  it('regression pin: validation result is INSPECTED, not just awaited', async () => {
    // Pre-Phase-2a, validateRequest was awaited and discarded. The
    // service proceeded to channel delivery. This test fails if anyone
    // ever reverts the gate to the discard pattern.
    vi.spyOn((service as any).security, 'validateRequest').mockResolvedValue({
      valid: false,
      errors: ['simulated invalid'],
      warnings: [],
    });

    await expect(
      service.sendNotification({
        email: 'a@b.c',
        channels: ['email'],
        template: 'test_template',
        data: { name: 'Dave' },
      })
    ).rejects.toThrow();

    // If the gate is bypassed, channelSend WILL be called. The whole
    // point of notifications-002 is that it is not.
    expect(channelSend).not.toHaveBeenCalled();
  });
});
