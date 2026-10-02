import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseService } from '../../../core/src/database/database-service.js';
import { AuditLogger } from '../../../core/src/audit/audit-logger.js';
import { AuditChannel } from '../../../core/src/audit/audit-channel.js';
import {
  rowToActivityEntry,
  backfillAuditLogsFromActivityFile,
} from '../../../core/src/audit/audit-entries.js';

// `audit_logs` as the Activity page reads it since 2026-10-02: the channel
// writes the file's fields into it, the reader filters it, and the file an
// instance already had is imported once.

describe('the durable audit trail', () => {
  let dir: string;
  let db: DatabaseService;
  let fileLogger: AuditLogger;
  let channel: AuditChannel;

  /** `audit_logs.user_id` is a foreign key: an actor id must be a real user. */
  const users: Record<string, number> = {};
  const user = async (username: string, role = 'clerk') =>
    (users[username] ??= await db.createUser({ username, role }));

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'civic-audit-db-'));
    db = new DatabaseService({
      type: 'sqlite',
      sqlite: { file: join(dir, 'test.db') },
    });
    await db.initialize();
    for (const key of Object.keys(users)) delete users[key];
    fileLogger = new AuditLogger({ dir });
    channel = new AuditChannel(db, fileLogger);
  });
  afterEach(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('channel.log keeps every field of the file entry in the table', async () => {
    const clerk = await user('clerk.a');
    await channel.log({
      source: 'api',
      actor: { id: clerk, username: 'clerk.a', role: 'clerk' },
      action: 'config:save',
      target: { type: 'config', id: 'org-config', name: 'Organisation' },
      outcome: 'failure',
      message: 'validation failed',
      metadata: { errors: ['name is required'] },
    });
    const { rows, total } = await db.queryAuditLogs();
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({
      user_id: clerk,
      action: 'config:save',
      resource_type: 'config',
      resource_id: 'org-config',
      source: 'api',
      outcome: 'failure',
      message: 'validation failed',
      actor_username: 'clerk.a',
      actor_role: 'clerk',
      target_name: 'Organisation',
    });
    expect(JSON.parse(rows[0].metadata as string)).toEqual({
      errors: ['name is required'],
    });
    // …and the file got the same entry.
    expect((await fileLogger.tail(1))[0]).toMatchObject({
      action: 'config:save',
      source: 'api',
    });
  });

  it('channel.record (core callers) fills the new columns too', async () => {
    const sam = await user('sam', 'admin');
    await channel.record({
      action: 'record:create',
      resourceType: 'record',
      resourceId: 'rec-1',
      userId: sam,
      source: 'core',
      details: { type: 'bylaw' },
      actor: { username: 'sam', role: 'admin' },
      target: { type: 'record', name: 'Noise bylaw' },
    });
    const { rows } = await db.queryAuditLogs();
    expect(rows[0]).toMatchObject({
      user_id: sam,
      source: 'core',
      outcome: 'success',
      actor_username: 'sam',
      actor_role: 'admin',
      target_name: 'Noise bylaw',
      resource_id: 'rec-1',
    });
  });

  it('a string actor id that is numeric is stored as the user id; a username-only actor keeps the name', async () => {
    const ops = await user('ops');
    await channel.log({
      source: 'cli',
      actor: { id: String(ops), username: 'ops' },
      action: 'config:import',
      outcome: 'success',
    });
    await channel.log({
      source: 'cli',
      actor: { username: 'script' },
      action: 'config:import',
      outcome: 'success',
    });
    const { rows } = await db.queryAuditLogs({ action: 'config:import' });
    expect(rows.map((r) => [r.user_id ?? null, r.actor_username])).toEqual([
      [null, 'script'],
      [ops, 'ops'],
    ]);
  });

  it('the reader filters by source, outcome, action and actor (id or username), and pages with a total', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push(await user(`user${i}`));
    for (let i = 0; i < 5; i++) {
      await channel.log({
        source: i % 2 ? 'api' : 'cli',
        actor: { id: ids[i], username: `user${i}` },
        action: i < 3 ? 'records:create' : 'users:update',
        outcome: i === 4 ? 'failure' : 'success',
      });
    }
    expect((await db.queryAuditLogs({ source: 'api' })).total).toBe(2);
    expect((await db.queryAuditLogs({ outcome: 'failure' })).total).toBe(1);
    expect((await db.queryAuditLogs({ action: 'records:create' })).total).toBe(
      3
    );
    expect((await db.queryAuditLogs({ actor: 'user2' })).total).toBe(1);
    expect((await db.queryAuditLogs({ actor: String(ids[3]) })).total).toBe(1);
    const page = await db.queryAuditLogs({}, { limit: 2, offset: 2 });
    expect(page.total).toBe(5);
    expect(page.rows).toHaveLength(2);
  });

  it('the reader filters by time, in the clock the table uses', async () => {
    await channel.log({
      source: 'core',
      action: 'system:boot',
      outcome: 'success',
    });
    const future = Date.now() + 60 * 60 * 1000;
    expect((await db.queryAuditLogs({ since: future })).total).toBe(0);
    expect((await db.queryAuditLogs({ before: future })).total).toBe(1);
    expect(
      (
        await db.queryAuditLogs({
          since: new Date(Date.now() - 60_000).toISOString(),
        })
      ).total
    ).toBe(1);
  });

  it('maps a row back to the entry shape the page renders, including rows from before the columns existed', async () => {
    const clerk = await user('clerk.a');
    await channel.log({
      source: 'api',
      actor: { id: clerk, username: 'clerk.a', role: 'clerk' },
      action: 'records:update',
      target: { type: 'record', id: 'rec-9', name: 'Zoning' },
      outcome: 'success',
      message: 'updated',
      metadata: { fields: ['title'] },
    });
    // A legacy row: only the old columns.
    await db.logAuditEvent({
      userId: clerk,
      action: 'legacy:action',
      resourceType: 'record',
      resourceId: 'rec-0',
      details: 'old message',
    });
    const { rows } = await db.queryAuditLogs({}, { limit: 10 });
    const entries = rows.map(rowToActivityEntry);
    const modern = entries.find((e) => e.action === 'records:update')!;
    expect(modern).toMatchObject({
      source: 'api',
      actor: { id: clerk, username: 'clerk.a', role: 'clerk' },
      target: { type: 'record', id: 'rec-9', name: 'Zoning' },
      outcome: 'success',
      message: 'updated',
      metadata: { fields: ['title'] },
    });
    expect(modern.id).toMatch(/^db_\d+$/);
    expect(Date.parse(modern.timestamp)).toBeGreaterThan(Date.now() - 60_000);
    const legacy = entries.find((e) => e.action === 'legacy:action')!;
    expect(legacy).toMatchObject({
      source: 'core',
      outcome: 'success',
      message: 'old message',
    });
  });

  it('imports the activity file once, and never twice', async () => {
    const admin = await user('admin', 'admin');
    // What an upgraded instance has: a file written by the old file-only loggers.
    writeFileSync(
      join(dir, 'activity.log'),
      [
        JSON.stringify({
          id: 'act_1',
          timestamp: '2026-08-01T10:00:00.000Z',
          source: 'api',
          actor: { id: 1, username: 'admin' },
          action: 'config:save',
          target: { type: 'config', id: 'roles' },
          outcome: 'success',
        }),
        JSON.stringify({
          id: 'act_2',
          timestamp: '2026-08-02T10:00:00.000Z',
          source: 'cli',
          action: 'config:import',
          outcome: 'failure',
          message: 'bad yaml',
        }),
        '',
      ].join('\n')
    );
    expect(await backfillAuditLogsFromActivityFile(db, fileLogger)).toBe(2);
    const { rows, total } = await db.queryAuditLogs();
    expect(total).toBe(2);
    expect(rows.map((r) => r.action)).toEqual(['config:import', 'config:save']);
    expect(rows[1]).toMatchObject({
      user_id: 1,
      actor_username: 'admin',
      source: 'api',
      created_at: '2026-08-01 10:00:00',
    });
    // Second start: the table has channel rows, nothing is imported again.
    expect(await backfillAuditLogsFromActivityFile(db, fileLogger)).toBe(0);
    expect((await db.queryAuditLogs()).total).toBe(2);
  });

  it('imports only what predates the first channel row — later file entries are already in the table', async () => {
    await channel.log({
      source: 'core',
      action: 'system:boot',
      outcome: 'success',
    });
    writeFileSync(
      join(dir, 'activity.log'),
      [
        JSON.stringify({
          id: 'old',
          timestamp: '2026-08-01T10:00:00.000Z',
          source: 'cli',
          action: 'config:import',
          outcome: 'success',
        }),
        JSON.stringify({
          id: 'new',
          timestamp: new Date(Date.now() + 60_000).toISOString(),
          source: 'api',
          action: 'config:save',
          outcome: 'success',
        }),
        '',
      ].join('\n')
    );
    expect(await backfillAuditLogsFromActivityFile(db, fileLogger)).toBe(1);
    const { rows } = await db.queryAuditLogs();
    expect(rows.map((r) => r.action).sort()).toEqual([
      'config:import',
      'system:boot',
    ]);
  });

  it('runs once per database — the ledger remembers, even when nothing was imported', async () => {
    expect(await backfillAuditLogsFromActivityFile(db, fileLogger)).toBe(0);
    writeFileSync(
      join(dir, 'activity.log'),
      JSON.stringify({
        id: 'late',
        timestamp: '2026-08-01T10:00:00.000Z',
        source: 'cli',
        action: 'config:import',
        outcome: 'success',
      }) + '\n'
    );
    expect(await backfillAuditLogsFromActivityFile(db, fileLogger)).toBe(0);
    expect((await db.queryAuditLogs()).total).toBe(0);
  });

  it('does not import the core and saga events the table already holds — those went to both sinks', async () => {
    const admin = await user('admin', 'admin');
    // A legacy core row (written by AuditChannel.record before the columns existed).
    await db.logAuditEvent({
      userId: admin,
      action: 'create_record',
      resourceType: 'record',
      resourceId: 'rec-1',
      details: 'created',
    });
    writeFileSync(
      join(dir, 'activity.log'),
      [
        JSON.stringify({
          id: 'act_1',
          timestamp: '2026-08-01T10:00:00.000Z',
          source: 'core',
          actor: { id: admin },
          action: 'create_record',
          target: { type: 'record', id: 'rec-1' },
          outcome: 'success',
          message: 'created',
        }),
        JSON.stringify({
          id: 'act_2',
          timestamp: '2026-08-01T10:00:01.000Z',
          source: 'saga',
          action: 'saga:publish-draft:start',
          outcome: 'success',
        }),
        JSON.stringify({
          id: 'act_3',
          timestamp: '2026-08-01T10:00:02.000Z',
          source: 'api',
          actor: { id: admin, username: 'admin' },
          action: 'config:save',
          outcome: 'success',
        }),
        '',
      ].join('\n')
    );
    expect(await backfillAuditLogsFromActivityFile(db, fileLogger)).toBe(1);
    const { rows } = await db.queryAuditLogs();
    expect(rows.map((r) => r.action).sort()).toEqual([
      'config:save',
      'create_record',
    ]);
  });

  it('record() keeps userId when the actor carries only a username', async () => {
    const sam = await user('sam', 'admin');
    await channel.record({
      action: 'record:archive',
      resourceType: 'record',
      resourceId: 'rec-2',
      userId: sam,
      source: 'core',
      actor: { username: 'sam' },
    });
    const { rows } = await db.queryAuditLogs({ action: 'record:archive' });
    expect(rows[0]).toMatchObject({ user_id: sam, actor_username: 'sam' });
  });
});
