import { defineConfig } from 'tsdown';

const common = {
  fixedExtension: false,
  target: 'esnext',
  sourcemap: false,
} as const;

export default defineConfig([
  {
    ...common,
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: { generator: 'oxc', sourcemap: false },
    clean: true,
  },
  {
    // Browser bundle for <script> use; runs after the first config, so it must not clean dist/
    ...common,
    entry: { index: 'src/index.ts' },
    format: ['iife'],
    globalName: 'SKAMCanvasRenderer',
    platform: 'browser',
    deps: { alwaysBundle: [/^@kanbun-skam\/skam(\/|$)/] },
    dts: false,
    clean: false,
  },
]);
