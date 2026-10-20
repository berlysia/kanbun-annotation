import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', 'index.browser': 'src/index.browser.ts' },
  format: ['esm'],
  fixedExtension: false,
  target: 'esnext',
  sourcemap: false,
  dts: { generator: 'oxc', sourcemap: false },
  clean: true,
});
