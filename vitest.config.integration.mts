import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['test/integration/**/*.test.ts'],
    globals: true,
    environment: 'node',
    setupFiles: [],
    testTimeout: 30000,
    silent: false,  // デバッグのため一時的にfalseに変更
    logLevel: 'info',  // デバッグのため一時的にinfoに変更
    pool: 'forks',  // 各テストファイルを独立したプロセスで実行
    poolOptions: {
      forks: {
        singleFork: true,  // 単一のforkで順次実行
      },
    },
  },
  resolve: {
    alias: {
      '@sebas-chan/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@sebas-chan/db': path.resolve(__dirname, './packages/db/src/index.ts'),
      '@sebas-chan/shared-types': path.resolve(__dirname, './packages/shared-types/src/index.ts'),
      '@sebas-chan/server': path.resolve(__dirname, './packages/server/src/index.ts'),
      '@sebas-chan/reporter-sdk': path.resolve(__dirname, './packages/reporter-sdk/src/index.ts'),
    },
  },
});