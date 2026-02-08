import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/rendering/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
