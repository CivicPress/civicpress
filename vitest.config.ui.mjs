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
        maxThreads: 2,     // try 1–4; start with 2
        minThreads: 1,
      },
    },
    // Also reduce how many test files run concurrently
    fileParallelism: 2,
    
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
