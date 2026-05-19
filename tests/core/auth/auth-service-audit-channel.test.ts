import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../../../core/src/auth/auth-service.js';
import { AuditChannel } from '../../../core/src/audit/audit-channel.js';
import type { DatabaseService } from '../../../core/src/database/database-service.js';
import type { AuditLogger } from '../../../core/src/audit/audit-logger.js';

describe('AuthService → AuditChannel wire (Phase 2c.5 T4)', () => {
  it('routes logAuthEvent through the unified AuditChannel when injected', async () => {
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

    const auth = new AuthService(mockDb, '/tmp/civic-test', channel);
    await auth.logAuthEvent(42, 'login_success', 'User logged in', '1.2.3.4');

    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy.mock.calls[0][0]).toMatchObject({
      action: 'login_success',
      resourceType: 'auth',
      userId: 42,
      source: 'core',
    });
    expect(fileLogSpy).toHaveBeenCalled();
    expect(dbLogSpy).toHaveBeenCalled();
  });

  it('falls back to db.logAuditEvent when no channel is injected (transitional safety)', async () => {
    const dbLogSpy = vi.fn().mockResolvedValue(undefined);
    const mockDb = { logAuditEvent: dbLogSpy } as unknown as DatabaseService;

    const auth = new AuthService(mockDb, '/tmp/civic-test');
    await auth.logAuthEvent(99, 'logout', 'User logged out');

    expect(dbLogSpy).toHaveBeenCalledWith({
      userId: 99,
      action: 'logout',
      resourceType: 'auth',
      details: 'User logged out',
      ipAddress: undefined,
    });
  });
});
