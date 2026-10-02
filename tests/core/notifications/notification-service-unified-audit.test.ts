import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NotificationService } from '../../../core/src/notifications/notification-service.js';
import { NotificationConfig } from '../../../core/src/notifications/notification-config.js';
import { AuthTemplate } from '../../../core/src/notifications/templates/auth-template.js';
import type { AuditChannel } from '../../../core/src/audit/audit-channel.js';
import { randomBytes } from 'crypto';

// `security.audit_all_notifications` — every send attempt is mirrored into
// the unified audit trail: channels, template, outcome, a hash of the
// recipient. Never the message, never the address.

function configWith(dir: string, auditAll: boolean): NotificationConfig {
  writeFileSync(
    join(dir, 'notifications.yml'),
    [
      'channels:',
      '  email:',
      '    enabled: true',
      '    provider: smtp',
      'security:',
      `  audit_all_notifications: ${auditAll}`,
      '  filter_pii: true',
      '  encrypt_sensitive_data: true',
      '',
    ].join('\n')
  );
  return new NotificationConfig(dir);
}

function fakeChannel(ok: boolean) {
  return {
    getName: () => 'email',
    isEnabled: () => true,
    send: vi.fn(async () => {
      if (!ok) throw new Error('550 <lea@town.example> User unknown');
      return { success: true, messageId: 'm1' };
    }),
  } as never;
}

describe('NotificationService → unified audit trail', () => {
  let dir: string;
  let record: ReturnType<typeof vi.fn>;
  let auditChannel: AuditChannel;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'civic-notif-unified-'));
    record = vi.fn().mockResolvedValue(undefined);
    auditChannel = { record } as unknown as AuditChannel;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const recipientKey = randomBytes(32);
  function service(auditAll: boolean, channelOk = true, keyed = true) {
    const svc = new NotificationService(configWith(dir, auditAll), {
      auditChannel,
      recipientKey: () => (keyed ? recipientKey : undefined),
    });
    vi.spyOn(
      (svc as never as { audit: { logNotification: () => Promise<void> } })
        .audit,
      'logNotification'
    ).mockResolvedValue(undefined);
    svc.registerChannel('email', fakeChannel(channelOk));
    svc.registerTemplate(
      'hello',
      new AuthTemplate('hello', 'Hi {{name}}', 'Hello')
    );
    return svc;
  }

  it('records a successful send without the message or the address', async () => {
    await service(true).sendNotification({
      email: 'Lea@Town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'Léa' },
    });
    expect(record).toHaveBeenCalledTimes(1);
    const event = record.mock.calls[0][0];
    expect(event).toMatchObject({
      action: 'notification:send',
      resourceType: 'notification',
      source: 'core',
      outcome: 'success',
      details: {
        template: 'hello',
        channels: ['email'],
        sentChannels: ['email'],
        failedChannels: [],
      },
    });
    expect(event.details.recipient).toMatch(/^[0-9a-f]{16}$/);
    const serialized = JSON.stringify(event);
    expect(serialized).not.toMatch(/town\.example/i);
    expect(serialized).not.toContain('Léa');
    expect(serialized).not.toContain('Hi ');
  });

  it('hashes the recipient the same way each time, case-insensitively', async () => {
    const svc = service(true);
    await svc.sendNotification({
      email: 'lea@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'a' },
    });
    await svc.sendNotification({
      email: 'LEA@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'b' },
    });
    expect(record.mock.calls[0][0].details.recipient).toBe(
      record.mock.calls[1][0].details.recipient
    );
  });

  it('records a failed delivery as a failure, still without the address the error quoted', async () => {
    await service(true, false).sendNotification({
      email: 'lea@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'x' },
    });
    const event = record.mock.calls[0][0];
    expect(event.outcome).toBe('failure');
    expect(event.details.failedChannels).toEqual(['email']);
    expect(JSON.stringify(event)).not.toContain('lea@');
  });

  it('records a rejected request', async () => {
    await expect(
      service(true).sendNotification({
        email: 'lea@town.example',
        channels: ['email'],
        template: 'missing-template-name',
        data: {},
      })
    ).rejects.toThrow();
    // Template-not-found happens after validation; a validation failure is
    // the rejected case that is recorded.
    await expect(
      service(true).sendNotification({
        channels: [],
        template: 'hello',
        data: {},
      } as never)
    ).rejects.toThrow(/invalid/);
    const rejected = record.mock.calls.find(
      ([e]) => e.details?.reason === 'validation_failed'
    );
    expect(rejected?.[0].outcome).toBe('failure');
  });

  it('records no recipient at all without a hashing key — never an unkeyed hash', async () => {
    await service(true, true, false).sendNotification({
      email: 'lea@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'x' },
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].details).not.toHaveProperty('recipient');
  });

  it('hashes under the key, so another key gives another hash', async () => {
    const other = new NotificationService(configWith(dir, true), {
      auditChannel,
      recipientKey: () => randomBytes(32),
    });
    other.registerChannel('email', fakeChannel(true));
    other.registerTemplate(
      'hello',
      new AuthTemplate('hello', 'Hi {{name}}', 'Hello')
    );
    await other.sendNotification({
      email: 'lea@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'a' },
    });
    await service(true).sendNotification({
      email: 'lea@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'a' },
    });
    expect(record.mock.calls[0][0].details.recipient).not.toBe(
      record.mock.calls[1][0].details.recipient
    );
  });

  it('records an attempt that failed before delivery — a missing template — in both audits', async () => {
    const svc = service(true);
    const audit = (
      svc as never as {
        audit: { logNotification: (e: unknown) => Promise<void> };
      }
    ).audit;
    const fileAudit = vi
      .spyOn(audit, 'logNotification')
      .mockResolvedValue(undefined);
    await expect(
      svc.sendNotification({
        email: 'lea@town.example',
        channels: ['email'],
        template: 'nope',
        data: {},
      })
    ).rejects.toThrow(/Template not found/);
    const unified = record.mock.calls.find(
      ([e]) => e.details?.reason === 'send_failed'
    );
    expect(unified?.[0].outcome).toBe('failure');
    expect(JSON.stringify(unified?.[0])).not.toContain('lea@');
    expect(fileAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notification_failed' })
    );
  });

  it('records nothing when the key is off', async () => {
    await service(false).sendNotification({
      email: 'lea@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'x' },
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('does not turn a delivered email into a failure when the trail cannot be written', async () => {
    record.mockRejectedValue(new Error('audit_logs is locked'));
    const result = await service(true).sendNotification({
      email: 'lea@town.example',
      channels: ['email'],
      template: 'hello',
      data: { name: 'x' },
    });
    expect(result.success).toBe(true);
  });
});
