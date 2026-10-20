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
      entry: ['index.html', 'web-component.html'],
      project: ['src/**/*.ts'],
    },
    'packages/integration-tests': {
      // bench と取得 CLI は package.json の script / README の手順から直接実行される
      entry: ['src/**/*.test.ts', 'src/**/*.bench.ts', 'src/fixtures/kojiki/update-source.ts'],
      project: ['src/**/*.ts'],
      // used only by the generated .doctest/ and the tarball consumer test, both outside `project`
      ignoreDependencies: ['@kanbun-skam/skam-web-component'],
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
