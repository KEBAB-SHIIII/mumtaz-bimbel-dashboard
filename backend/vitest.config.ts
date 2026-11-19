import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // PostgreSQL in-process (PGlite) + Argon2id: beri ruang waktu yang wajar.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
