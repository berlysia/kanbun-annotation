import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite の既定は `**/.git/**` も拒むため、`.git/worktree/` 配下の worktree ではテストファイルを読めない
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}'] } },
  test: {
    include: ['src/**/*.test.ts'],
    // DOM環境はinteractive.test.tsでのみ使用
    environment: 'happy-dom',
  },
});
