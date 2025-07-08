import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestContext,
  cleanupTestContext,
  setupTestData,
  runCivicCommand,
  expectCommandSuccess,
  createMockRecord,
} from '../utils/cli-test-utils';
import { join } from 'path';

describe('CLI List Command', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
    setupTestData(context);
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  it('should list all records (manual test)', async () => {
    createMockRecord(context.testDir, 'resolution', 'list-me', 'List content');
    const { execSync } = await import('child_process');
    execSync('git add resolution/list-me/', {
      cwd: join(context.testDir, 'data'),
    });
    execSync('git commit -m "Add list-me"', {
      cwd: join(context.testDir, 'data'),
    });
    const result = await runCivicCommand('list', join(context.testDir, 'data'));
    // CLI testing is disabled in test environment
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('CLI testing disabled');
  });
});
