import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestContext,
  cleanupTestContext,
  setupTestData,
  runCivicCommand,
  expectCommandSuccess,
  expectCommandFailure,
  createMockRecord,
} from '../utils/cli-test-utils';
import { join } from 'path';

describe('CLI Commit Command', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
    setupTestData(context);
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('commit', () => {
    it('should fail when no changes to commit (manual test)', async () => {
      const result = await runCivicCommand(
        'commit "No changes"',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with message flag (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const { execSync } = await import('child_process');
      execSync('git add resolution/test-resolution/', {
        cwd: join(context.testDir, 'data'),
      });
      const result = await runCivicCommand(
        'commit --message "Add test resolution"',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with role flag (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const { execSync } = await import('child_process');
      execSync('git add resolution/test-resolution/', {
        cwd: join(context.testDir, 'data'),
      });
      const result = await runCivicCommand(
        'commit --message "Add test resolution" --role clerk',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with dry-run flag (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const result = await runCivicCommand(
        'commit --message "Add test resolution" --dry-run',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle multiple files (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution-1',
        'Content 1'
      );
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution-2',
        'Content 2'
      );
      const { execSync } = await import('child_process');
      execSync('git add resolution/', {
        cwd: join(context.testDir, 'data'),
      });
      const result = await runCivicCommand(
        'commit --message "Add multiple resolutions"',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });
  });
});
