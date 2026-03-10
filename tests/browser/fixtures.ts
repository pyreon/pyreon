/**
 * Playwright test fixture that waits for Pyreon to be loaded on the page.
 *
 * Usage in tests:
 *   import { test, expect } from "./fixtures"
 *   test("my test", async ({ pyreonPage }) => { ... })
 */

import { test as base, expect } from "@playwright/test"
import type { Page } from "@playwright/test"

export { expect }

export const test = base.extend<{ pyreonPage: Page }>({
  pyreonPage: async ({ page }, use) => {
    await page.goto("/")
    // Wait for Pyreon bundle to load and set window.__PYREON__
    await page.waitForFunction(() => (window as any).__PYREON__ !== undefined, null, {
      timeout: 10_000,
    })
    await use(page)
  },
})
