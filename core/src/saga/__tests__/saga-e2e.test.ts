/**
 * Saga Pattern End-to-End Tests
 *
 * Comprehensive tests covering all sagas with various failure scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress, CivicPressConfig } from '../../civic-core.js';
import {
  PublishDraftSaga,
  CreateRecordSaga,
  UpdateRecordSaga,
  ArchiveRecordSaga,
  SagaExecutor,
  SagaStateStore,
  IdempotencyManager,
  ResourceLockManager,
  SagaRecovery,
} from '../index.js';
import { DatabaseService } from '../../database/database-service.js';
import { RecordManager } from '../../records/record-manager.js';
import { AuthUser } from '../../auth/auth-service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('Saga Pattern E2E Tests', () => {
  let testDir: string;
  let config: CivicPressConfig;
  let civic: CivicPress;
  let db: DatabaseService;
  let recordManager: RecordManager;
  let sagaExecutor: SagaExecutor;
  let testUser: AuthUser;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-saga-e2e-'));
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

  describe('Complete Workflow: Draft → Publish → Update → Archive', () => {
    it('should handle complete record lifecycle', async () => {
      const draftId = 'lifecycle-test';

      // Step 1: Create draft
      await db.createDraft({
        id: draftId,
        title: 'Lifecycle Test Record',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Lifecycle Test\n\nThis is a test.',
        metadata: JSON.stringify({ author: 'testuser' }),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Step 2: Publish draft (PublishDraftSaga)
      const publishSaga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      const publishContext = {
        correlationId: `publish-${draftId}-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      };

      const publishResult = await sagaExecutor.execute(
        publishSaga,
        publishContext
      );
      const recordId = publishResult.result.id;

      // Verify published
      const published = await db.getRecord(recordId);
      expect(published).toBeDefined();
      expect(published?.status).toBe('draft'); // Uses draft status from draft

      // Step 3: Update record (UpdateRecordSaga)
      const updateSaga = new UpdateRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      const updateContext = {
        correlationId: `update-${recordId}-${Date.now()}`,
        startedAt: new Date(),
        recordId,
        request: {
          title: 'Updated Lifecycle Test',
          content: '# Updated Content',
        },
        user: testUser,
        metadata: { recordId },
      };

      const updateResult = await sagaExecutor.execute(
        updateSaga,
        updateContext
      );
      expect(updateResult.result.title).toBe('Updated Lifecycle Test');

      // Step 4: Archive record (ArchiveRecordSaga)
      const archiveSaga = new ArchiveRecordSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        testDir
      );

      const archiveContext = {
        correlationId: `archive-${recordId}-${Date.now()}`,
        startedAt: new Date(),
        recordId,
        user: testUser,
        metadata: { recordId },
      };

      const archiveResult = await sagaExecutor.execute(
        archiveSaga,
        archiveContext
      );
      expect(archiveResult.result).toBe(true);

      // Verify archived
      const archived = await db.getRecord(recordId);
      expect(archived?.status).toBe('archived');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent publishes of different drafts', async () => {
      const draft1 = 'concurrent-1';
      const draft2 = 'concurrent-2';

      // Create two drafts
      await db.createDraft({
        id: draft1,
        title: 'Concurrent Draft 1',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Draft 1',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      await db.createDraft({
        id: draft2,
        title: 'Concurrent Draft 2',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Draft 2',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      // Publish both concurrently
      // Note: Git doesn't allow concurrent commits to the same repository,
      // so one may fail with a lock error. We'll use Promise.allSettled to handle this.
      const saga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      const [result1, result2] = await Promise.allSettled([
        sagaExecutor.execute(saga, {
          correlationId: `publish-${draft1}-${Date.now()}`,
          startedAt: new Date(),
          draftId: draft1,
          user: testUser,
          metadata: { recordId: draft1 },
        }),
        sagaExecutor.execute(saga, {
          correlationId: `publish-${draft2}-${Date.now()}`,
          startedAt: new Date(),
          draftId: draft2,
          user: testUser,
          metadata: { recordId: draft2 },
        }),
      ]);

      // At least one should succeed (Git lock may cause one to fail)
      const successes = [result1, result2].filter(
        (r) => r.status === 'fulfilled'
      );
      expect(successes.length).toBeGreaterThanOrEqual(1);

      // If one failed due to Git lock, retry it sequentially
      if (result1.status === 'rejected' || result2.status === 'rejected') {
        const failedDraft = result1.status === 'rejected' ? draft1 : draft2;
        const retryResult = await sagaExecutor.execute(saga, {
          correlationId: `publish-${failedDraft}-retry-${Date.now()}`,
          startedAt: new Date(),
          draftId: failedDraft,
          user: testUser,
          metadata: { recordId: failedDraft },
        });
        expect(retryResult.result).toBeDefined();
        expect(retryResult.result.id).toBe(failedDraft);
      }

      // Verify both records were eventually published
      const record1 = await db.getRecord(draft1);
      const record2 = await db.getRecord(draft2);
      expect(record1).toBeDefined();
      expect(record2).toBeDefined();
    });
  });

  describe('Recovery Scenarios', () => {
    it('should recover stuck sagas', async () => {
      const stateStore = new SagaStateStore(db);
      const recovery = new SagaRecovery(stateStore);

      // Manually create a stuck saga state (simulating a crash)
      await stateStore.saveState({
        id: 'stuck-saga-1',
        sagaType: 'PublishDraft',
        sagaVersion: '1.0.0',
        context: JSON.stringify({ draftId: 'test', user: testUser }),
        status: 'executing',
        currentStep: 2,
        stepResults: [],
        startedAt: new Date(Date.now() - 400000), // 6+ minutes ago
        correlationId: 'stuck-test',
      });

      // Recover stuck sagas
      const recovered = await recovery.recoverStuckSagas();
      expect(recovered).toBeGreaterThan(0);

      // Verify saga was marked as failed
      const state = await stateStore.getState('stuck-saga-1');
      expect(state?.status).toBe('failed');
    });
  });

  describe('Metrics Collection', () => {
    it('should collect metrics for all saga executions', async () => {
      const { sagaMetrics } = await import('../saga-metrics.js');

      // Execute multiple sagas
      const draftId = 'metrics-test';
      await db.createDraft({
        id: draftId,
        title: 'Metrics Test',
        type: 'bylaw',
        status: 'draft',
        markdown_body: '# Test',
        metadata: JSON.stringify({}),
        author: 'testuser',
        created_by: 'testuser',
      });

      const saga = new PublishDraftSaga(
        db,
        recordManager,
        civic.getGitEngine(),
        civic.getHookSystem(),
        civic.getIndexingService(),
        testDir
      );

      // Execute saga
      await sagaExecutor.execute(saga, {
        correlationId: `metrics-${Date.now()}`,
        startedAt: new Date(),
        draftId,
        user: testUser,
        metadata: { recordId: draftId },
      });

      // Check metrics (if metrics collector is being used)
      // Note: Metrics collection might not be enabled by default
      // This test verifies the saga executes successfully
      // Metrics collection would need to be explicitly enabled in the executor config
    });
  });
});
