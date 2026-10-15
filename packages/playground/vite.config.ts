import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kanbun-annotation/',
  // vitest の実行時だけ、Vite の既定から `**/.git/**` を外す。`.git/worktree/` 配下の worktree でテストファイルを読むため。
  // dev server は既定のまま `.git/` を配らない
  ...(process.env.VITEST ? { server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}'] } } } : {}),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'web-component': resolve(__dirname, 'web-component.html'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
