/**
 * Unit Tests for SnapshotManager
 *
 * Tests snapshot creation, loading, saving, versioning, and cleanup
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
} from '../persistence/snapshots.js';
import { DatabaseSnapshotStorage } from '../persistence/storage.js';
import { FilesystemSnapshotStorage } from '../persistence/storage.js';
import { DatabaseService } from '@civicpress/core';
import type { Logger } from '@civicpress/core';
import * as Y from 'yjs';
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

describe('SnapshotManager', () => {
  let snapshotManager: SnapshotManager;
  let mockLogger: Logger;
  let mockStorage: any;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-snapshot-test-')
    );
    await fs.mkdir(path.join(testDir, 'snapshots'), { recursive: true });

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      isVerbose: () => false,
    } as any;

    // Create mock storage
    mockStorage = {
      loadSnapshot: vi.fn(),
      saveSnapshot: vi.fn(),
      deleteSnapshot: vi.fn(),
    };

    snapshotManager = new SnapshotManager(mockLogger, mockStorage);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('createSnapshot', () => {
    it('should create snapshot from yjs document', () => {
      const yjsDoc = new Y.Doc();
      const yjsText = yjsDoc.getText('content');
      yjsText.insert(0, 'Test content');

      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc, 1);

      expect(snapshot.roomId).toBe('room-1');
      expect(snapshot.version).toBe(1);
      expect(snapshot.yjsState).toBeDefined();
      expect(snapshot.yjsState.length).toBeGreaterThan(0);
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it('should encode yjs document state correctly', () => {
      const yjsDoc1 = new Y.Doc();
      const yjsText1 = yjsDoc1.getText('content');
      yjsText1.insert(0, 'Content A');

      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc1, 1);

      // Decode and verify
      const yjsDoc2 = new Y.Doc();
      Y.applyUpdate(yjsDoc2, snapshot.yjsState);
      const yjsText2 = yjsDoc2.getText('content');
      expect(yjsText2.toString()).toBe('Content A');
    });

    it('should cache snapshot in memory', () => {
      const yjsDoc = new Y.Doc();
      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc, 1);

      // Should be cached
      const cached = (snapshotManager as any).snapshots.get('room-1');
      expect(cached).toBe(snapshot);
    });
  });

  describe('loadSnapshot', () => {
    it('should load snapshot from memory cache', async () => {
      const yjsDoc = new Y.Doc();
      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc, 1);

      const loaded = await snapshotManager.loadSnapshot('room-1');

      expect(loaded).toBe(snapshot);
      expect(mockStorage.loadSnapshot).not.toHaveBeenCalled();
    });

    it('should load snapshot from storage if not in memory', async () => {
      const yjsDoc = new Y.Doc();
      const yjsText = yjsDoc.getText('content');
      yjsText.insert(0, 'Stored content');
      const storedSnapshot = {
        roomId: 'room-1',
        yjsState: Y.encodeStateAsUpdate(yjsDoc),
        version: 1,
        timestamp: Date.now(),
      };

      mockStorage.loadSnapshot.mockResolvedValueOnce(storedSnapshot);

      const loaded = await snapshotManager.loadSnapshot('room-1');

      expect(loaded).toBeDefined();
      expect(loaded?.roomId).toBe('room-1');
      expect(loaded?.version).toBe(1);
      expect(mockStorage.loadSnapshot).toHaveBeenCalledWith('room-1');
    });

    it('should cache loaded snapshot in memory', async () => {
      const storedSnapshot = {
        roomId: 'room-1',
        yjsState: new Uint8Array([1, 2, 3]),
        version: 1,
        timestamp: Date.now(),
      };

      mockStorage.loadSnapshot.mockResolvedValueOnce(storedSnapshot);

      await snapshotManager.loadSnapshot('room-1');

      // Second load should use cache
      mockStorage.loadSnapshot.mockClear();
      const loaded = await snapshotManager.loadSnapshot('room-1');
      expect(loaded).toBeDefined();
      expect(mockStorage.loadSnapshot).not.toHaveBeenCalled();
    });

    it('should return null if snapshot not found', async () => {
      mockStorage.loadSnapshot.mockResolvedValueOnce(null);

      const loaded = await snapshotManager.loadSnapshot('non-existent');

      expect(loaded).toBeNull();
    });

    it('should handle storage errors gracefully', async () => {
      mockStorage.loadSnapshot.mockRejectedValueOnce(
        new Error('Storage error')
      );

      const loaded = await snapshotManager.loadSnapshot('room-1');

      expect(loaded).toBeNull();
    });
  });

  describe('saveSnapshot', () => {
    it('should save snapshot to storage', async () => {
      const yjsDoc = new Y.Doc();
      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc, 1);

      mockStorage.saveSnapshot.mockResolvedValueOnce(undefined);

      await snapshotManager.saveSnapshot(snapshot);

      expect(mockStorage.saveSnapshot).toHaveBeenCalledWith(snapshot);
    });

    it('should handle storage errors', async () => {
      const yjsDoc = new Y.Doc();
      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc, 1);

      mockStorage.saveSnapshot.mockRejectedValueOnce(
        new Error('Storage error')
      );

      await expect(snapshotManager.saveSnapshot(snapshot)).rejects.toThrow();
    });
  });

  describe('applySnapshot', () => {
    it('should apply snapshot to yjs document', () => {
      const yjsDoc1 = new Y.Doc();
      const yjsText1 = yjsDoc1.getText('content');
      yjsText1.insert(0, 'Original content');

      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc1, 1);

      // Create new document and apply snapshot
      const yjsDoc2 = new Y.Doc();
      snapshotManager.applySnapshot(yjsDoc2, snapshot);

      const yjsText2 = yjsDoc2.getText('content');
      expect(yjsText2.toString()).toBe('Original content');
    });

    it('should throw error for invalid snapshot data', () => {
      const yjsDoc = new Y.Doc();
      const invalidSnapshot = {
        roomId: 'room-1',
        yjsState: new Uint8Array([255, 255, 255]), // Invalid yjs data
        version: 1,
        timestamp: Date.now(),
      };

      expect(() => {
        snapshotManager.applySnapshot(yjsDoc, invalidSnapshot);
      }).toThrow();
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete snapshot from memory and storage', async () => {
      const yjsDoc = new Y.Doc();
      const snapshot = snapshotManager.createSnapshot('room-1', yjsDoc, 1);

      mockStorage.deleteSnapshot.mockResolvedValueOnce(undefined);

      await snapshotManager.deleteSnapshot('room-1');

      expect(mockStorage.deleteSnapshot).toHaveBeenCalledWith('room-1');
      const cached = (snapshotManager as any).snapshots.get('room-1');
      expect(cached).toBeUndefined();
    });

    it('should handle storage errors', async () => {
      mockStorage.deleteSnapshot.mockRejectedValueOnce(
        new Error('Storage error')
      );

      await expect(snapshotManager.deleteSnapshot('room-1')).rejects.toThrow();
    });
  });

  describe('cleanupOldSnapshots', () => {
    it('should remove snapshots older than threshold', async () => {
      const yjsDoc = new Y.Doc();
      const oldSnapshot = snapshotManager.createSnapshot('room-1', yjsDoc, 1);
      // Manually set old timestamp
      (oldSnapshot as any).timestamp = Date.now() - 60000; // 1 minute ago

      const newSnapshot = snapshotManager.createSnapshot('room-2', yjsDoc, 1);
      // Keep new timestamp (current time)

      mockStorage.deleteSnapshot.mockResolvedValue(undefined);

      await snapshotManager.cleanupOldSnapshots(30); // 30 second threshold

      expect(mockStorage.deleteSnapshot).toHaveBeenCalledWith('room-1');
      expect(mockStorage.deleteSnapshot).not.toHaveBeenCalledWith('room-2');
    });

    it('should not remove recent snapshots', async () => {
      const yjsDoc = new Y.Doc();
      snapshotManager.createSnapshot('room-1', yjsDoc, 1);
      snapshotManager.createSnapshot('room-2', yjsDoc, 1);

      mockStorage.deleteSnapshot.mockResolvedValue(undefined);

      await snapshotManager.cleanupOldSnapshots(300); // 5 minute threshold

      expect(mockStorage.deleteSnapshot).not.toHaveBeenCalled();
    });
  });
});

describe('DatabaseSnapshotStorage', () => {
  let storage: DatabaseSnapshotStorage;
  let mockLogger: Logger;
  let mockDatabase: DatabaseService;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-snapshot-db-test-')
    );

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      isVerbose: () => false,
    } as any;

    mockDatabase = {
      query: vi.fn(),
      execute: vi.fn(),
    } as any;

    storage = new DatabaseSnapshotStorage(mockDatabase, mockLogger);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadSnapshot', () => {
    it('should load snapshot from database', async () => {
      const yjsState = new Uint8Array([1, 2, 3, 4, 5]);
      (mockDatabase.query as any).mockResolvedValueOnce([
        {
          room_id: 'room-1',
          snapshot_data: Buffer.from(yjsState), // Note: field name is snapshot_data, not yjs_state
          version: 1,
          created_at: Date.now(),
        },
      ]);

      const snapshot = await storage.loadSnapshot('room-1');

      expect(snapshot).toBeDefined();
      expect(snapshot?.roomId).toBe('room-1');
      expect(snapshot?.version).toBe(1);
      // Convert Buffer to Uint8Array for comparison
      const snapshotState =
        snapshot?.yjsState instanceof Buffer
          ? new Uint8Array(snapshot.yjsState)
          : snapshot?.yjsState;
      expect(snapshotState).toEqual(yjsState);
    });

    it('should return null if snapshot not found', async () => {
      (mockDatabase.query as any).mockResolvedValueOnce([]);

      const snapshot = await storage.loadSnapshot('non-existent');

      expect(snapshot).toBeNull();
    });
  });

  describe('saveSnapshot', () => {
    it('should save snapshot to database', async () => {
      const yjsDoc = new Y.Doc();
      const snapshot = {
        roomId: 'room-1',
        yjsState: Y.encodeStateAsUpdate(yjsDoc),
        version: 1,
        timestamp: Date.now(),
      };

      (mockDatabase.query as any).mockResolvedValueOnce(undefined);

      await storage.saveSnapshot(snapshot);

      expect(mockDatabase.query).toHaveBeenCalled();
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete snapshot from database', async () => {
      (mockDatabase.query as any).mockResolvedValueOnce(undefined);

      await storage.deleteSnapshot('room-1');

      expect(mockDatabase.query).toHaveBeenCalled();
    });
  });
});

describe('FilesystemSnapshotStorage', () => {
  let storage: FilesystemSnapshotStorage;
  let mockLogger: Logger;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-snapshot-fs-test-')
    );
    await fs.mkdir(path.join(testDir, 'snapshots'), { recursive: true });

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      isVerbose: () => false,
    } as any;

    storage = new FilesystemSnapshotStorage(testDir, mockLogger);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('saveSnapshot', () => {
    it('should save snapshot to filesystem', async () => {
      const yjsDoc = new Y.Doc();
      const yjsText = yjsDoc.getText('content');
      yjsText.insert(0, 'Test content');
      const snapshot = {
        roomId: 'room-1',
        yjsState: Y.encodeStateAsUpdate(yjsDoc),
        version: 1,
        timestamp: Date.now(),
      };

      await storage.saveSnapshot(snapshot);

      const snapshotDir = path.join(testDir, 'realtime', 'snapshots', 'room-1');
      const files = await fs.readdir(snapshotDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toContain('room-1');
      expect(files[0]).toContain('1'); // version
      expect(files[0]).toMatch(/\.snapshot$/);
    });
  });

  describe('loadSnapshot', () => {
    it('should load snapshot from filesystem', async () => {
      const yjsDoc = new Y.Doc();
      const yjsText = yjsDoc.getText('content');
      yjsText.insert(0, 'Test content');
      const snapshot = {
        roomId: 'room-1',
        yjsState: Y.encodeStateAsUpdate(yjsDoc),
        version: 1,
        timestamp: Date.now(),
      };

      await storage.saveSnapshot(snapshot);

      const loaded = await storage.loadSnapshot('room-1');

      expect(loaded).toBeDefined();
      expect(loaded?.roomId).toBe('room-1');
      expect(loaded?.version).toBe(1);

      // Verify content
      const yjsDoc2 = new Y.Doc();
      Y.applyUpdate(yjsDoc2, loaded!.yjsState);
      const yjsText2 = yjsDoc2.getText('content');
      expect(yjsText2.toString()).toBe('Test content');
    });

    it('should return null if snapshot not found', async () => {
      const loaded = await storage.loadSnapshot('non-existent');
      expect(loaded).toBeNull();
    });

    it('should load latest snapshot when multiple exist', async () => {
      // Save multiple snapshots
      const yjsDoc1 = new Y.Doc();
      const yjsText1 = yjsDoc1.getText('content');
      yjsText1.insert(0, 'Version 1');
      await storage.saveSnapshot({
        roomId: 'room-1',
        yjsState: Y.encodeStateAsUpdate(yjsDoc1),
        version: 1,
        timestamp: Date.now() - 2000,
      });

      const yjsDoc2 = new Y.Doc();
      const yjsText2 = yjsDoc2.getText('content');
      yjsText2.insert(0, 'Version 2');
      await storage.saveSnapshot({
        roomId: 'room-1',
        yjsState: Y.encodeStateAsUpdate(yjsDoc2),
        version: 2,
        timestamp: Date.now(),
      });

      const loaded = await storage.loadSnapshot('room-1');

      expect(loaded).toBeDefined();
      expect(loaded?.version).toBe(2);

      // Verify it's version 2 content
      const yjsDoc3 = new Y.Doc();
      Y.applyUpdate(yjsDoc3, loaded!.yjsState);
      const yjsText3 = yjsDoc3.getText('content');
      expect(yjsText3.toString()).toBe('Version 2');
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete snapshot directory from filesystem', async () => {
      const yjsDoc = new Y.Doc();
      const snapshot = {
        roomId: 'room-1',
        yjsState: Y.encodeStateAsUpdate(yjsDoc),
        version: 1,
        timestamp: Date.now(),
      };

      await storage.saveSnapshot(snapshot);

      const snapshotDir = path.join(testDir, 'realtime', 'snapshots', 'room-1');
      let dirExists = false;
      try {
        await fs.access(snapshotDir);
        dirExists = true;
      } catch {
        dirExists = false;
      }
      expect(dirExists).toBe(true);

      await storage.deleteSnapshot('room-1');

      dirExists = false;
      try {
        await fs.access(snapshotDir);
        dirExists = true;
      } catch {
        dirExists = false;
      }
      expect(dirExists).toBe(false);
    });
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
