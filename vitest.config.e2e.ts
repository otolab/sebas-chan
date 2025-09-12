import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'e2e',
    include: ['test/e2e/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30秒
    hookTimeout: 60000, // 60秒
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // 全テストを1つのプロセスで実行
      },
    },
  },
  resolve: {
    alias: {
      '@sebas-chan/core': path.resolve(__dirname, './packages/core/src'),
      '@sebas-chan/db': path.resolve(__dirname, './packages/db/src'),
      '@sebas-chan/server': path.resolve(__dirname, './packages/server/src'),
      '@sebas-chan/shared-types': path.resolve(__dirname, './packages/shared-types/src'),
    },
  },
});