import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * `atlas verify-browser` e2e — no webServer: the command under test is a
 * SUBPROCESS that boots its own dev server and its own Chromium. The spec is
 * one ordered lifecycle (scan → baseline-create → compare → merged catalog),
 * so a single worker is the correct shape, not a limitation.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'atlas-verify-browser', testMatch: /atlas-verify-browser\.spec\.ts$/ }],
})
