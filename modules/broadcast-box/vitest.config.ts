/**
 * Vitest Configuration for Broadcast Box Module
 */

import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
        maxWorkers: 1,
        minWorkers: 1,
      },
    },
    fileParallelism: 1,
    maxConcurrency: 1,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    alias: {
      '@civicpress/core': join(__dirname, '../../core/dist/'),
      '@civicpress/realtime': join(__dirname, '../realtime/dist/'),
      '@civicpress/storage': join(__dirname, '../storage/dist/'),
    },
  },
});
