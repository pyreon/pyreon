import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // Real-Chromium tests (`*.browser.test.tsx`) run under `vitest.browser.config.ts`.
  excludeBrowserTests: true,
})
