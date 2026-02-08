import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kanbun-annotation/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'happy-dom',
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
