/** @type {import("stylelint").Config} */
export default {
  customSyntax: 'postcss-styled-syntax',
  plugins: ['stylelint-plugin-use-baseline'],
  rules: {
    'plugin/use-baseline': [
      true,
      {
        available: 'widely',
        severity: 'warning',
      },
    ],
  },
};
