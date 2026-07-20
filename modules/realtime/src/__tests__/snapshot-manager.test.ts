/**
 * Unit Tests for SnapshotManager + snapshot storage (W4 persistence API)
 *
 * Covers persist / loadLatest / loadLatestVerified / cleanupExpired on the
 * manager, plus the row-shaped storage API (insert / loadLatestRow /
 * findOlderThan / deleteRow) on the filesystem backend. The database backend's
 * row API is exercised end-to-end by the real-SQLite harness below.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  SnapshotManager,
  SnapshotHookBus,
  SNAPSHOT_FORMAT_V1,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_TTL_MS,
  MAX_SNAPSHOT_VERSIONS_PER_ROOM,
} from '../persistence/snapshots.js';
import type { SnapshotRow } from '../persistence/snapshots.js';
import { DatabaseSnapshotStorage } from '../persistence/storage.js';
import { FilesystemSnapshotStorage } from '../persistence/storage.js';
import { DatabaseService } from '@civicpress/core';
import type { Logger } from '@civicpress/core';
import * as fs from 'fs/promises';
import { readFileSync } from 'node:fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// W4 test harness: a REAL in-memory SQLite DB running the actual realtime
// migration, wired to a real DatabaseSnapshotStorage + SnapshotManager.
//
// The W4 tests inspect the schema (PRAGMA table_info / index_list), corrupt
// rows in-place (UPDATE), and verify integrity/TTL behaviour end-to-end, so a
// mock storage adapter is insufficient — they need a genuine DB. core's
// DatabaseService runs over `:memory:` (sqlite3) directly; we connect the
// adapter (skipping the heavy core-table migration we don't need) and run the
// realtime migration SQL ourselves so the schema under test is the real one.
// ---------------------------------------------------------------------------

const MIGRATION_PATH = fileURLToPath(
  new URL('../persistence/migrations.sql', import.meta.url)
);

interface TestPersistenceDb {
  /** Run a SELECT/PRAGMA, returning all rows (plan-style `db.all`). */
  all<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]>;
  /** Run a mutating statement (plan-style `db.run(sql, ...params)`). */
  run(sql: string, ...params: unknown[]): Promise<void>;
}

interface TestPersistenceCtx {
  db: TestPersistenceDb;
  snapshotMgr: SnapshotManager;
  hookBus: SnapshotHookBus;
  close(): Promise<void>;
}

function quietLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isVerbose: () => false,
  } as unknown as Logger;
}

async function createTestPersistence(): Promise<TestPersistenceCtx> {
  const service = new DatabaseService({
    type: 'sqlite',
    sqlite: { file: ':memory:' },
  });
  // Connect the adapter directly: we only want the realtime_snapshots table,
  // not the full core schema that DatabaseService.initialize() would build.
  await service.getAdapter().connect();

  const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
  // sqlite3's run() executes a single statement; strip `-- ` line comments
  // first (so a leading comment block doesn't swallow the statement after it),
  // then split the migration on `;`.
  const statements = migrationSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await service.execute(stmt);
  }

  const logger = quietLogger();
  const storage = new DatabaseSnapshotStorage(service, logger);
  const hookBus = new SnapshotHookBus();
  const snapshotMgr = new SnapshotManager(logger, storage, hookBus);

  const db: TestPersistenceDb = {
    all: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      service.query<T>(sql, params as never[]),
    run: async (sql: string, ...params: unknown[]) => {
      await service.execute(sql, params as never[]);
    },
  };

  return {
    db,
    snapshotMgr,
    hookBus,
    close: async () => {
      await service.getAdapter().close();
    },
  };
}

// ===========================================================================
// FilesystemSnapshotStorage — W4 row-shaped API
//
// The DB backend's row API is covered end-to-end by the real-SQLite harness
// below; this block covers the filesystem backend's blob + .meta.json sidecar
// round-trip directly.
// ===========================================================================

describe('FilesystemSnapshotStorage (W4 row API)', () => {
  let storage: FilesystemSnapshotStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-snapshot-fs-test-')
    );
    storage = new FilesystemSnapshotStorage(testDir, quietLogger());
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const makeRow = (
    roomId: string,
    version: number,
    createdAt: number
  ): SnapshotRow => {
    const blob = new Uint8Array([version, 2, 3, 4]);
    return {
      room_id: roomId,
      version,
      snapshot_data: blob,
      integrity_hash: createHash('sha256').update(blob).digest('hex'),
      format_version: SNAPSHOT_FORMAT_V1,
      byte_size: blob.byteLength,
      created_at: createdAt,
    };
  };

  it('insert + loadLatestRow round-trips blob + metadata via the sidecar', async () => {
    const row = makeRow('records:r1', 1, Date.now());
    await storage.insert(row);

    const loaded = await storage.loadLatestRow('records:r1');
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.integrity_hash).toBe(row.integrity_hash);
    expect(loaded!.format_version).toBe(SNAPSHOT_FORMAT_V1);
    expect(loaded!.byte_size).toBe(row.byte_size);
    expect(Array.from(loaded!.snapshot_data)).toEqual(
      Array.from(row.snapshot_data)
    );
  });

  it('loadLatestRow returns the highest version when several exist', async () => {
    const now = Date.now();
    await storage.insert(makeRow('records:r1', 1, now - 1000));
    await storage.insert(makeRow('records:r1', 2, now));

    const loaded = await storage.loadLatestRow('records:r1');
    expect(loaded!.version).toBe(2);
  });

  it('loadLatestRow returns null for an unknown room', async () => {
    expect(await storage.loadLatestRow('records:nope')).toBeNull();
  });

  it('findOlderThan + deleteRow drop rows past a cutoff', async () => {
    const old = Date.now() - 10_000;
    await storage.insert(makeRow('records:old', 1, old));
    await storage.insert(makeRow('records:fresh', 1, Date.now()));

    const stale = await storage.findOlderThan(old + 1);
    expect(stale.map((r) => r.room_id)).toContain('records:old');
    expect(stale.map((r) => r.room_id)).not.toContain('records:fresh');

    await storage.deleteRow('records:old', 1);
    expect(await storage.loadLatestRow('records:old')).toBeNull();
  });

  it('listVersions returns a room-scoped, newest-first version list', async () => {
    const now = Date.now();
    await storage.insert(makeRow('records:r1', 1, now - 2000));
    await storage.insert(makeRow('records:r1', 3, now));
    await storage.insert(makeRow('records:r1', 2, now - 1000));
    await storage.insert(makeRow('records:other', 9, now));

    expect(await storage.listVersions('records:r1')).toEqual([3, 2, 1]);
    expect(await storage.listVersions('records:other')).toEqual([9]);
    expect(await storage.listVersions('records:nope')).toEqual([]);
  });

  it('prunes to the newest N on the filesystem backend too', async () => {
    const mgr = new SnapshotManager(quietLogger(), storage);
    for (let i = 0; i < MAX_SNAPSHOT_VERSIONS_PER_ROOM + 3; i++) {
      await mgr.persist({
        roomId: 'records:fs',
        blob: new Uint8Array([i, i, i]),
      });
    }
    expect(await storage.listVersions('records:fs')).toHaveLength(
      MAX_SNAPSHOT_VERSIONS_PER_ROOM
    );
  });
});

// ===========================================================================
// W4 — Persistence rework (spec §3e, realtime-005)
// ===========================================================================

describe('snapshot persistence schema (W4)', () => {
  it('has integrity_hash, format_version, byte_size, created_at columns', async () => {
    const ctx = await createTestPersistence();
    const cols = await ctx.db.all<{ name: string }>(
      `PRAGMA table_info('realtime_snapshots')`
    );
    const names = cols.map((c) => c.name);
    expect(names).toContain('integrity_hash');
    expect(names).toContain('format_version');
    expect(names).toContain('byte_size');
    expect(names).toContain('created_at');
    await ctx.close();
  });

  it('has an index on created_at for TTL cleanup queries', async () => {
    const ctx = await createTestPersistence();
    const indexes = await ctx.db.all<{ name: string }>(
      `PRAGMA index_list('realtime_snapshots')`
    );
    const names = indexes.map((i) => i.name);
    expect(names).toContain('realtime_snapshots_created_at_idx');
    await ctx.close();
  });
});

describe('snapshot integrity hash (W4)', () => {
  it('persists integrity_hash = sha256(snapshot_data)', async () => {
    const ctx = await createTestPersistence();
    const blob = new Uint8Array([1, 2, 3, 4, 5]);
    await ctx.snapshotMgr.persist({ roomId: 'records:r1', blob });

    const row = await ctx.snapshotMgr.loadLatest('records:r1');
    expect(row).toBeDefined();
    const expectedHash = createHash('sha256').update(blob).digest('hex');
    expect(row!.integrity_hash).toBe(expectedHash);
    expect(row!.format_version).toBe(SNAPSHOT_FORMAT_V1);
    expect(row!.byte_size).toBe(5);
    expect(row!.created_at).toBeGreaterThan(0);
    await ctx.close();
  });

  it('loadLatestVerified returns the row when the hash matches', async () => {
    const ctx = await createTestPersistence();
    const blob = new Uint8Array([9, 8, 7, 6]);
    await ctx.snapshotMgr.persist({ roomId: 'records:r1', blob });

    const row = await ctx.snapshotMgr.loadLatestVerified('records:r1');
    expect(row).not.toBeNull();
    expect(Array.from(row!.snapshot_data)).toEqual([9, 8, 7, 6]);
    await ctx.close();
  });

  it('loadLatestVerified returns null when hash does not match (corruption)', async () => {
    const ctx = await createTestPersistence();
    const blob = new Uint8Array([1, 2, 3]);
    await ctx.snapshotMgr.persist({ roomId: 'records:r1', blob });

    // Corrupt the stored hash in-place.
    await ctx.db.run(
      `UPDATE realtime_snapshots SET integrity_hash = 'invalid' WHERE room_id = ?`,
      'records:r1'
    );

    const result = await ctx.snapshotMgr.loadLatestVerified('records:r1');
    expect(result).toBeNull();
    await ctx.close();
  });

  it('fires realtime:snapshot:integrity-failed on corruption', async () => {
    const ctx = await createTestPersistence();
    const events: Array<{ roomId: string }> = [];
    ctx.hookBus.on('realtime:snapshot:integrity-failed', (e) =>
      events.push(e)
    );

    const blob = new Uint8Array([1, 2, 3]);
    await ctx.snapshotMgr.persist({ roomId: 'records:r1', blob });
    await ctx.db.run(
      `UPDATE realtime_snapshots SET integrity_hash = 'invalid' WHERE room_id = ?`,
      'records:r1'
    );

    await ctx.snapshotMgr.loadLatestVerified('records:r1');
    expect(events).toHaveLength(1);
    expect(events[0].roomId).toBe('records:r1');
    await ctx.close();
  });

  it('loadLatestVerified returns null when format_version is newer than supported', async () => {
    const ctx = await createTestPersistence();
    const blob = new Uint8Array([1, 2, 3]);
    await ctx.snapshotMgr.persist({ roomId: 'records:r1', blob });
    await ctx.db.run(
      `UPDATE realtime_snapshots SET format_version = 99 WHERE room_id = ?`,
      'records:r1'
    );

    const result = await ctx.snapshotMgr.loadLatestVerified('records:r1');
    expect(result).toBeNull();
    await ctx.close();
  });

  it('loadLatest returns null for an unknown room', async () => {
    const ctx = await createTestPersistence();
    const row = await ctx.snapshotMgr.loadLatest('records:nope');
    expect(row).toBeNull();
    await ctx.close();
  });
});

describe('snapshot oversize warning (W4)', () => {
  it('fires realtime:snapshot:oversize when blob > MAX_SNAPSHOT_BYTES', async () => {
    const ctx = await createTestPersistence();
    const events: Array<{ roomId: string; byteSize: number; cap: number }> = [];
    ctx.hookBus.on('realtime:snapshot:oversize', (e) => events.push(e));

    const big = new Uint8Array(MAX_SNAPSHOT_BYTES + 1024);
    await ctx.snapshotMgr.persist({ roomId: 'records:big', blob: big });

    expect(events).toHaveLength(1);
    expect(events[0].byteSize).toBe(big.byteLength);
    expect(events[0].cap).toBe(MAX_SNAPSHOT_BYTES);
    await ctx.close();
  });

  it('does NOT fire oversize for a blob at or under the cap', async () => {
    const ctx = await createTestPersistence();
    const events: Array<{ roomId: string }> = [];
    ctx.hookBus.on('realtime:snapshot:oversize', (e) => events.push(e));

    await ctx.snapshotMgr.persist({
      roomId: 'records:ok',
      blob: new Uint8Array(MAX_SNAPSHOT_BYTES),
    });

    expect(events).toHaveLength(0);
    await ctx.close();
  });

  it('persists the oversize blob anyway (does not drop)', async () => {
    const ctx = await createTestPersistence();
    const big = new Uint8Array(MAX_SNAPSHOT_BYTES + 1024);
    await ctx.snapshotMgr.persist({ roomId: 'records:big', blob: big });

    const row = await ctx.snapshotMgr.loadLatest('records:big');
    expect(row).not.toBeNull();
    expect(row!.byte_size).toBe(big.byteLength);
    await ctx.close();
  });
});

describe('snapshot TTL cleanup (W4)', () => {
  const expiredAt = (): number => Date.now() - SNAPSHOT_TTL_MS - 60_000;

  it('deletes rows older than SNAPSHOT_TTL_MS with no active room', async () => {
    const ctx = await createTestPersistence();
    const blob = new Uint8Array([1, 2, 3]);

    await ctx.snapshotMgr.persist({ roomId: 'records:old', blob });
    await ctx.db.run(
      `UPDATE realtime_snapshots SET created_at = ? WHERE room_id = ?`,
      expiredAt(),
      'records:old'
    );

    await ctx.snapshotMgr.persist({ roomId: 'records:fresh', blob });

    const deleted = await ctx.snapshotMgr.cleanupExpired({
      activeRoomIds: new Set(),
    });
    expect(deleted).toBe(1);

    expect(await ctx.snapshotMgr.loadLatest('records:old')).toBeNull();
    expect(await ctx.snapshotMgr.loadLatest('records:fresh')).not.toBeNull();
    await ctx.close();
  });

  it('skips rows whose room is currently active even if past TTL', async () => {
    const ctx = await createTestPersistence();
    const blob = new Uint8Array([1, 2, 3]);
    await ctx.snapshotMgr.persist({ roomId: 'records:active', blob });
    await ctx.db.run(
      `UPDATE realtime_snapshots SET created_at = ? WHERE room_id = ?`,
      expiredAt(),
      'records:active'
    );

    const deleted = await ctx.snapshotMgr.cleanupExpired({
      activeRoomIds: new Set(['records:active']),
    });
    expect(deleted).toBe(0);
    expect(await ctx.snapshotMgr.loadLatest('records:active')).not.toBeNull();
    await ctx.close();
  });

  it('does not delete fresh rows (within TTL)', async () => {
    const ctx = await createTestPersistence();
    const blob = new Uint8Array([1, 2, 3]);
    await ctx.snapshotMgr.persist({ roomId: 'records:fresh', blob });

    const deleted = await ctx.snapshotMgr.cleanupExpired({
      activeRoomIds: new Set(),
    });
    expect(deleted).toBe(0);
    expect(await ctx.snapshotMgr.loadLatest('records:fresh')).not.toBeNull();
    await ctx.close();
  });

  it('does NOT reclaim rows of an active room, however many pile up', async () => {
    // The reason retention has to live on the WRITE path: the TTL sweep skips
    // active rooms by design, so the busiest documents are exactly the ones it
    // can never reclaim. Retention (below) is what bounds them.
    const ctx = await createTestPersistence();
    for (let i = 0; i < 6; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:busy',
        blob: new Uint8Array([i]),
      });
    }
    await ctx.db.run(
      `UPDATE realtime_snapshots SET created_at = ? WHERE room_id = ?`,
      expiredAt(),
      'records:busy'
    );

    const deleted = await ctx.snapshotMgr.cleanupExpired({
      activeRoomIds: new Set(['records:busy']),
    });
    expect(deleted).toBe(0);
    await ctx.close();
  });

  it('fires realtime:snapshot:expired hook per deleted row', async () => {
    const ctx = await createTestPersistence();
    const events: Array<{ roomId: string }> = [];
    ctx.hookBus.on('realtime:snapshot:expired', (e) => events.push(e));

    const blob = new Uint8Array([1, 2, 3]);
    await ctx.snapshotMgr.persist({ roomId: 'records:e1', blob });
    await ctx.snapshotMgr.persist({ roomId: 'records:e2', blob });
    await ctx.db.run(
      `UPDATE realtime_snapshots SET created_at = ? WHERE room_id IN ('records:e1', 'records:e2')`,
      expiredAt()
    );

    await ctx.snapshotMgr.cleanupExpired({ activeRoomIds: new Set() });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.roomId).sort()).toEqual([
      'records:e1',
      'records:e2',
    ]);
    await ctx.close();
  });
});

// ===========================================================================
// Snapshot version retention (realtime-005 — "prune versions")
//
// persist() only ever INSERTS: `version` climbs monotonically and nothing
// overwrites. The TTL sweep above cannot bail it out, because it deliberately
// skips rooms that are still active — so a continuously-edited document
// accumulated one row (up to MAX_SNAPSHOT_BYTES each) per snapshot interval,
// forever. Retention on the write path is what bounds it.
// ===========================================================================

describe('snapshot version retention (realtime-005)', () => {
  const countRows = async (
    ctx: TestPersistenceCtx,
    roomId: string
  ): Promise<number> => {
    const rows = await ctx.db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM realtime_snapshots WHERE room_id = ?`,
      [roomId]
    );
    return Number(rows[0]?.n ?? 0);
  };

  it('keeps only the newest MAX_SNAPSHOT_VERSIONS_PER_ROOM rows per room', async () => {
    const ctx = await createTestPersistence();
    const writes = MAX_SNAPSHOT_VERSIONS_PER_ROOM + 5;
    for (let i = 0; i < writes; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:r1',
        blob: new Uint8Array([i, i, i]),
      });
    }

    expect(await countRows(ctx, 'records:r1')).toBe(
      MAX_SNAPSHOT_VERSIONS_PER_ROOM
    );
    await ctx.close();
  });

  it('keeps the NEWEST rows (the pruned tail is the old ones)', async () => {
    const ctx = await createTestPersistence();
    const writes = MAX_SNAPSHOT_VERSIONS_PER_ROOM + 2;
    for (let i = 0; i < writes; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:r1',
        blob: new Uint8Array([i, i, i]),
      });
    }

    const kept = await ctx.db.all<{ version: number }>(
      `SELECT version FROM realtime_snapshots WHERE room_id = ? ORDER BY version DESC`,
      ['records:r1']
    );
    const expected = Array.from(
      { length: MAX_SNAPSHOT_VERSIONS_PER_ROOM },
      (_, i) => writes - i
    );
    expect(kept.map((r) => r.version)).toEqual(expected);
    await ctx.close();
  });

  it('leaves the surviving latest snapshot verifiable (prune is not corruption)', async () => {
    const ctx = await createTestPersistence();
    for (let i = 0; i < MAX_SNAPSHOT_VERSIONS_PER_ROOM + 2; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:r1',
        blob: new Uint8Array([i, i, i]),
      });
    }

    const row = await ctx.snapshotMgr.loadLatestVerified('records:r1');
    expect(row).not.toBeNull();
    const last = MAX_SNAPSHOT_VERSIONS_PER_ROOM + 1;
    expect(Array.from(row!.snapshot_data)).toEqual([last, last, last]);
    await ctx.close();
  });

  it('is room-scoped (pruning one room never touches another)', async () => {
    const ctx = await createTestPersistence();
    await ctx.snapshotMgr.persist({
      roomId: 'records:quiet',
      blob: new Uint8Array([1]),
    });
    for (let i = 0; i < MAX_SNAPSHOT_VERSIONS_PER_ROOM + 4; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:busy',
        blob: new Uint8Array([i]),
      });
    }

    expect(await countRows(ctx, 'records:busy')).toBe(
      MAX_SNAPSHOT_VERSIONS_PER_ROOM
    );
    expect(await countRows(ctx, 'records:quiet')).toBe(1);
    await ctx.close();
  });

  it('fires realtime:snapshot:pruned per deleted row', async () => {
    const ctx = await createTestPersistence();
    const events: Array<{ roomId: string; version: number; keep: number }> = [];
    ctx.hookBus.on('realtime:snapshot:pruned', (e) => events.push(e));

    const writes = MAX_SNAPSHOT_VERSIONS_PER_ROOM + 3;
    for (let i = 0; i < writes; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:r1',
        blob: new Uint8Array([i]),
      });
    }

    // One prune per persist once the cap is reached: writes - cap deletions.
    expect(events).toHaveLength(writes - MAX_SNAPSHOT_VERSIONS_PER_ROOM);
    expect(events.every((e) => e.roomId === 'records:r1')).toBe(true);
    expect(events.map((e) => e.version)).toEqual([1, 2, 3]);
    expect(events[0].keep).toBe(MAX_SNAPSHOT_VERSIONS_PER_ROOM);
    await ctx.close();
  });

  it('does not prune below the cap', async () => {
    const ctx = await createTestPersistence();
    const events: Array<unknown> = [];
    ctx.hookBus.on('realtime:snapshot:pruned', (e) => events.push(e));

    for (let i = 0; i < MAX_SNAPSHOT_VERSIONS_PER_ROOM; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:r1',
        blob: new Uint8Array([i]),
      });
    }

    expect(events).toHaveLength(0);
    expect(await countRows(ctx, 'records:r1')).toBe(
      MAX_SNAPSHOT_VERSIONS_PER_ROOM
    );
    await ctx.close();
  });

  it('honours an explicit keep count', async () => {
    const ctx = await createTestPersistence();
    for (let i = 0; i < 5; i++) {
      await ctx.snapshotMgr.persist({
        roomId: 'records:r1',
        blob: new Uint8Array([i]),
      });
    }

    expect(await ctx.snapshotMgr.pruneVersions('records:r1', 1)).toBe(
      MAX_SNAPSHOT_VERSIONS_PER_ROOM - 1
    );
    expect(await countRows(ctx, 'records:r1')).toBe(1);
    await ctx.close();
  });

  it('a prune failure never fails the snapshot that was just written', async () => {
    // Losing a snapshot is strictly worse than keeping a stale row, so the
    // retention sweep is best-effort: persist() must still resolve.
    const ctx = await createTestPersistence();
    const logger = quietLogger();
    const exploding = new DatabaseSnapshotStorage(
      {
        query: async (sql: string) => {
          if (sql.startsWith('SELECT version')) {
            throw new Error('boom');
          }
          return [];
        },
      } as unknown as DatabaseService,
      logger
    );
    const mgr = new SnapshotManager(logger, exploding);

    await expect(
      mgr.persist({ roomId: 'records:r1', blob: new Uint8Array([1]) })
    ).resolves.toBeUndefined();
    await ctx.close();
  });
});
