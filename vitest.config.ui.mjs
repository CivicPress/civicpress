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
        fs: {
          fileSystemRead: false, // Disable file system reads for SFC
        },
      },
    }),
  ],
  test: {
    globals: true,
    // Limit how many worker threads Vitest uses
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 2,     // Maximum 2 threads to limit CPU usage
        minThreads: 1,
      },
    },
    // CRITICAL: Resource limits to prevent system crashes
    // Maximum 2 workers (matches maxThreads)
    maxWorkers: 2,
    minWorkers: 1,
    // Reduce how many test files run concurrently
    fileParallelism: 1,   // Reduced from 2 to 1 to prevent overload
    // Limit concurrent tests within a file to prevent memory spikes
    maxConcurrency: 1,
    
    environment: 'happy-dom',
    setupFiles: ['./tests/ui/setup.ts'],
    alias: {
      '@civicpress/core': join(__dirname, 'core', 'dist/'),
      '~': join(__dirname, 'modules', 'ui', 'app'),
      '@': join(__dirname, 'modules', 'ui', 'app'),
    },
    include: [
      'tests/ui/**/*.test.ts',
      'tests/ui/**/*.spec.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
    ],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'modules/ui/app'),
      '@': resolve(__dirname, 'modules/ui/app'),
      '#app': resolve(__dirname, 'modules/ui/app'),
    },
  },
  define: {
    'process.client': true,
    'import.meta.client': true,
  },
  esbuild: {
    target: 'node18',
  },
});
