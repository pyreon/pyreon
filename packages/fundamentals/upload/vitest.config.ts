import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'node',
  // Real-Chromium tests (`*.browser.test.ts`) run under `vitest.browser.config.ts`.
  excludeBrowserTests: true,
})
