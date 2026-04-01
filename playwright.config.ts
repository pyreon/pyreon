import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'e2e',
      testMatch: /^(?!.*visual-regression|.*ssr-showcase).*\.spec\.ts$/,
      use: {
        baseURL: 'http://localhost:5173',
      },
    },
    {
      name: 'visual',
      testMatch: /visual-regression\.spec\.ts$/,
      use: {
        baseURL: 'http://localhost:5174',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'ssr-showcase',
      testMatch: /ssr-showcase\.spec\.ts$/,
      use: {
        baseURL: 'http://localhost:5175',
      },
    },
  ],
  webServer: [
    {
      command: 'bun run --filter=@pyreon/fundamentals-playground dev',
      port: 5173,
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=@pyreon/example-ui-system-showcase dev -- --port 5174',
      port: 5174,
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=@pyreon/ssr-showcase dev -- --port 5175',
      port: 5175,
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
