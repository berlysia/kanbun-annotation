import { defineConfig } from 'tsdown';

export default defineConfig({
  // cli.ts は直接実行する入口。dist/update-source.js として出す (fetch script が呼ぶ)
  entry: { index: 'src/index.ts', 'update-source': 'src/cli.ts' },
  format: ['esm'],
  fixedExtension: false,
  target: 'esnext',
  sourcemap: false,
  dts: { generator: 'oxc', sourcemap: false },
  clean: true,
  deps: {
    // workspace deps are resolved at runtime
    neverBundle: ['@kanbun-skam/skam'],
  },
});
