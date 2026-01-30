import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: [],
    },
    'packages/skam': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
    'packages/skam-markdown': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
    'packages/skam-xml': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
  },
  ignore: ['**/*.test.ts', '**/*.spec.ts'],
};

export default config;
