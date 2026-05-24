/**
 * RecordSagas — extracted from `record-manager.ts` during Phase 2d W2-T6
 * decomposition. Owns the saga-orchestration entry points
 * (`createRecordSaga`, `updateRecordSaga`, `archiveRecordSaga`, and
 * `archiveRecord`).
 *
 * The bodies of each method are moved verbatim from `RecordManager`; only
 * `this.db`/`this.git`/etc. references were rewritten to `this.deps.*` and
 * the parent `RecordManager` is passed in as `this.deps.recordManager` so
 * the saga constructors keep receiving it as their second argument.
 */

import { DatabaseService } from '../../database/database-service.js';
import { GitEngine } from '../../git/git-engine.js';
import { HookSystem } from '../../hooks/hook-system.js';
import { WorkflowEngine } from '../../workflows/workflow-engine.js';
import { TemplateEngine } from '../../utils/template-engine.js';
import { AuthUser } from '../../auth/auth-service.js';
import { CreateRecordRequest, UpdateRecordRequest } from '../../civic-core.js';
import { AuditChannel } from '../../audit/audit-channel.js';
import { RecordData, RecordManager } from '../record-manager.js';
// `import type` is erased at compile time so it does not reintroduce the
// runtime circular import these methods originally avoided via `any`.
import type { SagaExecutor } from '../../saga/saga-executor.js';
import type { IndexingService } from '../../indexing/indexing-service.js';
import type { UpdateRecordContext } from '../../saga/update-record-saga.js';
import type { ArchiveRecordContext } from '../../saga/archive-record-saga.js';
import type { CreateRecordContext } from '../../saga/create-record-saga.js';

export interface RecordSagasDeps {
  db: DatabaseService;
  git: GitEngine;
  hooks: HookSystem;
  workflows: WorkflowEngine;
  templates: TemplateEngine;
  dataDir: string;
  auditChannel?: AuditChannel;
  recordManager: RecordManager;
  writeAudit: (event: {
    action: string;
    resourceType: 'record' | 'user' | 'config' | 'system' | string;
    resourceId?: string;
    userId?: number;
    message?: string;
    outcome?: 'success' | 'failure';
  }) => Promise<void>;
}

export class RecordSagas {
  constructor(private deps: RecordSagasDeps) {}

  /**
   * Update a record using the saga pattern
   * This orchestrates the multi-step process of updating a published record
   */
  async updateRecordSaga(
    id: string,
    request: UpdateRecordRequest,
    user: AuthUser,
    sagaExecutor?: SagaExecutor,
    indexingService?: IndexingService | null,
    correlationId?: string
  ): Promise<RecordData | null> {
    // Import saga components dynamically to avoid circular dependencies
    const { UpdateRecordSaga } = await import('../../saga/update-record-saga.js');
    const {
      SagaExecutor,
      SagaStateStore,
      IdempotencyManager,
      ResourceLockManager,
    } = await import('../../saga/index.js');

    // Create saga executor if not provided
    let executor = sagaExecutor;
    if (!executor) {
      const stateStore = new SagaStateStore(this.deps.db);
      const idempotencyManager = new IdempotencyManager(stateStore);
      const lockManager = new ResourceLockManager(this.deps.db);
      executor = new SagaExecutor(stateStore, idempotencyManager, lockManager);
    }

    // Create saga instance
    const saga = new UpdateRecordSaga(
      this.deps.db,
      this.deps.recordManager,
      this.deps.git,
      this.deps.hooks,
      indexingService || null,
      this.deps.dataDir
    );

    // Create context
    const context = {
      correlationId: correlationId || `update-${id}-${Date.now()}`,
      startedAt: new Date(),
      recordId: id,
      request,
      user,
      metadata: {
        recordId: id,
      },
    };

    // Execute saga
    const result = await executor.execute<UpdateRecordContext, RecordData | null>(
      saga,
      context
    );

    return result.result;
  }

  /**
   * Archive a record using the saga pattern
   * This orchestrates the multi-step process of archiving a record
   */
  async archiveRecordSaga(
    id: string,
    user: AuthUser,
    sagaExecutor?: SagaExecutor,
    correlationId?: string
  ): Promise<boolean> {
    // Import saga components dynamically to avoid circular dependencies
    const { ArchiveRecordSaga } = await import(
      '../../saga/archive-record-saga.js'
    );
    const {
      SagaExecutor,
      SagaStateStore,
      IdempotencyManager,
      ResourceLockManager,
    } = await import('../../saga/index.js');

    // Create saga executor if not provided
    let executor = sagaExecutor;
    if (!executor) {
      const stateStore = new SagaStateStore(this.deps.db);
      const idempotencyManager = new IdempotencyManager(stateStore);
      const lockManager = new ResourceLockManager(this.deps.db);
      executor = new SagaExecutor(stateStore, idempotencyManager, lockManager);
    }

    // Create saga instance
    const saga = new ArchiveRecordSaga(
      this.deps.db,
      this.deps.recordManager,
      this.deps.git,
      this.deps.hooks,
      this.deps.dataDir
    );

    // Create context
    const context = {
      correlationId: correlationId || `archive-${id}-${Date.now()}`,
      startedAt: new Date(),
      recordId: id,
      user,
      metadata: {
        recordId: id,
      },
    };

    // Execute saga
    const result = await executor.execute<ArchiveRecordContext, boolean>(
      saga,
      context
    );

    return result.result;
  }

  /**
   * Archive a record (soft delete)
   *
   * Note: This method uses the saga pattern for better error handling and compensation.
   */
  async archiveRecord(id: string, user: AuthUser): Promise<boolean> {
    // Use saga for all archive operations
    return this.archiveRecordSaga(id, user);
  }

  /**
   * Create a record using the saga pattern
   * This orchestrates the multi-step process of creating a published record
   */
  async createRecordSaga(
    request: CreateRecordRequest,
    user: AuthUser,
    recordId?: string,
    sagaExecutor?: SagaExecutor,
    indexingService?: IndexingService | null,
    correlationId?: string
  ): Promise<RecordData> {
    // Import saga components dynamically to avoid circular dependencies
    const { CreateRecordSaga } = await import('../../saga/create-record-saga.js');
    const {
      SagaExecutor,
      SagaStateStore,
      IdempotencyManager,
      ResourceLockManager,
    } = await import('../../saga/index.js');

    // Create saga executor if not provided
    let executor = sagaExecutor;
    if (!executor) {
      const stateStore = new SagaStateStore(this.deps.db);
      const idempotencyManager = new IdempotencyManager(stateStore);
      const lockManager = new ResourceLockManager(this.deps.db);
      executor = new SagaExecutor(stateStore, idempotencyManager, lockManager);
    }

    // Create saga instance
    const saga = new CreateRecordSaga(
      this.deps.db,
      this.deps.recordManager,
      this.deps.git,
      this.deps.hooks,
      indexingService || null, // Will be set if provided
      this.deps.dataDir
    );

    // Create context
    const context = {
      correlationId:
        correlationId || `create-${recordId || 'record'}-${Date.now()}`,
      startedAt: new Date(),
      request,
      user,
      recordId,
      metadata: {
        recordType: request.type,
      },
    };

    // Execute saga
    const result = await executor.execute<CreateRecordContext, RecordData>(
      saga,
      context
    );

    return result.result;
  }
}
