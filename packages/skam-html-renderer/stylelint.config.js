export default {
  customSyntax: 'postcss-styled-syntax',
  plugins: ['stylelint-plugin-use-baseline'],
  rules: {
    'plugin/use-baseline': [true, { severity: 'warning' }],
  },
};
