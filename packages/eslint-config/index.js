import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import playwrightPlugin from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { resolvePolicy } from '@namankalola/guardrails';
import ariseqaQa from './plugin/index.js';

export { ariseqaQa };

// The flat preset carries its own plugin instance; reuse it everywhere so ESLint
// does not see two different "playwright" plugins.
const playwrightRecommended = playwrightPlugin.configs['flat/recommended'];
const playwright = playwrightRecommended.plugins.playwright;

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  'reports/**',
  'playwright-report/**',
  'test-results/**',
  'blob-report/**',
  'allure-*/**',
  '.guardrails/**',
];

/** Rules that guard against hard waits and flaky patterns anywhere in test code. */
const HARD_WAIT_RULES = {
  'playwright/no-wait-for-timeout': 'error',
  'playwright/no-wait-for-selector': 'error',
  'playwright/no-networkidle': 'error',
  'playwright/no-element-handle': 'error',
  'playwright/no-eval': 'error',
  'playwright/no-page-pause': 'error',
  'playwright/no-force-option': 'error',
  'playwright/missing-playwright-await': 'error',
};

/**
 * Build the enterprise flat config for a Playwright + TypeScript repository.
 * Rule severities and globs are driven by the repo's guardrails.config.yml so
 * local lint, the pre-commit hook and CI all apply the same policy.
 *
 * @param {{ tsconfigRootDir?: string, policy?: import('@namankalola/guardrails').Policy, ignores?: string[] }} [options]
 */
export function createConfig({ tsconfigRootDir = process.cwd(), policy, ignores = [] } = {}) {
  const { codeQuality, framework, testQuality } = policy ?? resolvePolicy({ cwd: tsconfigRootDir }).policy;
  const unsafe = codeQuality.typeSafety === 'strict' ? 'error' : 'warn';
  const pom = framework.enforcePom ? 'error' : 'off';

  return defineConfig(
    { ignores: [...DEFAULT_IGNORES, ...ignores] },

    // 1. Code quality - every TS file
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
        globals: globals.node,
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      plugins: { playwright, ariseqa: ariseqaQa },
      rules: {
        eqeqeq: ['error', 'smart'],
        'no-var': 'error',
        'prefer-const': 'error',
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-eval': 'error',
        'no-implied-eval': 'off', // superseded by the type-aware variant below
        '@typescript-eslint/no-implied-eval': 'error',
        'no-new-func': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/return-await': ['error', 'in-try-catch'],
        // `async` wrappers that just return a promise are idiomatic in page objects / WebActions
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/no-explicit-any': unsafe,
        '@typescript-eslint/no-unsafe-assignment': unsafe,
        '@typescript-eslint/no-unsafe-member-access': unsafe,
        '@typescript-eslint/no-unsafe-call': unsafe,
        '@typescript-eslint/no-unsafe-return': unsafe,
        '@typescript-eslint/no-unsafe-argument': unsafe,
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
        ],
        '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],
        // Core rules only: eslint-plugin-sonarjs is LGPL-3.0, which the enterprise licence policy denies.
        complexity: ['error', codeQuality.maxComplexity],
        'max-depth': ['error', 4],
        'max-params': ['warn', 5],
        'no-duplicate-imports': 'error',
        'no-lonely-if': 'warn',
        ...HARD_WAIT_RULES,
        'ariseqa/no-cross-app-import': [pom, { appsDir: framework.appsDir }],
      },
    },
    { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },

    // 2/3. Automated test quality + framework layering - spec files
    {
      files: framework.specGlobs,
      extends: [playwrightRecommended],
      rules: {
        ...HARD_WAIT_RULES,
        'playwright/no-focused-test': 'error',
        'playwright/no-skipped-test': 'off', // skips are allowed with a ticket; enforced by the quarantine gate
        'playwright/expect-expect': ['error', { assertFunctionPatterns: testQuality.assertFunctionPatterns }],
        'playwright/valid-expect': 'error',
        'playwright/prefer-web-first-assertions': 'error',
        'playwright/no-useless-await': 'error',
        'playwright/no-useless-not': 'error',
        'playwright/no-nested-step': 'off', // nested steps give readable reports for multi-part flows
        'playwright/consistent-spacing-between-blocks': 'off', // layout belongs to Prettier
        'playwright/no-conditional-in-test': 'off', // data-driven rows branch on expectedResult by design
        'playwright/no-conditional-expect': 'off',
        'ariseqa/require-test-tag': [testQuality.requireTags ? 'error' : 'off', { allowed: testQuality.allowedTags }],
        'ariseqa/no-page-in-spec': pom,
        'ariseqa/no-inline-locator': pom,
        '@typescript-eslint/no-restricted-imports': [
          pom,
          {
            paths: [
              {
                name: '@playwright/test',
                importNames: ['test', 'expect'],
                allowTypeImports: true,
                message:
                  'Import test/expect from the app fixtures (src/apps/<app>/fixtures) so page objects are injected (POM rule 1).',
              },
            ],
          },
        ],
      },
    },

    // 2. Framework layering - page objects
    {
      files: framework.pageObjectGlobs,
      rules: { 'ariseqa/page-object-encapsulation': pom },
    },

    prettier,
  );
}

export default createConfig;
