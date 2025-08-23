module.exports = {
  root: true,
  env: { es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
    'prettier'
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
    extraFileExtensions: ['.vue']
  },
  rules: {
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off'
  },
  ignorePatterns: ['node_modules/', 'dist/', '.nuxt/', '.output/']
}