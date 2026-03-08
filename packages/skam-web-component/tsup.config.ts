import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/auto.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
