/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

// Workspace-local Vitest config so `pnpm -C core test` actually runs core's
// colocated unit tests under `src/**/__tests__/` (previously `core/package.json`
// declared `"test": "jest"` with no jest config, so every suite failed to
// parse — see known-test-issues W1).
//
// Scope: core's COLOCATED unit tests only. The repo-root `vitest.config.mjs`
// remains the canonical full suite and additionally owns the integration tests
// under `tests/core/**`. Core's colocated tests import core source via relative
// paths, so no `@civicpress/core` alias is needed here.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    root: '.',
  },
});
