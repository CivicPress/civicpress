/**
 * One real event-loop turn per test.
 *
 * ## Why this file exists
 *
 * Vitest runs each test file in a forked child process and talks to the main
 * process over an IPC channel using birpc, which puts a hard **60 second**
 * timeout on every round-trip call. The runner issues one such call —
 * `onTaskUpdate` — as tests start and finish.
 *
 * A worker can only read the main process's reply when its event loop reaches
 * the poll phase. Nothing in this suite guarantees that it ever does:
 *
 *   - CLI tests drive the product through `execSync('node cli/dist/index.js …')`,
 *     which blocks the loop for the entire subprocess.
 *   - The `await`s between those calls almost all resolve from an already-warm
 *     cache (a repeated dynamic `import`, an already-settled promise). Awaiting
 *     a settled promise drains the MICROTASK queue only — it does not advance
 *     the loop to timers or poll.
 *
 * So an all-synchronous test file runs start to finish without a single loop
 * turn. `tests/cli/users.test.ts` measured **44s of uninterrupted block on an
 * idle machine and 64s under full-suite CPU contention** — past the deadline.
 * The reply had long since arrived; it just sat unread in the channel, and when
 * the worker finally came up for air Node ran the timers phase before the poll
 * phase, so the expired timeout fired first. Vitest counts the resulting
 * rejection as an unhandled error and exits 1 with every single test passing:
 *
 *     Test Files  201 passed (201)
 *          Tests  1845 passed | 9 skipped (1854)
 *         Errors  1 error
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * The individual fixtures now await their subprocesses (see
 * `createCLITestContext`), but that only covers tests that go through a shared
 * fixture — `tests/cli/sync.test.ts` and friends spawn the CLI from their own
 * `beforeEach`. This hook is the guarantee that does not depend on any test
 * remembering: every test gets one genuine trip through the poll phase, which
 * bounds the worst-case block to a single test's synchronous work instead of a
 * whole file's.
 *
 * `setImmediate` is the right primitive: its callback runs in the check phase,
 * which the loop can only reach by completing a full iteration — poll included.
 * It is imported from `node:timers` rather than read off the global so that a
 * test which has installed fake timers cannot stall this hook forever.
 */

import { setImmediate as realSetImmediate } from 'node:timers';
import { beforeEach } from 'vitest';

beforeEach(
  () => new Promise<void>((resolve) => realSetImmediate(() => resolve()))
);
