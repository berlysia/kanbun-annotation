import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // DOM環境はinteractive.test.tsでのみ使用
    environment: 'happy-dom',
  },
});
