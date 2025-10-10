import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  // 基本的な推奨設定
  js.configs.recommended,

  // すべてのファイルに共通の設定
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // ESModule Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',

        // Browser-like globals available in Node.js
        fetch: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',

        // TypeScript/Node types
        NodeJS: 'readonly',

        // Timer functions
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        queueMicrotask: 'readonly',

        // Testing globals (Vitest)
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
  },

  // TypeScriptファイルの設定
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      prettier: prettier,
    },
    rules: {
      // TypeScript ESLint推奨ルール
      ...typescript.configs.recommended.rules,

      // カスタムルール
      '@typescript-eslint/no-explicit-any': 'error',  // anyを完全に禁止
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Prettierルール
      'prettier/prettier': 'error',

      // Prettier設定と競合するESLintルールを無効化
      ...prettierConfig.rules,
    },
  },

  // JavaScriptファイルの設定（CommonJS）
  {
    files: ['**/*.{js,cjs}'],
    plugins: {
      prettier: prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      ...prettierConfig.rules,
    },
  },

  // 除外パターン
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '**/packages/db/src/python/**',
      '**/packages/db/.venv/**',
      '**/.venv/**',
      '**/venv/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/*.d.ts',
      '**/vitest.config.*.mts',
      '**/vite.config.ts',
      '**/svelte.config.js',
    ],
  },
];