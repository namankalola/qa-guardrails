import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', 'docs/**', 'templates/**', 'dist/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: { eqeqeq: ['error', 'smart'], 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
];
