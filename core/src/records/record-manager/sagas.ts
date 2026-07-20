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

    // Emit the domain audit entry for the update.
    //
    // `RecordManager.updateRecord` writes an `update_record` entry on its
    // LEGACY branch, but that branch only runs for drafts: any record whose
    // status is not `draft` is routed here, and `UpdateRecordSaga` writes
    // through `this.db.updateRecord(...)` directly. So in practice edits to
    // PUBLISHED records — the ones that most need a trail — were unaudited.
    // See the archive helper below for why this sits after `execute()`.
    await this.deps.writeAudit({
      action: 'update_record',
      resourceType: 'record',
      resourceId: id,
      userId: typeof user?.id === 'number' ? user.id : undefined,
      message: `Updated record ${id}`,
    });

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

    // Emit the domain audit entry for the archive.
    //
    // Create and update are audited inside `RecordManager.createRecord` /
    // `.updateRecord`, but archive never reached either: `ArchiveRecordSaga`
    // flips the status with `this.db.updateRecord(...)` DIRECTLY (it has to —
    // going through RecordManager.updateRecord would perform the file write the
    // saga owns and compensates itself), so archiving a record produced NO
    // audit row at all. `writeAudit` was already threaded into this class's
    // deps by the Phase-2d decomposition and simply never called.
    //
    // Written after `execute()` resolves: the executor THROWS on step failure
    // or timeout (see saga-executor.ts), so reaching this line means the
    // archive committed and compensation did not run.
    await this.deps.writeAudit({
      action: 'archive_record',
      resourceType: 'record',
      resourceId: id,
      userId: typeof user?.id === 'number' ? user.id : undefined,
      message: `Archived record ${id}`,
    });

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

    // FA-CORE-015: pre-generate the record ID so the executor can acquire a
    // resource lock on it (previously the context carried no
    // metadata.recordId and CreateRecord ran completely unlocked). The
    // top-level recordId stays caller-supplied-only because it feeds the
    // idempotency key, which must not vary across retries.
    const effectiveRecordId = recordId || `record-${Date.now()}`;

    // Create context
    const context = {
      correlationId: correlationId || `create-${effectiveRecordId}`,
      startedAt: new Date(),
      request,
      user,
      recordId,
      metadata: {
        recordType: request.type,
        recordId: effectiveRecordId,
      },
    };

    // Execute saga
    const result = await executor.execute<CreateRecordContext, RecordData>(
      saga,
      context
    );

    // Emit the domain audit entry for the create.
    //
    // Same shape as the update gap: `RecordManager.createRecord` audits on its
    // LEGACY branch only, and that branch is reached solely for drafts /
    // `skipFileGeneration` — every PUBLISHED create is routed here, and
    // `CreateRecordSaga` inserts with `this.db.createRecord(...)` directly. So
    // creating a published record produced no audit row.
    //
    // The id comes from the saga RESULT, not from `effectiveRecordId`: the
    // latter is a lock placeholder synthesised when the caller supplied none,
    // while the result carries the id the record was actually stored under.
    await this.deps.writeAudit({
      action: 'create_record',
      resourceType: 'record',
      resourceId: result.result?.id ?? effectiveRecordId,
      userId: typeof user?.id === 'number' ? user.id : undefined,
      message: `Created record ${result.result?.id ?? effectiveRecordId} of type ${request.type}`,
    });

    return result.result;
  }
}
