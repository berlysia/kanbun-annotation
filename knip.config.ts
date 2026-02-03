import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: [],
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
      entry: ['src/main.ts', 'index.html'],
      project: ['src/**/*.ts'],
    },
    'packages/integration-tests': {
      entry: ['src/**/*.test.ts'],
      project: ['src/**/*.ts'],
    },
  },
  ignore: ['**/*.test.ts', '**/*.spec.ts'],
  ignoreExportsUsedInFile: true,
};

export default config;
