// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import pluginTs from '@typescript-eslint/eslint-plugin';

const unusedVarsRule = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

// Tier A: safety / correctness — `error`-enforced, all sites cleaned in
// lint-rollout followup #4 (spec
// docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md).
const STYLE_RULES_TIER_A = {
  'vue/no-v-html': 'error',
  'vue/no-mutating-props': 'error',
};

// Tier B: code quality — `warn`, all sites cleaned (or zero sites) in
// followup #4. Includes 4 zero-violation rules enabled for future
// regression detection.
const STYLE_RULES_TIER_B = {
  'vue/require-explicit-emits': 'warn',
  'vue/no-template-shadow': 'warn',
  'vue/v-on-event-hyphenation': 'warn',
  'vue/no-deprecated-filter': 'warn',
  'vue/component-definition-name-casing': 'warn',
  'vue/component-name-in-template-casing': 'warn',
  '@typescript-eslint/no-dynamic-delete': 'warn',
  '@typescript-eslint/unified-signatures': 'warn',
  'import/first': 'warn',
};

// Tier C: deferred — `warn`-signal, sites accumulate for a future focused
// session. ~89 live warnings expected (nuxt/prefer-import-meta 33,
// vue/multi-word-component-names 35, vue/prop-name-casing 4,
// vue/require-default-prop 17). Future sessions can drive these to zero.
const STYLE_RULES_TIER_C_DEFERRED = {
  'nuxt/prefer-import-meta': 'warn',
  // 'ignores' exempts Nuxt-convention filenames (file-based routing forces
  // single-word names like `index`, `login`, `error`, etc.) plus the
  // single-word brand component `Logo`. A future improvement is to use a
  // file-pattern override that disables the rule under `pages/`, `layouts/`,
  // and for `error.vue` automatically; for now, the static list is the
  // simplest correct fix.
  'vue/multi-word-component-names': ['warn', {
    ignores: [
      // Nuxt root special names
      'error', 'default', 'index',
      // Nuxt page filenames (single-word route segments)
      'login', 'logout', 'register', 'edit', 'new', 'raw', 'create',
      'activity', 'diagnostics', 'notifications', 'profile', 'setup',
      'drafts',
      // Single-word brand component (explicit allow)
      'Logo',
    ],
  }],
  'vue/prop-name-casing': 'warn',
  'vue/require-default-prop': 'warn',
};

// Tier D: kept off — Prettier owns formatting; outdated for Vue 3; low
// value. Documented as intentional non-goals per the lint-rule-rollout
// spec §7 + followup #4 spec §3.
const STYLE_RULES_TIER_D_OFF = {
  'vue/html-indent': 'off',
  'vue/html-closing-bracket-newline': 'off',
  'vue/max-attributes-per-line': 'off',
  'vue/singleline-html-element-content-newline': 'off',
  'vue/multiline-html-element-content-newline': 'off',
  'vue/first-attribute-linebreak': 'off',
  'vue/html-quotes': 'off',
  'vue/html-self-closing': 'off',
  'vue/attributes-order': 'off',
  'vue/no-multiple-template-root': 'off',
  'nuxt/nuxt-config-keys-order': 'off',
};

export default withNuxt(
  {
    files: ['**/*.ts', '**/*.vue'],
    ignores: ['**/*.test.ts', '**/__tests__/**'],
    plugins: { '@typescript-eslint': pluginTs },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      ...STYLE_RULES_TIER_A,
      ...STYLE_RULES_TIER_B,
      ...STYLE_RULES_TIER_C_DEFERRED,
      ...STYLE_RULES_TIER_D_OFF,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**'],
    plugins: { '@typescript-eslint': pluginTs },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      ...STYLE_RULES_TIER_A,
      ...STYLE_RULES_TIER_B,
      ...STYLE_RULES_TIER_C_DEFERRED,
      ...STYLE_RULES_TIER_D_OFF,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
