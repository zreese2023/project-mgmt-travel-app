import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.test.ts'],
          // One shared Postgres: run files serially to avoid cross-test interference.
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'text', 'html'],
      thresholds: {
        'src/lib/**': { lines: 90 },
      },
    },
  },
});
