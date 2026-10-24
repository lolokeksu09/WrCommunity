import { defineConfig, devices } from '@playwright/test';

const requestedWorkers = process.env.WRC_E2E_WORKERS === undefined
  ? 2
  : Number(process.env.WRC_E2E_WORKERS);
if (!Number.isInteger(requestedWorkers) || requestedWorkers < 1 || requestedWorkers > 4) {
  throw new Error('WRC_E2E_WORKERS must be an integer from 1 to 4');
}

export default defineConfig({
  testDir: '../tests/e2e',
  fullyParallel: false,
  // CI runs separate spec files concurrently; each file remains serial.
  // Keep local development lightweight and avoid per-test parallelism on shared PostgreSQL.
  workers: process.env.CI ? requestedWorkers : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: '../test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm start',
    url: 'http://localhost:3000/health/ready',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' },
  },
});
