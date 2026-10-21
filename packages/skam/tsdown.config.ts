import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'rendering/index': 'src/rendering/index.ts',
    'extensions/index': 'src/extensions/index.ts',
    'extensions/edu/index': 'src/extensions/edu/index.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  target: 'esnext',
  sourcemap: false,
  dts: { generator: 'oxc', sourcemap: false },
  clean: true,
});
