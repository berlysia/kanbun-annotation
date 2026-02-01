import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kanbun-annotation/',
  build: {
    outDir: '../../dist-playground',
    emptyOutDir: true,
  },
});
