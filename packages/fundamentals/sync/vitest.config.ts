import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // `.browser.test.ts(x)` run under vitest.browser.config.ts (real Chromium).
  excludeBrowserTests: true,
})
