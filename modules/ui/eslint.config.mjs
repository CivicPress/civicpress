// @ts-check
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import vueparser from 'vue-eslint-parser';

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLDivElement: 'readonly',
  Event: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
};

const VITEST_GLOBALS = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

const NUXT_AUTO_IMPORTS = {
  defineNuxtConfig: 'readonly',
  defineNuxtPlugin: 'readonly',
  defineNuxtRouteMiddleware: 'readonly',
  defineEventHandler: 'readonly',
  useState: 'readonly',
  useRoute: 'readonly',
  useRouter: 'readonly',
  useRuntimeConfig: 'readonly',
  useFetch: 'readonly',
  useNuxtApp: 'readonly',
  useNuxtData: 'readonly',
  useCookie: 'readonly',
  navigateTo: 'readonly',
  createError: 'readonly',
  showError: 'readonly',
  abortNavigation: 'readonly',
  ref: 'readonly',
  reactive: 'readonly',
  computed: 'readonly',
  watch: 'readonly',
  watchEffect: 'readonly',
  onMounted: 'readonly',
  onUnmounted: 'readonly',
  onBeforeMount: 'readonly',
  onBeforeUnmount: 'readonly',
  nextTick: 'readonly',
  defineProps: 'readonly',
  defineEmits: 'readonly',
  defineExpose: 'readonly',
  defineModel: 'readonly',
  withDefaults: 'readonly',
  useSlots: 'readonly',
  useAttrs: 'readonly',
};

export default [
  {
    ignores: ['.nuxt/**', '.output/**', 'dist/**', 'node_modules/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  {
    files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { sourceType: 'module' },
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS, ...VITEST_GLOBALS, ...NUXT_AUTO_IMPORTS },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts', '**/__tests__/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { sourceType: 'module' },
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS, ...VITEST_GLOBALS, ...NUXT_AUTO_IMPORTS },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueparser,
      parserOptions: {
        parser: tsparser,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS, ...VITEST_GLOBALS, ...NUXT_AUTO_IMPORTS },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js'],
    languageOptions: { sourceType: 'module', globals: NODE_GLOBALS },
  },
];
