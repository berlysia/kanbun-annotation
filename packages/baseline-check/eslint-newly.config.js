import css from '@eslint/css';

export default [
  {
    files: ['**/*.css'],
    plugins: { css },
    language: 'css/css',
    rules: {
      // Newly available: supported in all core browsers, but for less than 30 months
      'css/use-baseline': ['warn', { available: 'newly' }],
    },
  },
];
