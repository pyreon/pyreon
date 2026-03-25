import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  webServer: {
    command: 'bun run --filter=@pyreon/fundamentals-playground dev',
    port: 5173,
    timeout: 30000,
    reuseExistingServer: !process.env.CI,
  },
})
