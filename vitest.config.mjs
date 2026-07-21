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
    // Limit how many worker processes Vitest uses
    // Use forks instead of threads for API tests that use process.chdir()
    // Limited to prevent CPU overload when debugging tests
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        // Limit concurrent forks to prevent CPU overload
        isolate: true,
      },
    },
    // Limit concurrent test file processes to prevent CPU overload.
    // (Single value; previous duplicate `fileParallelism: 1` + `: 2`
    // produced a "Duplicate key" warning every test run.)
    fileParallelism: 2,
    alias: {
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
