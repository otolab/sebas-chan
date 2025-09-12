import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'integration',
    include: ['test/integration/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30秒
    hookTimeout: 60000, // 60秒
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // 全テストを1つのプロセスで実行（DB接続を共有）
      },
    },
    setupFiles: ['./test/integration/setup.ts'],
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