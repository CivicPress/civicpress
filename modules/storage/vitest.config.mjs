/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Module-local Vitest config so `pnpm --filter @civicpress/storage test:run`
// actually picks up the tests under `src/__tests__/`. The repo-root
// `vitest.config.mjs` deliberately scopes its include list to
// `core/`, `cli/`, `modules/api/`, `modules/ui/`, and `tests/**`, which
// excludes storage. This file is the minimum needed to run the storage
// suite in isolation (added in Phase 2c for storage-004 closure).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    alias: {
      '@civicpress/core': resolve(__dirname, '../../core/dist/'),
    },
    root: '.',
  },
});
