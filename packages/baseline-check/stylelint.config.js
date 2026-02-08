/** @type {import("stylelint").Config} */
export default {
  plugins: ['stylelint-plugin-use-baseline'],
  rules: {
    // Widely available: supported in all core browsers for 30+ months
    'plugin/use-baseline': [
      true,
      {
        severity: 'warning',
      },
    ],
  },
};
