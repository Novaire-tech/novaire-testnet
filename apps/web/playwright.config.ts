import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /.*\.real-wallet\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Opt-in only: drives a real Freighter extension against live testnet.
      // Run via `npm run test:e2e:real`, not part of the default `chromium` project.
      name: 'real-wallet',
      testMatch: /.*\.real-wallet\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
