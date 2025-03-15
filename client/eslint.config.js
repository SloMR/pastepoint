import angular from '@angular-eslint/eslint-plugin';
import tslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import eslint from '@eslint/js';
import globals from 'globals';
import templateParser from '@angular-eslint/template-parser';

export default [
  // TypeScript configuration
  {
    files: ['**/*.ts'],
    plugins: {
      '@angular-eslint': angular,
      '@typescript-eslint': tslint,
    },
    languageOptions: {
      parser: parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.jest,
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...angular.configs.recommended.rules,
      ...tslint.configs.recommended.rules,
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@angular-eslint/prefer-standalone': 'off',
    },
  },
  // HTML template configuration
  {
    files: ['**/*.html'],
    plugins: {
      '@angular-eslint': angular,
    },
    languageOptions: {
      parser: templateParser,
    },
    rules: {
      ...angular.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.spec.ts'],
    languageOptions: {
      globals: {
        jasmine: 'writable',
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        expect: 'readonly',
      },
    },
  },
];
