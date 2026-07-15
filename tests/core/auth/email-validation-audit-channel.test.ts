import { describe, it, expect, vi } from 'vitest';
import { EmailValidationService } from '../../../core/src/auth/email-validation-service.js';
import { AuditChannel } from '../../../core/src/audit/audit-channel.js';
import type { DatabaseService } from '../../../core/src/database/database-service.js';
import type { AuditLogger } from '../../../core/src/audit/audit-logger.js';

describe('EmailValidationService → AuditChannel wire (Phase 2c.5 T4)', () => {
  it('routes writeAudit through the channel when injected', async () => {
    const dbLogSpy = vi.fn().mockResolvedValue(undefined);
    const fileLogSpy = vi.fn().mockResolvedValue(undefined);

    const mockDb = {
      logAuditEvent: dbLogSpy,
    } as unknown as DatabaseService;
    const mockFileLogger = {
      log: fileLogSpy,
    } as unknown as AuditLogger;

    const channel = new AuditChannel(mockDb, mockFileLogger);
    const channelSpy = vi.spyOn(channel, 'record');

    // completeEmailChange is heavy to mock end-to-end; we exercise the
    // private writeAudit helper directly via the prototype to pin the
    // contract that the channel is the path when injected.
    const svc = new EmailValidationService(mockDb, channel);
    await (svc as any).writeAudit({
      userId: 7,
      action: 'email_changed',
      resourceType: 'user_management',
      resourceId: '7',
      details: 'Email changed from a@b.c to x@y.z',
    });

    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy.mock.calls[0][0]).toMatchObject({
      action: 'email_changed',
      resourceType: 'user_management',
      resourceId: '7',
      userId: 7,
      source: 'core',
    });
    expect(fileLogSpy).toHaveBeenCalled();
    expect(dbLogSpy).toHaveBeenCalled();
  });

  it('falls back to db.logAuditEvent when no channel is injected', async () => {
    const dbLogSpy = vi.fn().mockResolvedValue(undefined);
    const mockDb = { logAuditEvent: dbLogSpy } as unknown as DatabaseService;

    const svc = new EmailValidationService(mockDb);
    await (svc as any).writeAudit({
      userId: 8,
      action: 'email_changed',
      resourceType: 'user_management',
      resourceId: '8',
      details: 'fallback path',
    });

    expect(dbLogSpy).toHaveBeenCalledWith({
      userId: 8,
      action: 'email_changed',
      resourceType: 'user_management',
      resourceId: '8',
      details: 'fallback path',
    });
  });
});
