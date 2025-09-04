import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'packages/web-ui'],
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
      '@sebas-chang/shared-types': path.resolve(__dirname, 'packages/shared-types/src'),
      '@sebas-chang/core': path.resolve(__dirname, 'packages/core/src'),
      '@sebas-chang/db': path.resolve(__dirname, 'packages/db/src'),
    },
  },
});