import tseslint from 'typescript-eslint';
import baselineJs from 'eslint-plugin-baseline-js';

export default tseslint.config(
  { plugins: { 'baseline-js': baselineJs } },

  baselineJs.configs.recommended({ available: 'widely', level: 'warn' }),

  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.base],
  }
);
