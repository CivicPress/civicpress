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
      '#imports': join(__dirname, 'tests', 'ui', 'nuxt-imports-shim.ts'),
      // The UI tests live at the repo root (tests/ui/**), but these packages are
      // dependencies of modules/ui only and are not hoisted to the root
      // node_modules. Without these aliases, root-context resolution of the
      // bare specifiers fails — which both breaks the transform of any test
      // file importing them AND prevents vi.mock('y-websocket') from matching
      // the module the composable resolves. Point them at the modules/ui
      // resolution so the test context and the source context agree.
      'y-websocket': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        'y-websocket'
      ),
      yjs: join(__dirname, 'modules', 'ui', 'node_modules', 'yjs'),
      // vue-i18n is a transitive dep of @nuxtjs/i18n (not a direct dep), so it
      // is unresolvable from the root test context. Aliasing it fixes the D3
      // hazard: tests that transitively import app/composables/useTypedI18n.ts
      // (RecordForm.test.ts, EditorHeader.test.ts) previously failed to
      // transform on `Failed to resolve import "vue-i18n"`.
      'vue-i18n': join(
        __dirname,
        'node_modules',
        '.pnpm',
        'vue-i18n@11.4.4_vue@3.5.35_typescript@5.9.3_',
        'node_modules',
        'vue-i18n'
      ),
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
      '#imports': resolve(__dirname, 'tests/ui/nuxt-imports-shim.ts'),
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
