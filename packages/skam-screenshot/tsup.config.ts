import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // Playwright cannot be bundled (native binaries); workspace deps resolved at runtime
  external: [
    'playwright',
    '@kanbun/skam',
    '@kanbun/skam-html-renderer',
    '@kanbun/skam-xml-parser',
  ],
});
