/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { join, resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      script: {
        defineModel: true,
        propsDestructure: true,
      },
    }),
  ],
  test: {

    globals: true,
    environment: 'node',
    // Rebuild core/cli dist iff their source is newer (see the file) — keeps
    // CLI-subprocess tests from silently running stale compiled code.
    globalSetup: ['./tests/global-setup.mjs'],
    // Gives every test one real event-loop turn. Read the file before removing
    // it — without it an all-`execSync` test file blocks its worker past the
    // 60s birpc deadline on `onTaskUpdate` and fails the run with an unhandled
    // error while every test passes.
    setupFiles: ['./tests/fixtures/event-loop-yield.ts'],
    // forks, not threads: `process.chdir()` throws ERR_WORKER_UNSUPPORTED_OPERATION
    // in a worker thread, and tests/cli/sync.test.ts,
    // tests/core/config-discovery.test.ts and test-setup.ts's cleanup still call
    // it. (The 2026-08-08 pass removed chdir from the API and its fixtures, not
    // from the suite.) Switching pools would also not have helped the RPC-timeout
    // bug above — a blocked thread cannot read its MessagePort any more than a
    // blocked fork can read its IPC channel.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },
    // NOTE: `fileParallelism` is a BOOLEAN. This was `fileParallelism: 2` for a
    // long time under a comment claiming it capped concurrency at two files; it
    // never did — any truthy value just means "run files in parallel", so the
    // suite has always run at the pool default of `availableParallelism() - 1`
    // forks. Left at the default deliberately (that is what CI has been
    // exercising); use `maxWorkers` if a real cap is ever wanted.
    fileParallelism: true,
    alias: {
      // Resolve @civicpress/core to the built dist — the SAME single copy the
      // broadcast-box / transcription / realtime modules resolve (they require
      // it from their node_modules). Aliasing to src instead would give the test
      // a second core instance while those modules keep the dist one, so
      // singletons like CentralConfigManager diverge and cross-module e2e tests
      // break. The "ran stale dist" trap is handled instead by the globalSetup
      // above, which rebuilds core/dist whenever core/src is newer.
      '@civicpress/core': join(__dirname, 'core', 'dist/'),
      // Realtime integration tests under tests/realtime/ import the realtime
      // source directly (which pulls in ws + the Yjs stack) and the shared
      // editor-schema. These packages are workspace deps of modules/realtime,
      // not the repo root, so point them at the realtime module's resolved
      // copies. Aliasing yjs/lib0/y-protocols to a SINGLE copy also guarantees
      // one Yjs instance across the harness, server, and editor-schema (so
      // cross-package `instanceof Y.*` checks hold).
      '@civicpress/editor-schema': join(
        __dirname,
        'packages',
        'editor-schema',
        'dist/'
      ),
      ws: join(__dirname, 'modules', 'realtime', 'node_modules', 'ws'),
      yjs: join(__dirname, 'modules', 'realtime', 'node_modules', 'yjs'),
      'y-protocols': join(
        __dirname,
        'modules',
        'realtime',
        'node_modules',
        'y-protocols'
      ),
      lib0: join(__dirname, 'modules', 'realtime', 'node_modules', 'lib0'),
      '~': join(__dirname, 'modules', 'ui', 'app'),
      '@': join(__dirname, 'modules', 'ui', 'app'),
    },
    // ONLY run CivicPress tests, exclude everything else
    include: [
      'tests/**/*.test.ts',        // Our test files
      'tests/**/*.spec.ts',        // Alternative test naming
      'core/src/**/__tests__/**/*.test.ts',  // Core unit tests
      'core/src/**/__tests__/**/*.spec.ts',  // Core unit tests (spec naming)
      'cli/src/**/__tests__/**/*.test.ts',   // CLI unit tests
      'cli/src/**/__tests__/**/*.spec.ts',   // CLI unit tests (spec naming)
      'modules/api/src/**/__tests__/**/*.test.ts',  // API unit tests
      'modules/api/src/**/__tests__/**/*.spec.ts',  // API unit tests (spec naming)
      'modules/ui/app/**/__tests__/**/*.test.ts',   // UI composable/util unit tests (pure logic; no DOM needed)
      'modules/ui/app/**/__tests__/**/*.spec.ts'    // UI composable/util unit tests (spec naming)
    ],
    exclude: [
      '**/node_modules/**',        // Skip all dependency tests
      '**/dist/**',                // Skip built files
      '**/build/**',               // Skip build artifacts
      '**/modules/**/node_modules/**', // Skip UI module dependencies
      '**/cli/node_modules/**',    // Skip CLI dependencies
      '**/core/node_modules/**',   // Skip core dependencies
      'tests/ui/**',               // Exclude UI tests (use vitest.config.ui.mjs with happy-dom)
      'tests/e2e-browser/**',      // Playwright browser specs — run via `pnpm e2e`, not vitest
      // QUARANTINE — BURNED DOWN 2026-07-17 (phase-7e test-health). The 5 files
      // that formerly failed deterministically from a clean checkout are fixed
      // and now pass individually AND together from clean; they run in CI again.
      // The root causes were NOT flaky tests — they surfaced 3 real product bugs
      // (CSRF base-path regression on public config-validation; a backwards
      // enrollment_codes→devices FK that PRAGMA foreign_keys=ON broke; the
      // ack-gated start_session mis-keying the device room by DB id) plus a
      // publish-idempotency collision and stale test expectations. The
      // CIVIC_TEST_QUARANTINE env hook is retained (empty) so a future
      // regression can be parked here WITH a tracker entry — do not add files
      // without one.
      ...(process.env.CIVIC_TEST_QUARANTINE === '1' ? [] : []),
    ],
    // Be very strict about what we include
    testNamePattern: undefined,
    // Don't search recursively in dependencies
    root: '.',
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'modules/ui/app'),
      '@': resolve(__dirname, 'modules/ui/app'),
    },
  },
});
