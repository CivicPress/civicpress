/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { join, resolve } from 'path';
import vue from '@vitejs/plugin-vue';

/**
 * Nuxt injects `import.meta.client` / `import.meta.server`; Vite's `define`
 * does NOT substitute them under Vitest's transform pipeline (they arrive as
 * `undefined`, so every `if (import.meta.client)` branch silently dead-ends
 * and its code never runs under test — while the suite still passes, giving
 * false confidence). Rewrite them in source instead.
 *
 * The replacements are space-padded to the same 18-char width as what they
 * replace, so line/column positions — and therefore stack traces — stay
 * accurate without needing a sourcemap. Ported from the BroadcastBox HW
 * frontend harness (civicpress-broadcast-box/frontend/vitest.config.ts).
 */
function nuxtImportMeta() {
  const pad = (value, width) => value.padEnd(width, ' ');
  return {
    name: 'civic-nuxt-import-meta',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.(ts|js|vue)($|\?)/.test(id) || id.includes('node_modules'))
        return;
      if (
        !code.includes('import.meta.client') &&
        !code.includes('import.meta.server')
      )
        return;
      return {
        code: code
          .replace(/import\.meta\.client/g, pad('true', 18))
          .replace(/import\.meta\.server/g, pad('false', 18)),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [
    nuxtImportMeta(),
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
        maxThreads: 2, // try 1–4; start with 2
        minThreads: 1,
      },
    },
    // Also reduce how many test files run concurrently
    fileParallelism: 2,

    environment: 'happy-dom',
    setupFiles: ['./tests/ui/setup.ts'],
    alias: {
      '@civicpress/core': join(__dirname, 'core', 'dist/'),
      // Composables that import Nuxt helpers directly from '#app' (e.g.
      // useRecordLock's `import { useNuxtApp } from '#app'`) resolve to the same
      // auto-import shim as '#imports' — the previous mapping to modules/ui/app
      // (a dir with no index) failed to resolve any bare `from '#app'` import.
      '#app': join(__dirname, 'tests', 'ui', 'nuxt-imports-shim.ts'),
      // editor-schema is a dependency of modules/ui only (consumed by the
      // collaborative editor path) and is not hoisted to the root
      // node_modules, so the bare specifier is unresolvable from the root test
      // context. Point it at the modules/ui resolution (a symlink to
      // packages/editor-schema, whose package.json `main` is dist/index.js) so
      // the test context and the SFC source context agree — same rationale as
      // the y-websocket / yjs aliases below.
      '@civicpress/editor-schema': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        '@civicpress',
        'editor-schema'
      ),
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
      // TipTap (v3) powers the collaborative editor path and is a modules/ui
      // dependency only, so the @tiptap/* specifiers are unresolvable from the
      // root test context — same hoisting issue as y-websocket/yjs above.
      // Object-form aliases match an exact specifier or one with a `<key>/`
      // prefix, so `@tiptap/extension-collaboration` does NOT shadow
      // `@tiptap/extension-collaboration-caret`. `@tiptap/pm` is aliased to its
      // package dir so its `exports` subpaths (./keymap, ./commands, ./tables…)
      // still resolve.
      '@tiptap/core': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        '@tiptap',
        'core'
      ),
      '@tiptap/pm': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        '@tiptap',
        'pm'
      ),
      '@tiptap/vue-3': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        '@tiptap',
        'vue-3'
      ),
      '@tiptap/extension-collaboration-caret': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        '@tiptap',
        'extension-collaboration-caret'
      ),
      '@tiptap/extension-collaboration': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        '@tiptap',
        'extension-collaboration'
      ),
      '@tiptap/y-tiptap': join(
        __dirname,
        'modules',
        'ui',
        'node_modules',
        '@tiptap',
        'y-tiptap'
      ),
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
    include: ['tests/ui/**/*.test.ts', 'tests/ui/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'modules/ui/app'),
      '@': resolve(__dirname, 'modules/ui/app'),
      '#app': resolve(__dirname, 'tests/ui/nuxt-imports-shim.ts'),
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
