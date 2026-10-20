import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  fixedExtension: false,
  target: 'esnext',
  sourcemap: false,
  dts: { generator: 'oxc', sourcemap: false },
  clean: true,
  deps: {
    // Playwright cannot be bundled (native binaries); workspace deps are resolved at runtime
    neverBundle: [
      'playwright',
      '@kanbun-skam/skam',
      '@kanbun-skam/skam-canvas-renderer',
      '@kanbun-skam/skam-html-renderer',
      '@kanbun-skam/skam-xml-parser',
    ],
  },
});
