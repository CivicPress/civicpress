import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createDatabaseAdapter,
  DatabaseAdapter,
} from '../database-adapter.js';

/**
 * Post-audit hardening batch 2: every SQLite connection must run with
 * foreign_keys=ON, journal_mode=WAL and busy_timeout=5000. Before this,
 * every ON DELETE CASCADE in the schema was inert (orphaned record_locks /
 * saga_resource_locks) and concurrent API+worker access failed straight
 * away with SQLITE_BUSY.
 */
describe('SQLiteAdapter connection pragmas', () => {
  let dir: string;
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'civic-pragmas-'));
    adapter = createDatabaseAdapter({
      type: 'sqlite',
      sqlite: { file: join(dir, 'test.db') },
    });
    await adapter.connect();
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sets foreign_keys, journal_mode and busy_timeout on connect', async () => {
    const [fk] = await adapter.query<{ foreign_keys: number }>(
      'PRAGMA foreign_keys'
    );
    expect(fk.foreign_keys).toBe(1);

    const [journal] = await adapter.query<{ journal_mode: string }>(
      'PRAGMA journal_mode'
    );
    expect(journal.journal_mode).toBe('wal');

    const [busy] = await adapter.query<{ timeout: number }>(
      'PRAGMA busy_timeout'
    );
    expect(busy.timeout).toBe(5000);
  });

  it('actually enforces foreign keys (orphan insert is rejected)', async () => {
    await expect(
      adapter.execute(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        ['deadbeef', 424242, new Date(Date.now() + 60_000).toISOString()]
      )
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('brings the declared ON DELETE CASCADEs to life (saga locks)', async () => {
    await adapter.execute(
      `INSERT INTO saga_states (id, saga_type, context, status, current_step, step_results, started_at, correlation_id)
       VALUES ('saga-1', 'TestSaga', '{}', 'executing', 0, '[]', ?, 'corr-1')`,
      [new Date().toISOString()]
    );
    await adapter.execute(
      `INSERT INTO saga_resource_locks (resource_key, saga_id, acquired_at, expires_at)
       VALUES ('record:r1', 'saga-1', ?, ?)`,
      [
        new Date().toISOString(),
        new Date(Date.now() + 60_000).toISOString(),
      ]
    );

    await adapter.execute("DELETE FROM saga_states WHERE id = 'saga-1'");

    const locks = await adapter.query(
      "SELECT * FROM saga_resource_locks WHERE saga_id = 'saga-1'"
    );
    expect(locks).toHaveLength(0);
  });

  it('record_locks carries NO FK — draft ids (no records row) must be lockable', async () => {
    await adapter.execute(
      "INSERT INTO record_locks (record_id, locked_by) VALUES ('draft-only-id', 'editor')"
    );
    const locks = await adapter.query(
      "SELECT * FROM record_locks WHERE record_id = 'draft-only-id'"
    );
    expect(locks).toHaveLength(1);
  });
});
