import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../core/src/database/database-service';
import { DatabaseConfig } from '../../core/src/database/database-adapter';
import {
  runSimpleColumnMigrations,
  ensureWorkflowStateColumn,
  listAppliedMigrations,
  type DDLExecutor,
} from '../../core/src/database/schema/migrations';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Migrations used to be made idempotent by catching the error a re-run would
 * raise — `catch { debug('already exists or migration not needed') }`. That
 * cannot tell a duplicate column apart from a locked database, a missing
 * table, or a broken statement, so all of them were swallowed at debug level
 * and initialization reported success against a schema the code above it did
 * not actually have.
 */
describe('Schema migration ledger', () => {
  let dbService: DatabaseService;
  let tempDir: string;
  let exec: DDLExecutor;

  const makeService = async (dir: string) => {
    const config: DatabaseConfig = {
      type: 'sqlite',
      sqlite: { file: path.join(dir, 'test.db') },
    };
    const svc = new DatabaseService(config);
    await svc.initialize();
    return svc;
  };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpress-migrations-'));
    dbService = await makeService(tempDir);
    exec = {
      query: (sql, params) => dbService.query(sql, params),
      execute: (sql, params) => dbService.execute(sql, params),
    };
  });

  afterEach(async () => {
    await dbService.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records every migration it ran, so the state is a fact on disk', async () => {
    const ledger = await listAppliedMigrations(exec);
    const ids = ledger.map((row) => row.id);

    expect(ids).toContain('records.linked_geography_files');
    expect(ids).toContain('records.workflow_state');
    expect(ids).toContain('users.provider_user_id');
    expect(ids).toContain('users.idx_provider_identity');
    expect(ids).toContain('search_index.word_count');

    // Nothing is recorded without an outcome.
    for (const row of ledger) {
      expect(['applied', 'adopted']).toContain(row.outcome);
    }
  });

  it('distinguishes a migration it EXECUTED from one whose shape it inherited', async () => {
    const ledger = await listAppliedMigrations(exec);
    const outcome = (id: string) => ledger.find((r) => r.id === id)?.outcome;

    // The records DDL already declares geography/attached_files/linked_records,
    // so a fresh database inherits those...
    expect(outcome('records.geography')).toBe('adopted');
    expect(outcome('records.attached_files')).toBe('adopted');

    // ...but NOT linked_geography_files, which is genuinely added by ALTER.
    // The split is what stops a pre-existing deployment from looking, on its
    // first run after the ledger landed, exactly like a fresh one.
    expect(outcome('records.linked_geography_files')).toBe('applied');
  });

  it('is idempotent: re-initializing adds no duplicate rows', async () => {
    const before = await listAppliedMigrations(exec);

    await dbService.close();
    dbService = await makeService(tempDir);
    exec = {
      query: (sql, params) => dbService.query(sql, params),
      execute: (sql, params) => dbService.execute(sql, params),
    };

    const after = await listAppliedMigrations(exec);
    expect(after.map((r) => r.id).sort()).toEqual(
      before.map((r) => r.id).sort()
    );
  });

  it('applies a genuinely missing column and records it as applied', async () => {
    // A legacy-shaped table: created WITHOUT the columns the schema later grew.
    await exec.execute('DROP TABLE records');
    await exec.execute(
      `CREATE TABLE records (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL
      )`
    );
    await exec.execute(
      "DELETE FROM schema_migrations WHERE id LIKE 'records.%'"
    );

    await runSimpleColumnMigrations(exec);

    const columns = await exec.query<{ name: string }>(
      'PRAGMA table_info(records)'
    );
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'geography',
        'attached_files',
        'linked_records',
        'linked_geography_files',
      ])
    );

    const ledger = await listAppliedMigrations(exec);
    expect(ledger.find((r) => r.id === 'records.geography')?.outcome).toBe(
      'applied'
    );
  });

  // The heart of it: a migration that fails must stop initialization, not log
  // at debug and let the caller proceed against a schema it does not have.
  describe('a genuine failure propagates', () => {
    const failingExec = (message: string): DDLExecutor => ({
      query: (sql, params) => {
        // Let the existence probes work so the migration gets as far as
        // attempting its ALTER, which is the call under test.
        if (sql.startsWith('PRAGMA table_info')) return Promise.resolve([]);
        return dbService.query(sql, params);
      },
      execute: (sql, params) => {
        if (sql.startsWith('ALTER TABLE')) {
          return Promise.reject(new Error(message));
        }
        return dbService.execute(sql, params);
      },
    });

    it('surfaces a failing ALTER instead of swallowing it', async () => {
      await expect(
        runSimpleColumnMigrations(failingExec('database is locked'))
      ).rejects.toThrow('database is locked');
    });

    it('surfaces a failing workflow_state migration', async () => {
      // This one used to catch its own error, log it, and RETURN — leaving
      // initialization "successful" with the column absent.
      await expect(
        ensureWorkflowStateColumn(failingExec('disk I/O error'), 'records')
      ).rejects.toThrow('disk I/O error');
    });

    it('throws when an ALTER reports success but the column is still absent', async () => {
      const lyingExec: DDLExecutor = {
        query: (sql) =>
          sql.startsWith('PRAGMA table_info')
            ? Promise.resolve([])
            : Promise.resolve([{ name: 'records' }]),
        execute: () => Promise.resolve({ changes: 0 } as never),
      };

      await expect(runSimpleColumnMigrations(lyingExec)).rejects.toThrow(
        /is still absent/
      );
    });

    it('refuses to skip a migration whose target table is missing', async () => {
      const noTableExec: DDLExecutor = {
        query: (sql) =>
          sql.startsWith('PRAGMA table_info')
            ? Promise.resolve([])
            : Promise.resolve([]), // sqlite_master lookup finds nothing
        execute: () => Promise.resolve({ changes: 0 } as never),
      };

      await expect(runSimpleColumnMigrations(noTableExec)).rejects.toThrow(
        /does not exist/
      );
    });
  });
});
