/**
 * Playwright test fixture that waits for Nova to be loaded on the page.
 *
 * Usage in tests:
 *   import { test, expect } from "./fixtures"
 *   test("my test", async ({ novaPage }) => { ... })
 */

import { test as base, expect } from "@playwright/test"
import type { Page } from "@playwright/test"

export { expect }

export const test = base.extend<{ novaPage: Page }>({
  novaPage: async ({ page }, use) => {
    await page.goto("/")
    // Wait for Nova bundle to load and set window.__NOVA__
    await page.waitForFunction(() => (window as any).__NOVA__ !== undefined, null, {
      timeout: 10_000,
    })
    await use(page)
  },
})
