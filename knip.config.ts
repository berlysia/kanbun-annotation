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
      // used only by the generated .doctest/ and the tarball consumer test, both outside `project`
      ignoreDependencies: ['@kanbun-skam/skam-canvas-renderer', '@kanbun-skam/skam-web-component'],
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
    'packages/skam-html-renderer/src/__tests__/helpers/css-contract.ts',
    'packages/skam-web-component/src/__tests__/helpers/style-contract.ts',
    // README doctest extractor, imported only by integration-tests *.test.ts
    'packages/integration-tests/src/doctest/extract.ts',
    // Legacy render-tree used by active tests (layout-vertical.test.ts etc.)
    'packages/skam-canvas-renderer/src/render-tree.ts',
  ],
  ignoreExportsUsedInFile: true,
};

export default config;
