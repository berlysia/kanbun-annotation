import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['scripts/adr-migrate-fm.ts'],
      project: ['scripts/**/*.ts'],
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
      ignoreDependencies: ['@kanbun-skam/skam-xml-parser'], // used in test files only
    },
    'packages/playground': {
      entry: ['src/main.ts', 'src/web-component.ts', 'index.html', 'web-component.html'],
      project: ['src/**/*.ts'],
    },
    'packages/integration-tests': {
      entry: ['src/**/*.test.ts'],
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
  ignore: [
    '**/*.test.ts',
    '**/*.spec.ts',
    // Test helpers referenced by test files (not reachable from entry points)
    'packages/skam-canvas-renderer/src/__tests__/recording-context.ts',
    'packages/skam/src/__tests__/operations/helpers.ts',
    // Legacy render-tree used by active tests (layout-vertical.test.ts etc.)
    'packages/skam-canvas-renderer/src/render-tree.ts',
  ],
  ignoreBinaries: ['playwright'], // installed dynamically in CI
  ignoreExportsUsedInFile: true,
};

export default config;
