import css from '@eslint/css';

export default [
  {
    files: ['**/*.css'],
    plugins: { css },
    language: 'css/css',
    rules: {
      // Widely available: supported in all core browsers for 30+ months
      'css/use-baseline': ['warn', { available: 'widely' }],
    },
  },
];
