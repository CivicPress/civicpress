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
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@civicpress/core': join(__dirname, 'core', 'dist/'),
      '~': join(__dirname, 'modules', 'ui', 'app'),
      '@': join(__dirname, 'modules', 'ui', 'app'),
    },
    // ONLY run CivicPress tests, exclude everything else
    include: [
      'tests/**/*.test.ts',        // Our test files
      'tests/**/*.spec.ts',        // Alternative test naming
      'core/src/**/__tests__/**/*.test.ts',  // Core unit tests
      'core/src/**/__tests__/**/*.spec.ts',  // Core unit tests (spec naming)
      'cli/src/**/__tests__/**/*.test.ts',   // CLI unit tests
      'cli/src/**/__tests__/**/*.spec.ts',   // CLI unit tests (spec naming)
      'modules/api/src/**/__tests__/**/*.test.ts',  // API unit tests
      'modules/api/src/**/__tests__/**/*.spec.ts'  // API unit tests (spec naming)
    ],
    exclude: [
      '**/node_modules/**',        // Skip all dependency tests
      '**/dist/**',                // Skip built files
      '**/build/**',               // Skip build artifacts
      '**/modules/**/node_modules/**', // Skip UI module dependencies
      '**/cli/node_modules/**',    // Skip CLI dependencies
      '**/core/node_modules/**',   // Skip core dependencies
      'tests/ui/**',               // Exclude UI tests (use vitest.config.ui.mjs with happy-dom)
    ],
    // Be very strict about what we include
    testNamePattern: undefined,
    // Don't search recursively in dependencies
    root: '.',
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'modules/ui/app'),
      '@': resolve(__dirname, 'modules/ui/app'),
    },
  },
});
