import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    include: ['test/e2e/**/*.test.ts'],
    globals: true,
    environment: 'node',
    setupFiles: [],
    testTimeout: 60000,
    // E2Eテストは順次実行
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});