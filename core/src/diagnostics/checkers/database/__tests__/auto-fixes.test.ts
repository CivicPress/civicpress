import { describe, it, expect, vi } from 'vitest';
import { fixMissingColumns } from '../auto-fixes.js';

// FA-CORE-005: the missing-column list + table name reach fixMissingColumns
// straight from the POST /diagnose/fix request body. They must never be
// interpolated raw into ALTER TABLE — only known search_index columns on the
// search_index table may be added.
function makeDeps() {
  const executed: string[] = [];
  const adapter = {
    execute: vi.fn(async (sql: string) => {
      executed.push(sql);
    }),
  };
  const databaseService = { getAdapter: () => adapter } as any;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
  return { executed, adapter, databaseService, logger };
}

describe('fixMissingColumns (FA-CORE-005)', () => {
  it('adds a known search_index column', async () => {
    const { executed, databaseService, logger } = makeDeps();
    await fixMissingColumns(databaseService, logger, ['word_count']);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toBe(
      'ALTER TABLE search_index ADD COLUMN word_count INTEGER'
    );
  });

  it('refuses an injection payload in the column name', async () => {
    const { executed, databaseService, logger } = makeDeps();
    await fixMissingColumns(databaseService, logger, [
      'x TEXT; DROP TABLE users; --',
    ]);
    expect(executed).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('refuses an unknown but syntactically-valid column', async () => {
    const { executed, databaseService, logger } = makeDeps();
    await fixMissingColumns(databaseService, logger, ['evil_column']);
    expect(executed).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('refuses to alter any table other than search_index', async () => {
    const { executed, databaseService, logger } = makeDeps();
    await fixMissingColumns(databaseService, logger, ['record_id'], 'users');
    expect(executed).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });
});
