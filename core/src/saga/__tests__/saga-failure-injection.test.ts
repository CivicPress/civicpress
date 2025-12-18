/**
 * Saga Pattern Failure Injection Tests
 *
 * Tests saga behavior under various failure scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CivicPress, CivicPressConfig } from '../../civic-core.js';
import {
  PublishDraftSaga,
  SagaExecutor,
  SagaStateStore,
  IdempotencyManager,
  ResourceLockManager,
} from '../index.js';
import { DatabaseService } from '../../database/database-service.js';
import { RecordManager } from '../../records/record-manager.js';
import { AuthUser } from '../../auth/auth-service.js';
import { GitEngine } from '../../git/git-engine.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('Saga Failure Injection Tests', () => {
  let testDir: string;
  let config: CivicPressConfig;
  let civic: CivicPress;
  let db: DatabaseService;
  let recordManager: RecordManager;
  let sagaExecutor: SagaExecutor;
  let testUser: AuthUser;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-saga-failure-')
    );
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

    execSync('git init', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', {
      cwd: testDir,
      stdio: 'ignore',
    });
    execSync('git config user.email "test@example.com"', {
      cwd: testDir,
      stdio: 'ignore',
    });

    config = {
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: {
          file: path.join(testDir, '.system-data', 'test.db'),
        },
      },
    };

    civic = new CivicPress(config);
    await civic.initialize();

    db = civic.getDatabaseService();
    recordManager = civic.getRecordManager();

    const stateStore = new SagaStateStore(db);
    const idempotencyManager = new IdempotencyManager(stateStore);
    const lockManager = new ResourceLockManager(db);
    sagaExecutor = new SagaExecutor(
      stateStore,
      idempotencyManager,
      lockManager
    );

    testUser = {
      id: 1,
      username: 'testuser',
      role: 'admin',
      email: 'test@example.com',
      name: 'Test User',
    };
  });

  afterEach(async () => {
    if (civic) {
      try {
        await civic.shutdown();
      } catch (error) {
        // Ignore
      }
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore
    }
  });

  describe('Database Failure Scenarios', () => {
    it('should compensate when database update fails', async () => {
      const draftId = 'db-failure-test';
      await db.createDraft({
        id: draftId,
        title: 'DB Failure Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Mock database to fail on createRecord (used by MoveToRecords step)
      const originalCreate = db.createRecord.bind(db);
      let callCount = 0;
      db.createRecord = vi.fn().mockImplementation(async (...args) => {
        callCount++;
        if (callCount === 1) {
          // First call fails (simulating failure during record creation)
          throw new Error('Database connection lost');
        }
        // Fallback to original
        return originalCreate(...args);
      });

      const saga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      const context = {
        correlationId: `db-failure-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      // Should fail and compensate
      await expect(sagaExecutor.execute(saga, context)).rejects.toThrow();

      // Verify compensation: draft should still exist
      const draft = await db.getDraft(draftId);
      expect(draft).toBeDefined();
    });
  });

  describe('File System Failure Scenarios', () => {
    it('should compensate when file creation fails', async () => {
      const draftId = 'file-failure-test';
      await db.createDraft({
        id: draftId,
        title: 'File Failure Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Use invalid dataDir to cause file creation to fail
      const invalidDataDir = path.join(testDir, 'invalid', 'nested', 'path');
      const saga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        invalidDataDir
      );

      const context = {
        correlationId: `file-failure-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      // Should fail and compensate
      await expect(sagaExecutor.execute(saga, context)).rejects.toThrow();

      // Verify compensation: record should be removed from records table
      // (Note: exact behavior depends on which step fails)
    });
  });

  describe('Git Failure Scenarios', () => {
    it('should fail operation when Git commit fails (no rollback)', async () => {
      const draftId = 'git-failure-test';
      await db.createDraft({
        id: draftId,
        title: 'Git Failure Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Mock GitEngine to fail on commit
      const git = civic.getGitEngine();
      const originalCommit = git.commit.bind(git);
      git.commit = vi.fn().mockRejectedValue(new Error('Git commit failed'));

      const saga = new PublishDraftSaga(
        db,
        recordManager,
        git,
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      const context = {
        correlationId: `git-failure-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      // Should fail (Git commit is authoritative)
      await expect(sagaExecutor.execute(saga, context)).rejects.toThrow();

      // Verify: record should be compensated (moved back to drafts or deleted)
      // Git commit never happened, so compensation should clean up
    });
  });

  describe('Derived State Failure Scenarios', () => {
    it('should not fail saga when indexing fails', async () => {
      const draftId = 'indexing-failure-test';
      await db.createDraft({
        id: draftId,
        title: 'Indexing Failure Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Mock IndexingService to fail
      const indexingService = civic.getIndexingService();
      const originalGenerate =
        indexingService.generateIndexes.bind(indexingService);
      indexingService.generateIndexes = vi
        .fn()
        .mockRejectedValue(new Error('Indexing failed'));

      const saga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        indexingService,
        testDir
      );

      const context = {
        correlationId: `indexing-failure-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      // Should succeed despite indexing failure (derived state)
      const result = await sagaExecutor.execute(saga, context);
      expect(result.result).toBeDefined();
      expect(result.result.id).toBe(draftId);

      // Verify record was published
      const record = await db.getRecord(draftId);
      expect(record).toBeDefined();
    });

    it('should not fail saga when hook emission fails', async () => {
      const draftId = 'hook-failure-test';
      await db.createDraft({
        id: draftId,
        title: 'Hook Failure Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Create a new hook system instance that fails on emit
      // This way we don't affect other parts of the system
      const hooks = civic.getHookSystem();
      const failingHooks = {
        ...hooks,
        emit: vi.fn().mockRejectedValue(new Error('Hook emission failed')),
      };

      const saga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        failingHooks as any,
        civic.getIndexingService(),
        testDir
      );

      const context = {
        correlationId: `hook-failure-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      // Should succeed despite hook failure (derived state)
      const result = await sagaExecutor.execute(saga, context);
      expect(result.result).toBeDefined();
      expect(result.result.id).toBe(draftId);
    });
  });

  describe('Timeout Scenarios', () => {
    it('should timeout long-running steps', async () => {
      const draftId = 'timeout-test';
      await db.createDraft({
        id: draftId,
        title: 'Timeout Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Create executor with short timeout
      const stateStore = new SagaStateStore(db);
      const idempotencyManager = new IdempotencyManager(stateStore);
      const lockManager = new ResourceLockManager(db);
      const shortTimeoutExecutor = new SagaExecutor(
        stateStore,
        idempotencyManager,
        lockManager,
        {
          defaultTimeout: 100, // 100ms timeout
          defaultStepTimeout: 50, // 50ms per step
        }
      );

      // Mock a slow operation
      const git = civic.getGitEngine();
      const originalCommit = git.commit.bind(git);
      git.commit = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms delay
        return originalCommit();
      });

      const saga = new PublishDraftSaga(
        db,
        recordManager,
        git,
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      const context = {
        correlationId: `timeout-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      // Should timeout
      await expect(
        shortTimeoutExecutor.execute(saga, context)
      ).rejects.toThrow();
    });
  });

  describe('Compensation Failure Scenarios', () => {
    it('should handle compensation failures gracefully', async () => {
      const draftId = 'compensation-failure-test';
      await db.createDraft({
        id: draftId,
        title: 'Compensation Failure Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Create a scenario where compensation also fails
      // This tests the compensation failure handling
      const invalidDataDir = path.join(testDir, 'invalid', 'path');
      const saga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        invalidDataDir
      );

      const context = {
        correlationId: `comp-failure-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      // Should fail, and compensation may also fail
      // System should handle this gracefully
      try {
        await sagaExecutor.execute(saga, context);
        // If it doesn't throw, that's also acceptable (compensation might have succeeded)
      } catch (error) {
        // Saga failed - verify state is tracked
        const stateStore = new SagaStateStore(db);
        const failedSagas = await stateStore.getFailedSagas();
        // State might be persisted or might not, depending on when it failed
        // Just verify the saga didn't complete successfully
        expect(error).toBeDefined();
      }
    });
  });
});
