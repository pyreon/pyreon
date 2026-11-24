import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // The real-Chromium hydration proof runs under `vitest.browser.config.ts`.
  excludeBrowserTests: true,
})
