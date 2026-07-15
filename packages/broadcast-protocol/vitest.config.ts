import { defineConfig } from 'vitest/config';

// Local Vitest config so `pnpm -C packages/broadcast-protocol test:run` resolves
// this package's tests instead of inheriting the monorepo-root config (whose
// `include` globs are scoped to core/cli/modules and miss `packages/*`).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
