import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'packages/web-ui'],
    silent: true, // テスト実行時のログを抑制
    logLevel: 'error', // エラーレベル以上のみ表示
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'packages/*/dist/',
        'packages/web-ui/',
        'packages/db/src/python/',
        '*.config.ts',
        '*.config.js',
      ],
    },
  },
  resolve: {
    alias: {
      '@sebas-chan/shared-types': path.resolve(__dirname, 'packages/shared-types/src'),
      '@sebas-chan/core': path.resolve(__dirname, 'packages/core/src'),
      '@sebas-chan/db': path.resolve(__dirname, 'packages/db/src'),
    },
  },
});