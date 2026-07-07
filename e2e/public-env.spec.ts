/**
 * E2E — @pyreon/zero public env inlining in a REAL browser.
 *
 * Proves what the unit + integration tests can't: the vite-plugin actually
 * inlines ZERO_PUBLIC_* into the CLIENT bundle (fixing the browser-{} bug), and
 * the ZERO_PUBLIC_ security boundary holds end-to-end (a non-public var never
 * reaches the browser). Runs against examples/ssr-showcase (5175), whose
 * `.env` carries the fixtures.
 */
import { expect, test } from '@playwright/test'

test.describe('public env inlining (real browser)', () => {
  test('ZERO_PUBLIC_ value reaches the browser; a non-public var does NOT', async ({ page }) => {
    await page.goto('/public-env-probe')
    await page.waitForSelector('[data-testid="public-env-probe"]', { timeout: 10_000 })

    // SSR-rendered public value.
    await expect(page.locator('[data-testid="pe-ssr"]')).toHaveText('hello-from-public-env')

    // Client-only onMount read → proves the CLIENT bundle carries the inlined
    // value (this is the exact path that returned {} before the fix).
    await expect(page.locator('[data-testid="pe-client"]')).toHaveText('hello-from-public-env')

    // Security boundary: the non-ZERO_PUBLIC_ var's value is nowhere in the page
    // (not in SSR HTML, not in the inlined define script).
    const html = await page.content()
    expect(html).not.toContain('only-on-server-never-in-browser')
    expect(html).not.toContain('ZERO_PRIVATE_MESSAGE')
  })
})
