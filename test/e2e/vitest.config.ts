import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // E2Eテストは時間がかかるため
    hookTimeout: 30000,
    setupFiles: ['./setup.ts']
  },
});