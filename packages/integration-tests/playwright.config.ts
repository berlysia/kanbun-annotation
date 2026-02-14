import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'src/__tests__/playwright',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  updateSnapshots: process.env['UPDATE_SNAPSHOTS'] === '1' ? 'all' : 'missing',
  timeout: 60_000,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    deviceScaleFactor: 2,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
