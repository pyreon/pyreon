import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'node',
  // The real-Chromium smoke (`*.browser.test.ts`) runs under `vitest.browser.config.ts`.
  excludeBrowserTests: true,
})
