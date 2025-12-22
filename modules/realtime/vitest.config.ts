import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    alias: {
      '@civicpress/core': join(__dirname, '../../core/dist/'),
    },
  },
  resolve: {
    alias: {
      '@civicpress/core': join(__dirname, '../../core/dist/'),
    },
  },
});
