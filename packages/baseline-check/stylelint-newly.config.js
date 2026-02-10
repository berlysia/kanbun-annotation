/** @type {import("stylelint").Config} */
export default {
  plugins: ['stylelint-plugin-use-baseline'],
  rules: {
    // Newly available: supported in all core browsers, but for less than 30 months
    'plugin/use-baseline': [
      true,
      {
        available: 'newly',
        severity: 'warning',
      },
    ],
  },
};
