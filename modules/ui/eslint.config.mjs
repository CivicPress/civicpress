// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import pluginTs from '@typescript-eslint/eslint-plugin';

const unusedVarsRule = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

// TODO(lint-style-rules): @nuxt/eslint pulls in many vue/nuxt style rules
// outside the lint-rule-rollout's scope (spec §7 non-goals). Disabled here
// to keep the rollout focused on @typescript-eslint/no-explicit-any. A
// future session should triage and enable selectively.
const STYLE_RULES_DEFERRED = {
  'vue/attributes-order': 'off',
  'vue/html-self-closing': 'off',
  'vue/multi-word-component-names': 'off',
  'vue/no-multiple-template-root': 'off',
  'vue/no-v-html': 'off',
  'vue/require-default-prop': 'off',
  'vue/require-explicit-emits': 'off',
  'vue/component-definition-name-casing': 'off',
  'vue/component-name-in-template-casing': 'off',
  'vue/html-indent': 'off',
  'vue/html-closing-bracket-newline': 'off',
  'vue/max-attributes-per-line': 'off',
  'vue/singleline-html-element-content-newline': 'off',
  'vue/multiline-html-element-content-newline': 'off',
  'vue/first-attribute-linebreak': 'off',
  'vue/html-quotes': 'off',
  'vue/no-mutating-props': 'off',
  'vue/prop-name-casing': 'off',
  'vue/no-template-shadow': 'off',
  'vue/v-on-event-hyphenation': 'off',
  'vue/no-deprecated-filter': 'off',
  'nuxt/prefer-import-meta': 'off',
  'nuxt/nuxt-config-keys-order': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-dynamic-delete': 'off',
  '@typescript-eslint/unified-signatures': 'off',
  'import/first': 'off',
};

export default withNuxt(
  {
    files: ['**/*.ts', '**/*.vue'],
    ignores: ['**/*.test.ts', '**/__tests__/**'],
    plugins: { '@typescript-eslint': pluginTs },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      ...STYLE_RULES_DEFERRED,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**'],
    plugins: { '@typescript-eslint': pluginTs },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      ...STYLE_RULES_DEFERRED,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
