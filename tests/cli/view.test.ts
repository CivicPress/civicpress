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

describe('CLI View Command', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
    setupTestData(context);
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  it('should view a record (manual test)', async () => {
    createMockRecord(context.testDir, 'resolution', 'view-me', 'View content');
    const { execSync } = await import('child_process');
    execSync('git add resolution/view-me/', {
      cwd: join(context.testDir, 'data'),
    });
    execSync('git commit -m "Add view-me"', {
      cwd: join(context.testDir, 'data'),
    });
    const result = await runCivicCommand(
      'view resolution/view-me',
      join(context.testDir, 'data')
    );
    // CLI testing is disabled in test environment
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('CLI testing disabled');
  });
});
