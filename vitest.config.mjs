/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@civicpress/core': join(__dirname, 'core', 'dist/'),
    },
    // ONLY run CivicPress tests, exclude everything else
    include: [
      'tests/**/*.test.ts',        // Our test files
      'tests/**/*.spec.ts'         // Alternative test naming
    ],
    exclude: [
      '**/node_modules/**',        // Skip all dependency tests
      '**/dist/**',                // Skip built files
      '**/build/**',               // Skip build artifacts
      '**/modules/**/node_modules/**', // Skip UI module dependencies
      '**/cli/node_modules/**',    // Skip CLI dependencies
      '**/core/node_modules/**'    // Skip core dependencies
    ],
    // Be very strict about what we include
    testNamePattern: undefined,
    // Don't search recursively in dependencies
    root: '.',
  },
});
