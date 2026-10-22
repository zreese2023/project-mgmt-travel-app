import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/coverage/**', '**/node_modules/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['server/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      // CLAUDE.md: no untyped `any`; justify any exception with an eslint-disable comment.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  prettier,
]);
