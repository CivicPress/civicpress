/**
 * Saga hardening — FA-CORE-007 / FA-CORE-008 / FA-CORE-015, against a REAL
 * SQLite database.
 *
 * - FA-CORE-007: resource-lock TTL must cover the saga timeout (was 30 s
 *   against a 300 s saga, never renewed).
 * - FA-CORE-008: idempotency keys must be stable across retries of the same
 *   operation (were derived from the per-call start timestamp → inert).
 * - FA-CORE-015: CreateRecord must carry metadata.recordId so the executor
 *   acquires a resource lock (previously ran completely unlocked).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseService } from '../../database/database-service.js';
import { SagaStateStore } from '../saga-state-store.js';
import { IdempotencyManager } from '../idempotency.js';
import { ResourceLockManager } from '../resource-lock.js';
import { SagaExecutor } from '../saga-executor.js';
import { SagaDuplicateError, SagaLockError } from '../errors.js';
import type { Saga, SagaContext } from '../types.js';
import { RecordSagas } from '../../records/record-manager/sagas.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TestContext extends SagaContext {
  recordId?: string;
  request?: Record<string, unknown>;
}

/** One-step saga whose behavior is controlled per-test. */
function makeSaga(
  name: string,
  behavior: {
    delayMs?: number;
    failTimes?: number;
    onExecute?: (ctx: TestContext) => Promise<void>;
  } = {}
) {
  let executions = 0;
  let failures = behavior.failTimes ?? 0;
  const saga: Saga<TestContext, unknown> = {
    name,
    version: '1.0.0',
    steps: [
      {
        name: 'OnlyStep',
        isCompensatable: false,
        async execute(ctx: TestContext) {
          executions++;
          if (behavior.onExecute) await behavior.onExecute(ctx);
          if (behavior.delayMs) await sleep(behavior.delayMs);
          if (failures > 0) {
            failures--;
            throw new Error('injected step failure');
          }
          return { ok: true, execution: executions };
        },
      },
    ],
  };
  return { saga, count: () => executions };
}

function makeContext(over: Partial<TestContext> = {}): TestContext {
  return {
    correlationId: `corr-${Date.now()}-${Math.random()}`,
    startedAt: new Date(),
    user: { id: 1, username: 'alice', role: 'admin' },
    ...over,
  };
}

describe('Saga hardening (real SQLite)', () => {
  let dir: string;
  let db: DatabaseService;
  let executor: SagaExecutor;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'saga-hardening-'));
    db = new DatabaseService({
      type: 'sqlite',
      sqlite: { file: path.join(dir, 'test.db') },
    });
    await db.initialize();
    const store = new SagaStateStore(db);
    executor = new SagaExecutor(
      store,
      new IdempotencyManager(store),
      new ResourceLockManager(db)
    );
  });

  afterEach(async () => {
    await db.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  describe('FA-CORE-007 — lock TTL covers saga timeout', () => {
    it('acquires the resource lock with an expiry beyond the 300 s saga timeout', async () => {
      let lockWindowMs = 0;
      const { saga } = makeSaga('LockTtlSaga', {
        onExecute: async () => {
          const rows = await db
            .getAdapter()
            .query<{ acquired_at: string; expires_at: string }>(
              'SELECT acquired_at, expires_at FROM saga_resource_locks WHERE resource_key = ?',
              ['record:r-ttl']
            );
          expect(rows.length).toBe(1);
          lockWindowMs =
            new Date(rows[0].expires_at).getTime() -
            new Date(rows[0].acquired_at).getTime();
        },
      });

      await executor.execute(
        saga,
        makeContext({ metadata: { recordId: 'r-ttl' } })
      );

      // Default saga timeout is 300 000 ms; the lock must outlive it.
      expect(lockWindowMs).toBeGreaterThanOrEqual(300_000);
    });

    it('still blocks a concurrent saga on the same record', async () => {
      const { saga } = makeSaga('SlowLockSaga', { delayMs: 200 });
      const ctx1 = makeContext({
        metadata: { recordId: 'r-race' },
        request: { v: 1 },
      });
      const ctx2 = makeContext({
        metadata: { recordId: 'r-race' },
        request: { v: 2 }, // different content → different idempotency key
      });

      const p1 = executor.execute(saga, ctx1);
      await sleep(60); // let saga 1 acquire the lock
      await expect(executor.execute(saga, ctx2)).rejects.toThrow(SagaLockError);
      await p1;
    });
  });

  describe('FA-CORE-008 — idempotency is real', () => {
    it('returns the cached result for a retry of the same operation', async () => {
      const { saga, count } = makeSaga('RetrySaga');
      const content = { recordId: 'r-1', request: { title: 'A' } };

      const first = await executor.execute(saga, makeContext(content));
      const second = await executor.execute(saga, makeContext(content));

      expect(count()).toBe(1); // step ran once
      expect(second.sagaId).toBe(first.sagaId); // cached execution returned
      expect(second.result).toEqual(first.result);
    });

    it('executes again when the operation content differs', async () => {
      const { saga, count } = makeSaga('ContentSaga');
      await executor.execute(
        saga,
        makeContext({ recordId: 'r-2', request: { title: 'A' } })
      );
      await executor.execute(
        saga,
        makeContext({ recordId: 'r-2', request: { title: 'B' } })
      );
      expect(count()).toBe(2);
    });

    it('rejects a double-submit while the first run is still in flight', async () => {
      const { saga, count } = makeSaga('InFlightSaga', { delayMs: 200 });
      const content = { request: { title: 'double-click' } };

      const p1 = executor.execute(saga, makeContext(content));
      await sleep(60); // let saga 1 persist its state
      await expect(executor.execute(saga, makeContext(content))).rejects.toThrow(
        SagaDuplicateError
      );
      await p1;
      expect(count()).toBe(1);
    });

    it('allows a retry after the first run failed', async () => {
      const { saga, count } = makeSaga('FailOnceSaga', { failTimes: 1 });
      const content = { recordId: 'r-3', request: { title: 'C' } };

      await expect(executor.execute(saga, makeContext(content))).rejects.toThrow();
      const retry = await executor.execute(saga, makeContext(content));

      expect(count()).toBe(2);
      expect(retry.result).toEqual({ ok: true, execution: 2 });
    });

    it('scopes caller-provided keys per user (no cross-user cache hits)', async () => {
      const { saga, count } = makeSaga('ExplicitKeySaga');

      await executor.execute(
        saga,
        makeContext({ idempotencyKey: 'client-key-1' })
      );
      // Same explicit key, different user → must NOT get user 1's result.
      await executor.execute(
        saga,
        makeContext({
          idempotencyKey: 'client-key-1',
          user: { id: 2, username: 'bob', role: 'admin' },
        })
      );
      expect(count()).toBe(2);

      // Same key, same user → cached.
      await executor.execute(
        saga,
        makeContext({ idempotencyKey: 'client-key-1' })
      );
      expect(count()).toBe(2);
    });
  });

  describe('FA-CORE-015 — CreateRecord acquires a resource lock', () => {
    it('builds the create context with metadata.recordId as the lock key', async () => {
      // Deps are only used to construct the saga instance; the stub executor
      // intercepts before anything runs.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dummy = {} as any;
      const sagas = new RecordSagas({
        db: dummy,
        git: dummy,
        hooks: dummy,
        workflows: dummy,
        templates: dummy,
        dataDir: dir,
        recordManager: dummy,
        writeAudit: async () => {},
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let captured: any;
      const stubExecutor = {
        execute: async (_saga: unknown, ctx: unknown) => {
          captured = ctx;
          return { result: {}, sagaId: 's-stub', duration: 0, compensated: false };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const user = { id: 1, username: 'alice', role: 'admin' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request: any = {
        title: 'Locked Create',
        type: 'bylaw',
        content: '# x',
        status: 'published',
      };

      // Auto-generated ID: lock key present, top-level recordId untouched
      // (it feeds the idempotency key, which must not vary per call).
      await sagas.createRecordSaga(request, user, undefined, stubExecutor);
      expect(captured.metadata.recordId).toMatch(/^record-/);
      expect(captured.recordId).toBeUndefined();

      // Caller-supplied ID flows into both.
      await sagas.createRecordSaga(request, user, 'rec-explicit', stubExecutor);
      expect(captured.metadata.recordId).toBe('rec-explicit');
      expect(captured.recordId).toBe('rec-explicit');
    });

    it('blocks two concurrent creates targeting the same record id', async () => {
      const { saga } = makeSaga('CreateLikeSaga', { delayMs: 200 });
      // Mirror the context shape RecordSagas now builds for creates.
      const ctx1 = makeContext({
        request: { title: 'A' },
        metadata: { recordType: 'bylaw', recordId: 'rec-same' },
      });
      const ctx2 = makeContext({
        request: { title: 'B' }, // different content → idempotency lets it through
        metadata: { recordType: 'bylaw', recordId: 'rec-same' },
      });

      const p1 = executor.execute(saga, ctx1);
      await sleep(60);
      await expect(executor.execute(saga, ctx2)).rejects.toThrow(SagaLockError);
      await p1;
    });
  });
});
