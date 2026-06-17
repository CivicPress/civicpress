/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Workspace-local Vitest config so `pnpm -C modules/api test:run` actually
// finds tests. Without it, Vitest searches upward to the repo-root config whose
// include globs are repo-relative and match nothing from this cwd, so the run
// reported "No test files found" (see known-test-issues W3).
//
// Scope: the API's COLOCATED unit tests under `src/**/__tests__/`. The repo-root
// `vitest.config.mjs` remains the canonical full suite and additionally owns the
// API integration/e2e tests under `tests/api/**`, `tests/e2e/**`, and
// `tests/integration/**`. Colocated tests import `@civicpress/core`, so map it
// to core's built output (matching the storage config).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    alias: {
      '@civicpress/core': resolve(__dirname, '../../core/dist/'),
    },
    root: '.',
  },
});
