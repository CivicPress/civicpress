# Phase 2d Storage Test Triage

**Sub-phase:** 2d (Structural Hardening) — Workstream W0 Task 1
**Date:** 2026-05-19
**Branch:** `refactor/phase-2d-structural-hardening` (off `dev`'s tip `834ded9`)
**Carry-forward source:** `docs/audits/phase-2c.5-closure-note.md` §"What was deferred"
**Plan:** `docs/plans/2026-05-19-base-refactor-phase-2d-structural-hardening.md` — W0
**Failure count at intake:** 28 failures + 2 unhandled stream errors across 10 test files

---

## Summary

Phase 2c T5 added the module-local `modules/storage/vitest.config.mjs` and finally executed `modules/storage/src/__tests__/` for the first time. Re-running at start of Phase 2d intake confirms: 28 failures across 10 files + 2 unhandled stream-error exceptions (matches the Phase 2c.5 closure-note inventory).

**Headline:** the 28 test failures resolve to **9 source-code defects** plus **3 stale tests** plus **1 schema-drift fixture**. The "fake comprehensiveness" framing (Phase 2c discovered these tests existed but didn't run) understated the value — the tests now catch real bugs in storage's reliability primitives (retry, timeout, circuit-breaker, batch ops, lifecycle, stream-error handling, error inheritance).

| Category | Count | Notes |
|---|---|---|
| **stale** | 3 | Tests assert behavior the code intentionally doesn't have (or shouldn't have); test needs rewrite |
| **real-bug** | 24 | Test assertions are correct; source code has 9 underlying defects causing 24 failures (cascading) |
| **mock-drift** | 0 | None identified |
| **schema-drift** | 1 | Mock fixture uses `provider: 'local'` field but code reads provider from `provider_path` prefix |
| **Total** | 28 | |

The 9 real-bug source defects are surfaced as new findings `phase-2d-storage-bug-1` through `-9` in the findings registry. None existed in the original 205-finding audit (the tests were dormant). All 9 must close before W0-T3 can sign off.

---

## Per-failure triage table

| # | File | Test name (short) | Category | Recommended action | Bug ID / Notes |
|---|---|---|---|---|---|
| 1 | `batch-operations.test.ts` | Batch Upload > should upload multiple files successfully | **real-bug** | Fix `validateFile` to honor `'*'` wildcard | `phase-2d-storage-bug-1` (wildcard) |
| 2 | `batch-operations.test.ts` | Batch Upload > should handle partial failures | **real-bug** | Same as #1 (cascading) | Cascading from `bug-1` |
| 3 | `batch-operations.test.ts` | Batch Upload > should include error summary on partial failure | **real-bug** | Same as #1 + see #4 | Cascading from `bug-1` |
| 4 | `batch-operations.test.ts` | Batch Upload > should throw BatchOperationError when all files fail | **real-bug** | Move throw outside outer try/catch OR re-throw `BatchOperationError` in catch | `phase-2d-storage-bug-2` (swallow) |
| 5 | `batch-operations.test.ts` | Batch Upload > should respect concurrency limits | **real-bug** | Same as #1 | Cascading from `bug-1` |
| 6 | `batch-operations.test.ts` | Batch Upload > should include error codes in failed results | **real-bug** | Same as #1 | Cascading from `bug-1` |
| 7 | `batch-operations.test.ts` | Batch Delete > should delete multiple files successfully | **real-bug** | Fix #1 (uploads succeed → delete setup works) | Cascading from `bug-1` |
| 8 | `batch-operations.test.ts` | Batch Delete > should handle partial failures in batch delete | **real-bug** | Same as #7 | Cascading from `bug-1` |
| 9 | `batch-operations.test.ts` | Batch Delete > should include error summary on partial failure | **real-bug** | Same as #7 | Cascading from `bug-1` |
| 10 | `batch-operations.test.ts` | Batch Delete > should throw BatchOperationError when all deletes fail | **real-bug** | Fix #4 (delete path has same swallow at `cloud-uuid-storage-service.ts:2083`) | `phase-2d-storage-bug-2` (delete-side) |
| 11 | `batch-operations.test.ts` | Batch Delete > should call progress callback during batch delete | **real-bug** | Same as #7 | Cascading from `bug-1` |
| 12 | `circuit-breaker.test.ts` | State Transitions > should transition to half-open after timeout | **stale** | Rewrite test to call `execute()` after timeout (transitions are lazy by design) | Test asserts wrong expectation; `circuit-breaker.ts:51-58` is correct lazy state machine |
| 13 | `circuit-breaker.test.ts` | Half-Open Limits > should limit calls in half-open state | **stale** | Update test: set `successThreshold: 99` so 2 successes don't close circuit before 3rd call | Default `successThreshold=2`; test transitions back to closed before hitting limit |
| 14 | `health-checker.test.ts` | checkProviderHealth > should handle timeout | **stale** | Lower `health_check_timeout` in test config to ~100ms; raise vitest timeout | Test races vitest 5000ms test-timeout against 5000ms health_check_timeout — flaky by design |
| 15 | `health-checker.test.ts` | stopHealthChecks > should stop all health check intervals | **real-bug** | Pass context object `{providers: [...]}` to `stopHealthChecks`'s `logger.debug` call (line 226) for symmetry with `startHealthChecks` | `phase-2d-storage-bug-9` (consistency, minor) |
| 16 | `lifecycle-manager.test.ts` | evaluateLifecycle > should prioritize delete over archive | **real-bug** | Sort/evaluate so delete-actions win over archive regardless of `policies[]` insertion order | `phase-2d-storage-bug-7` (lifecycle priority) |
| 17 | `orphaned-file-cleaner.test.ts` | cleanupOrphanedFiles > should handle cleanup errors gracefully | **stale** | Rewrite test to use a path that actually throws (e.g., mock `fs.remove` to reject; current `fs.remove` on non-existent path is idempotent) | Code is "graceful" by design (matches the method name); test setup is wrong |
| 18 | `retry-manager.test.ts` | Retryable Errors > should retry on network errors | **real-bug** | Lowercase the retryable patterns OR compare both sides un-lowercased | `phase-2d-storage-bug-4` (case mismatch) |
| 19 | `retry-manager.test.ts` | Retryable Errors > should retry on timeout errors | **real-bug** | Same as #18 | Cascading from `bug-4` |
| 20 | `storage-errors.test.ts` | StorageValidationError > should create validation error | **real-bug** | Override constructor in `StorageValidationError` to set `this.context = validationDetails` directly OR fix core's `ValidationError` wrap pattern | `phase-2d-storage-bug-6` (inheritance) |
| 21 | `storage-errors.test.ts` | StorageConfigurationError > should create configuration error | **real-bug** | Same as #20 (same inheritance pattern) | Cascading from `bug-6` |
| 22 | `streaming-operations.test.ts` | uploadFileStream > should handle stream errors | **real-bug** | Attach `'error'` listener to source `Readable`; reject pipeline on source error. Prefer `stream/promises.pipeline()` | `phase-2d-storage-bug-7` (stream error) — also kills the 2 unhandled exceptions |
| 23 | `streaming-operations.test.ts` | downloadFileStream > should return error for non-existent file | **real-bug** | Throw `StorageFileNotFoundError` instead of returning `null` when file not found (line 2375) | `phase-2d-storage-bug-8` (missing-file contract) |
| 24 | `streaming-operations.test.ts` | Stream Error Handling > should handle stream read errors during upload | **real-bug** | Same as #22 | Cascading from `bug-7` |
| 25 | `timeout-utils.test.ts` | should throw StorageTimeoutError when operation exceeds timeout | **real-bug** | Change `error.message.includes('timeout')` to `includes('timed out')` (or normalize the `createTimeoutPromise` message to include 'timeout') at `utils/timeout.ts:23` | `phase-2d-storage-bug-5` (string mismatch) |
| 26 | `timeout-utils.test.ts` | should throw StorageTimeoutError with correct timeout value | **real-bug** | Same as #25 | Cascading from `bug-5` |
| 27 | `timeout-utils.test.ts` | should use default operation name | **real-bug** | Same as #25 | Cascading from `bug-5` |
| 28 | `usage-reporter.test.ts` | getOverallUsage > should group by provider | **schema-drift** | Update mock to set `provider_path: 's3://...'` for s3 file (and similar for azure/gcs); code derives provider from `provider_path` prefix, not from a `provider` field | `storage-usage-reporter.ts:193, 219-229` |

---

## Real bugs surfaced (9 new findings)

These are added to the findings registry as `phase-2d-storage-bug-1` through `-9`, status `open`. All must close before W0-T3 sign-off.

| Finding ID | Severity | Source location | One-line description |
|---|---|---|---|
| `phase-2d-storage-bug-1` | **High** | `cloud-uuid-storage-service.ts:1713` | `validateFile` does not honor `'*'` wildcard in folder `allowed_types`; uses literal `.includes(extension)` so `['*'].includes('txt')` is `false`. Every folder configured with `['*']` rejects every file. (clears 9 cascading batch failures) |
| `phase-2d-storage-bug-2` | **High** | `cloud-uuid-storage-service.ts:1907-1924, 2068-2083` | `batchUpload`/`batchDelete` throw `BatchOperationError` inside their own outer `try`; the outer `catch` swallows the throw and returns a partial-result response. Contract "throws on total failure" is broken on both methods. (clears 2 failures) |
| `phase-2d-storage-bug-3` | **High** | `lifecycle-manager.ts:75-89` | `evaluateLifecycle` iterates `applicablePolicies` in array order and breaks on first match; delete-priority depends on policy insertion order. Test adds `[archive, delete]` → archive wins for files past both thresholds. (clears 1 failure) |
| `phase-2d-storage-bug-4` | **High** | `retry-manager.ts:159-175` | `isRetryable` lowercases the error message but checks UPPERCASE patterns (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `ECONNREFUSED`); these can never match. Common network errors are silently non-retryable. (clears 2 failures) |
| `phase-2d-storage-bug-5` | **High** | `utils/timeout.ts:23` | `withTimeout` checks `error.message.includes('timeout')` but the message produced at line 40 is `"... timed out after Xms"` — 'timeout' substring is absent. Every timeout becomes a generic `Error`, never `StorageTimeoutError`; retry/classification breaks downstream. (clears 3 failures) |
| `phase-2d-storage-bug-6` | **High** | `errors/storage-errors.ts:130-147, 205-221` | `StorageValidationError`/`StorageConfigurationError` extend core `ValidationError`, which wraps the 2nd constructor arg as `{ details: ... }`. Result: `error.context.field` is `undefined`; callers must read `error.context.details.field`. Inconsistent with other storage errors which expose flat `context`. (clears 2 failures) |
| `phase-2d-storage-bug-7` | **Medium** | `cloud-uuid-storage-service.ts:2417-2422` | `uploadStreamToLocal` listens to `'error'` only on writeStream; source-`Readable` errors (especially synchronous `emit('error')` from `read()`) become unhandled exceptions; upload promise never settles → caller hangs. Use `stream/promises.pipeline()`. (clears 2 failures + the 2 unhandled exceptions) |
| `phase-2d-storage-bug-8` | **Medium** | `cloud-uuid-storage-service.ts:2375` | `downloadFileStream` returns `null` for non-existent files while `batchDelete` throws `STORAGE_FILE_NOT_FOUND` for the same condition. Inconsistent missing-file contract across storage API. (clears 1 failure) |
| `phase-2d-storage-bug-9` | **Low** | `health/storage-health-checker.ts:226` | `stopHealthChecks` logs without a context object; `startHealthChecks` (line 107) logs with `{providers, interval}`. Minor observability inconsistency. (clears 1 failure) |

**Total impact:** 9 source fixes → 24 test failures cleared. Plus 3 stale-test rewrites + 1 fixture update = 28.

**Manifesto principle:** Trust (these are reliability primitives whose tests caught real defects). The audit's "delete or wire" rubric is what surfaced these — wiring up the tests was the action that found 9 dormant bugs in storage's reliability code.

---

## W0-T2 execution plan (preview)

Per the plan's W0-T2 step 1-4 sequencing (lowest-risk first):

1. **No mock-drift items** — skip.
2. **schema-drift (1 item):** Row 28 fixture update for `usage-reporter.test.ts`.
3. **stale-test cleanup (3 items):** Rows 12, 13, 14, 17 — rewrite to match correct behavior.
4. **real-bug fixes (9 source defects):** In order of cascading impact:
   - `bug-1` (wildcard) — clears 9 batch test failures
   - `bug-2` (swallow) — clears 2 batch test failures
   - `bug-5` (timeout string) — clears 3 timeout-utils failures
   - `bug-6` (error inheritance) — clears 2 storage-errors failures
   - `bug-4` (retry case) — clears 2 retry-manager failures
   - `bug-7` (stream errors) — clears 2 streaming failures + 2 unhandled exceptions
   - `bug-8` (download null vs throw) — clears 1 streaming failure
   - `bug-3` (lifecycle priority) — clears 1 lifecycle failure
   - `bug-9` (health-checker log) — clears 1 health-checker failure

Each `bug-*` fix gets its own commit referencing the finding ID in `closes:` footer convention. Stale-test rewrites and the schema-drift fixture each get one commit.

W0-T2 commit shape:

```
refactor(2d W0-T2 mock-drift): (none surfaced)
refactor(2d W0-T2 schema-drift): fix usage-reporter test fixture for provider_path-based grouping
refactor(2d W0-T2 stale-cleanup): rewrite 3 stale storage tests (circuit-breaker x2, health-checker x1, orphaned-file-cleaner x1)
refactor(2d W0-T2 real-bug bug-1): honor '*' wildcard in validateFile allowed_types
refactor(2d W0-T2 real-bug bug-2): re-throw BatchOperationError in batchUpload/batchDelete outer catches
refactor(2d W0-T2 real-bug bug-3): lifecycle-manager delete-priority across policies
refactor(2d W0-T2 real-bug bug-4): retry-manager pattern case fix
refactor(2d W0-T2 real-bug bug-5): withTimeout detects 'timed out' message
refactor(2d W0-T2 real-bug bug-6): StorageValidationError/StorageConfigurationError flat context
refactor(2d W0-T2 real-bug bug-7): uploadStreamToLocal handles source-stream errors via pipeline
refactor(2d W0-T2 real-bug bug-8): downloadFileStream throws StorageFileNotFoundError on missing
refactor(2d W0-T2 real-bug bug-9): stopHealthChecks logs with context object
```

12 commits total for W0-T2 (1 schema-drift + 1 stale-cleanup + 9 real-bug + 1 verification commit not yet enumerated, OR each stale test as separate commit if they touch unrelated files).

---

## Notes for the coordinator

1. **Row 14 is borderline.** The health-checker timeout test races vitest's 5s test-timeout against the production-realistic 5s health_check_timeout. Calling it `stale` because the test setup is unrealistic, but the production code shouldn't take ~5s to detect a hung provider either — that's a separate observability conversation, not a bug here. Lowering test config to ~100ms is the right move.

2. **`bug-6` (error inheritance) may have wider implications.** Core's `ValidationError` wrap pattern (`{ details: ... }`) likely affects other modules that extend it. This fix is scoped to storage — flag a follow-up to audit other consumers of core's `ValidationError`.

3. **Storage god-file is in this triage's blast radius.** 7 of the 9 source fixes touch `cloud-uuid-storage-service.ts` (the 2,681-LoC god-file from W2-T18). W0-T2 fixes will pre-shrink it slightly + give us better characterization-test starting points for W2-T18.

4. **No findings get re-opened from the original 205.** All 9 new findings are net-new (the storage reliability primitives weren't covered by the original audit's storage surface — that section focused on quota, public-folder bypass, lifecycle archive bug, failover recovery probe). The "delete-or-wire" rubric from Phase 2c finishing the job is exactly what surfaced these.

5. **Stale-test deletions are NOT used here.** All 3 stale tests are rewritten to assert correct behavior, not deleted. The tests are valuable; their assertions just need to match current correct design (lazy state machine, lazy success threshold, idempotent fs.remove, realistic timeout-vs-vitest config).
