/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Workspace-local Vitest config so `pnpm -C cli test` actually runs the CLI's
// colocated unit tests under `src/**/__tests__/` (previously `cli/package.json`
// declared `"test": "jest"` with no jest config, so every suite failed to
// parse — see known-test-issues W2).
//
// Scope: the CLI's COLOCATED unit tests only. The repo-root `vitest.config.mjs`
// remains the canonical full suite and additionally owns the integration tests
// under `tests/cli/**`. Some colocated tests import `@civicpress/core`, so map
// it to core's built output (matching the storage/api configs).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    alias: {
      '@civicpress/core': resolve(__dirname, '../core/dist/'),
    },
    root: '.',
  },
});
