import baselineJs from 'eslint-plugin-baseline-js';

export default [
  { plugins: { 'baseline-js': baselineJs } },

  baselineJs.configs.recommended({ available: 'widely', level: 'warn' }),

  {
    files: ['**/*.js'],
    rules: {
      'baseline-js/use-baseline': ['warn', { available: 'widely' }],
    },
  },
];
