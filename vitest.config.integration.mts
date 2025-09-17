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