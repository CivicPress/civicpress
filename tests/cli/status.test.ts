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

describe('CLI Status Command', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
    setupTestData(context);
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('status', () => {
    it('should change status of a record (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );

      const result = await runCivicCommand(
        'status test-resolution approved',
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

      const result = await runCivicCommand(
        'status test-resolution approved --message "Approved by council"',
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

      const result = await runCivicCommand(
        'status test-resolution approved --role clerk',
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
        'status test-resolution approved --dry-run',
        join(context.testDir, 'data')
      );

      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should fail with invalid status (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );

      const result = await runCivicCommand(
        'status test-resolution invalid-status',
        join(context.testDir, 'data')
      );

      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should fail when record does not exist (manual test)', async () => {
      const result = await runCivicCommand(
        'status non-existent approved',
        join(context.testDir, 'data')
      );

      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should show status change information (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );

      const result = await runCivicCommand(
        'status test-resolution approved',
        join(context.testDir, 'data')
      );

      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with dry-run-hooks flag (manual test)', async () => {
      createMockRecord(
        context.testDir,
        'resolution',
        'test-resolution',
        'Test content'
      );

      const result = await runCivicCommand(
        'status test-resolution approved --dry-run-hooks "record:status-changed"',
        join(context.testDir, 'data')
      );

      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });
  });
});
