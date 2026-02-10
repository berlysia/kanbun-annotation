import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kanbun-annotation/',
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
