// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import pluginTs from '@typescript-eslint/eslint-plugin';

const unusedVarsRule = ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

export default withNuxt(
  {
    files: ['**/*.ts', '**/*.vue'],
    ignores: ['**/*.test.ts', '**/__tests__/**'],
    plugins: { '@typescript-eslint': pluginTs },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
    },
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**'],
    plugins: { '@typescript-eslint': pluginTs },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
    },
  },
);
