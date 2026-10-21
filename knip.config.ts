import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      project: ['scripts/**/*.ts'],
      // the consumer check calls node_modules/typescript5/bin/tsc by path, which knip cannot see
      ignoreDependencies: ['typescript5'],
      vitest: false,
    },
    'packages/skam': {
      project: ['src/**/*.ts'],
    },
    'packages/skam-xml-parser': {
      project: ['src/**/*.ts'],
    },
    'packages/skam-xml-stringify': {
      project: ['src/**/*.ts'],
    },
    'packages/skam-html-renderer': {
      project: ['src/**/*.ts'],
    },
    'packages/playground': {
      // calibrate.ts は生成の CLI が vite の build の API で bundle し、build-kojiki-page.ts は build:kojiki から直接実行される
      entry: [
        'index.html',
        'web-component.html',
        'src/kojiki-page/calibrate.ts',
        'scripts/build-kojiki-page.ts',
      ],
      project: ['src/**/*.ts', 'scripts/**/*.ts'],
    },
    'packages/integration-tests': {
      // bench は package.json の script から直接実行される
      entry: ['src/**/*.test.ts', 'src/**/*.bench.ts'],
      project: ['src/**/*.ts'],
      // used only by the generated .doctest/ and the tarball consumer test, both outside `project`
      ignoreDependencies: ['@kanbun-skam/skam-web-component'],
    },
    'packages/kojiki': {
      // 取得 CLI は package.json の fetch script (dist/update-source.js) から直接実行される
      entry: ['src/cli.ts'],
      project: ['src/**/*.ts'],
    },
    'packages/skam-screenshot': {
      project: ['src/**/*.ts'],
    },
    'packages/skam-web-component': {
      project: ['src/**/*.ts'],
    },
    'packages/baseline-check': {
      entry: ['scripts/*.js', 'stylelint-newly.config.js'],
      project: ['scripts/**/*.js'],
    },
  },
  ignoreExportsUsedInFile: true,
};

export default config;
