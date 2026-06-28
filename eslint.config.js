import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['assets/**', 'lumi-derm-website/assets/**', 'node_modules/**', '.wrangler/**'],
  },
  eslint.configs.recommended,
  {
    files: ['lumi-derm-website/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      sourceType: 'script',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
  },
  {
    files: ['scripts/test-browser.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['worker/**/*.ts', 'src/**/*.ts', 'test/**/*.ts'],
  })),
);
