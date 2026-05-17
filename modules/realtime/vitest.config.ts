import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000, // 30 seconds for integration tests
    // CRITICAL: Resource limits to prevent system crashes
    // Use forks for better isolation (required for some realtime tests)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },
    // Maximum 1 worker process to limit CPU usage for integration tests
    maxWorkers: 1,
    minWorkers: 1,
    // Only run one test file at a time
    fileParallelism: 1,
    // Limit concurrent tests within a file to prevent memory spikes
    maxConcurrency: 1,
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
