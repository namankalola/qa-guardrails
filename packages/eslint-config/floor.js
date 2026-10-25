import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import playwrightPlugin from 'eslint-plugin-playwright';

const playwright = playwrightPlugin.configs['flat/recommended'].plugins.playwright;

/**
 * Enterprise floor config. CI runs this as a second ESLint pass with
 * `--config <this file> --no-inline-config`, so these rules apply even if a
 * repo weakens its own eslint.config or sprinkles `eslint-disable` comments.
 * Keep it small: only rules whose violation is a real defect or risk.
 */
export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'reports/**',
      'playwright-report/**',
      'test-results/**',
      '.guardrails/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: process.cwd() },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, playwright },
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-debugger': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/missing-playwright-await': 'error',
    },
  },
);
