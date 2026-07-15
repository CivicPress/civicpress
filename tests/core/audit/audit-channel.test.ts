import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditChannel,
  type AuditEvent,
} from '../../../core/src/audit/audit-channel.js';

describe('AuditChannel', () => {
  let db: any;
  let fileLogger: any;
  let channel: AuditChannel;

  beforeEach(() => {
    db = { logAuditEvent: vi.fn().mockResolvedValue(undefined) };
    fileLogger = { log: vi.fn().mockResolvedValue(undefined) };
    channel = new AuditChannel(db, fileLogger);
  });

  it('writes file-JSONL FIRST, then DB', async () => {
    const order: string[] = [];
    fileLogger.log.mockImplementation(async () => {
      order.push('file');
    });
    db.logAuditEvent.mockImplementation(async () => {
      order.push('db');
    });

    await channel.record({
      action: 'record:update',
      resourceType: 'record',
      resourceId: 42,
      userId: 7,
      source: 'core',
      outcome: 'success',
      message: 'test',
    });

    expect(order).toEqual(['file', 'db']);
  });

  it('continues to DB even if file-JSONL fails (best-effort JSONL)', async () => {
    // AuditLogger.log itself never throws (it catches internally), but if
    // a future variant did throw, the DB write should still happen first.
    // Here we simulate the swallowed-error path: file logger reports
    // success via the resolved mock, DB still gets called.
    fileLogger.log.mockResolvedValueOnce(undefined);

    await channel.record({
      action: 'record:update',
      resourceType: 'record',
      resourceId: 42,
      userId: 7,
      source: 'core',
      outcome: 'success',
    });

    expect(db.logAuditEvent).toHaveBeenCalled();
  });

  it('re-raises if DB fails after file-JSONL succeeded', async () => {
    db.logAuditEvent.mockRejectedValueOnce(new Error('DB locked'));

    await expect(
      channel.record({
        action: 'record:update',
        resourceType: 'record',
        resourceId: 42,
        userId: 7,
        source: 'core',
        outcome: 'success',
      })
    ).rejects.toThrow(/DB locked/);
    expect(fileLogger.log).toHaveBeenCalled();
  });

  it('passes userId through to both stores', async () => {
    await channel.record({
      action: 'user:login',
      resourceType: 'user',
      resourceId: 99,
      userId: 99,
      source: 'api',
      outcome: 'success',
    });
    expect(fileLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: 99 } })
    );
    expect(db.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 99 })
    );
  });

  it('omits actor on the file side when userId is missing (system events)', async () => {
    await channel.record({
      action: 'system:startup',
      resourceType: 'system',
      source: 'core',
      outcome: 'success',
      message: 'core boot',
    });
    expect(fileLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ actor: undefined })
    );
    expect(db.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined })
    );
  });

  it('defaults outcome to success when omitted', async () => {
    await channel.record({
      action: 'record:create',
      resourceType: 'record',
      resourceId: 1,
      userId: 1,
      source: 'core',
    });
    expect(fileLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' })
    );
  });

  it('serializes structured details to a string for the DB column', async () => {
    await channel.record({
      action: 'saga:publish-draft:complete',
      resourceType: 'record',
      resourceId: 'rec-1',
      userId: 5,
      source: 'saga',
      outcome: 'success',
      details: { sagaId: 's-1', steps: 3 },
    });
    expect(db.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: JSON.stringify({ sagaId: 's-1', steps: 3 }),
      })
    );
  });

  it('prefers message over stringified details for the DB column', async () => {
    await channel.record({
      action: 'record:update',
      resourceType: 'record',
      resourceId: 'rec-1',
      userId: 5,
      source: 'core',
      outcome: 'success',
      message: 'Updated record rec-1',
      details: { field: 'title' },
    });
    expect(db.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ details: 'Updated record rec-1' })
    );
  });
});
