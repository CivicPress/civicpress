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
  },
});
