import { test, expect } from '@playwright/test'

// Regression: `useStorage` / `useSessionStorage` / `useCookie` /
// `useMemoryStorage` rendered EMPTY text post-hydration because storage
// signals didn't forward the internal `_v` field that `_bindText`'s
// fast path reads. SSR rendered `<strong>light</strong>` correctly but
// the post-hydration binding wrote `''` because `source._v` was undefined.
//
// This spec exercises the full SSR → hydration → reactive-click path
// through the StorageDemo route. Each strong is bound via the optimized
// `_bindText(theme, textNode)` form the compiler emits for
// `<strong>{() => theme()}</strong>`. If `_v` forwarding regresses, the
// strongs go empty and these asserts fail.

test.describe('@pyreon/storage hydration — strong elements bound to storage signals', () => {
  test.beforeEach(async ({ page }) => {
    // Note: do NOT apply storage.spec.ts's HMR-suppression route here.
    // Suppressing `@vite/client` (status 204) breaks click-handler
    // delegation in the fundamentals-playground dev build — the initial
    // render works but events don't fire post-mount. storage.spec.ts gets
    // away with it because those tests evaluate JS in the page context
    // rather than clicking; this spec exercises real clicks via
    // Playwright. `networkidle` alone is enough for the same-tab read-
    // and-update path; the cross-tab listener-destruction race
    // storage.spec.ts hits doesn't apply here.
    await page.addInitScript(() => {
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch {
        // Skip
      }
      document.cookie.split(';').forEach((c) => {
        document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
      })
    })
  })

  test('useStorage strong renders default value post-hydration (was empty pre-fix)', async ({
    page,
  }) => {
    await page.goto('/storage')
    await page.waitForSelector('h2:has-text("Storage")')
    await page.waitForLoadState('networkidle')

    // localStorage section: "Current: <strong>light</strong>"
    const themeCurrent = page
      .locator('h3:has-text("localStorage")')
      .locator('..')
      .locator('span:has-text("Current:") strong')
    await expect(themeCurrent).toHaveText('light')

    // Font size readout: "Font size: <strong>16px</strong>"
    const fontSize = page.locator('span:has-text("Font size:") strong')
    await expect(fontSize).toHaveText('16px')
  })

  test('useSessionStorage strong renders default value post-hydration', async ({ page }) => {
    await page.goto('/storage')
    await page.waitForSelector('h2:has-text("Storage")')
    await page.waitForLoadState('networkidle')

    // Wizard step readout: "Step <strong>1</strong> of 4"
    const wizardStep = page.locator('p').filter({ hasText: /^Step\s+\d/ }).locator('strong').first()
    await expect(wizardStep).toHaveText('1')
  })

  test('useCookie strong renders default value post-hydration', async ({ page }) => {
    await page.goto('/storage')
    await page.waitForSelector('h2:has-text("Storage")')
    await page.waitForLoadState('networkidle')

    // Cookie section: "Current: <strong>en</strong>"
    const locale = page
      .locator('h3:has-text("Cookie")')
      .locator('..')
      .locator('p:has-text("Current:") strong')
      .first()
    await expect(locale).toHaveText('en')
  })

  test('useStorage signal click updates the DOM reactively', async ({ page }) => {
    await page.goto('/storage')
    await page.waitForSelector('h2:has-text("Storage")')
    await page.waitForLoadState('networkidle')

    const themeCurrent = page
      .locator('h3:has-text("localStorage")')
      .locator('..')
      .locator('span:has-text("Current:") strong')
    await expect(themeCurrent).toHaveText('light')

    // Pre-fix: click writes localStorage but the strong stays empty
    // because the binding reads stale `source._v` (undefined).
    await page.getByRole('button', { name: 'Toggle Theme' }).click()
    await expect(themeCurrent).toHaveText('dark')

    await page.getByRole('button', { name: 'Toggle Theme' }).click()
    await expect(themeCurrent).toHaveText('light')
  })
})
