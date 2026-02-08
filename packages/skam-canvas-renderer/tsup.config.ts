import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
  },
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'SKAMCanvasRenderer',
    noExternal: ['@kanbun/skam'],
    outExtension: () => ({ js: '.iife.js' }),
  },
]);
