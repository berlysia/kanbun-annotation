import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for SKAM Playground
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use */
  reporter: process.env.CI ? 'dot' : 'list',
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',
    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * Serve a production build from the root path. The dev server cannot be used:
   * vite.config.ts sets `base` for GitHub Pages, and dev reserves the `inline`
   * query that the URL-state tests use. pnpm is avoided so the same command
   * works inside the Playwright Docker image. `dist-e2e` keeps the published
   * `dist` untouched.
   */
  webServer: {
    command:
      './node_modules/.bin/vite build --base / --outDir dist-e2e && ./node_modules/.bin/vite preview --base / --outDir dist-e2e --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
