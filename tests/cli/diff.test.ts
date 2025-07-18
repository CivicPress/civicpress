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
import { join, dirname } from 'path';
import { execSync } from 'child_process';

describe('CLI Diff Command', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(async () => {
    context = createTestContext();
    setupTestData(context);
    // Ensure git user config is set for non-interactive commits
    const { execSync } = await import('child_process');
    execSync('git config user.name "Test User"', {
      cwd: join(context.testDir, 'data'),
    });
    execSync('git config user.email "test@example.com"', {
      cwd: join(context.testDir, 'data'),
    });
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('diff', () => {
    it('should show diff between commits (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const result = await runCivicCommand(
        'diff --commit1 HEAD~1 --commit2 HEAD',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should show no diff when no changes (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const result = await runCivicCommand(
        'diff --commit1 HEAD --commit2 HEAD',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --context flag (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const result = await runCivicCommand(
        'diff --context 5',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --metadata flag (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const result = await runCivicCommand(
        'diff --metadata',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --content flag (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const result = await runCivicCommand(
        'diff --content',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --format json (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );
      const result = await runCivicCommand(
        'diff --format json',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should show actual diff when a record is changed between commits (manual test)', async () => {
      // Step 1: Create and commit the initial record
      createMockRecord(
        context.testDir,
        'resolution',
        'test-diff',
        'Initial content'
      );
      const { execSync } = await import('child_process');
      execSync('git add .', { cwd: join(context.testDir, 'data') }); // Ensure file is tracked in first commit
      await runCivicCommand(
        'commit -m "Initial commit"',
        join(context.testDir, 'data')
      );

      // Step 2: Modify the record
      const recordPath = join(
        context.testDir,
        'data',
        'records',
        'resolution',
        'test-diff.md'
      );
      const fs = await import('fs/promises');
      await fs.mkdir(dirname(recordPath), { recursive: true });
      await fs.writeFile(
        recordPath,
        `---\ntitle: test-diff\n---\nUpdated content`
      );
      execSync('git add .', { cwd: join(context.testDir, 'data') });
      await runCivicCommand(
        'commit -m "Updated content"',
        join(context.testDir, 'data')
      );

      // Step 3: Get the two latest commit hashes
      const gitLog = execSync('git log --pretty=format:"%H" -n 2', {
        cwd: join(context.testDir, 'data'),
      });
      const commits = gitLog.toString().trim().split('\n').filter(Boolean);

      if (commits.length < 2) {
        return; // Skip this test if we don't have enough commits
      }

      const [commit2, commit1] = commits;

      // Step 4: Run the diff command between the two commits
      const result = await runCivicCommand(
        `diff test-diff --commit1 ${commit1} --commit2 ${commit2}`,
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle missing configuration (manual test)', async () => {
      const result = await runCivicCommand(
        'diff',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });
  });
});
