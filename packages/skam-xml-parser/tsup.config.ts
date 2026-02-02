import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'index.browser': 'src/index.browser.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
});
