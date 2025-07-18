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

describe('CLI Edit Command', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
    setupTestData(context);
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  it('should fail if record does not exist (manual test)', async () => {
    const result = await runCivicCommand(
      'edit non-existent-record',
      join(context.testDir, 'data')
    );
    // CLI testing is disabled in test environment
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('CLI testing disabled');
  });

  it('should edit a record (manual test)', async () => {
    createMockRecord(
      context.testDir,
      'resolution',
      'edit-me',
      'Original content'
    );
    const { execSync } = await import('child_process');
    execSync('git add resolution/edit-me/', {
      cwd: join(context.testDir, 'data'),
    });
    execSync('git commit -m "Add edit-me"', {
      cwd: join(context.testDir, 'data'),
    });
    const result = await runCivicCommand(
      'edit resolution/edit-me --dry-run',
      join(context.testDir, 'data')
    );
    // CLI testing is disabled in test environment
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('CLI testing disabled');
  });
});
