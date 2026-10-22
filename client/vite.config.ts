import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts', 'src/test/**', 'src/**/*.test.ts', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'text', 'html'],
      thresholds: {
        'src/utils/**': { lines: 90 },
        'src/api/**': { lines: 90 },
      },
    },
  },
});
