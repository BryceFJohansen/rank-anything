import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import html from 'eslint-plugin-html';
import globals from 'globals';

export default defineConfig([
  {
    files: ['**/*.{js,cjs,mjs,html}'],
    extends: [js.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['app.js', 'engine.js', '**/*.html'],
    languageOptions: {
      sourceType: 'script',
      globals: globals.browser,
    },
  },
  {
    // The ranking engine also exports CommonJS for the Node tests.
    files: ['engine.js', 'Rank-Anything.html'],
    languageOptions: { globals: { module: 'readonly' } },
  },
  {
    files: ['**/*.html'],
    plugins: { html },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
]);
