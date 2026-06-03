import { expect, test } from '@playwright/test'

/**
 * SSG subpath / base-path runtime gate (PR E).
 *
 * Targets `examples/ssr-showcase` BUILT under `vite.config.subpath.ts`
 * (with `zero({ base: '/blog/' })`) and SERVED via `vite preview` at
 * `http://localhost:5198` — config in `e2e-configs/ssg-subpath.config.ts`.
 *
 * Companion to the build-artifact gate `verify-modes ssr-showcase ×
 * ssg-subpath`. The verify-modes cell asserts the EMITTED HTML carries
 * the `/blog/` prefix on asset URLs and RouterLink hrefs. This spec
 * asserts the RUNTIME contract: real Chromium loads the page, runs
 * hydration, the router's `stripBase` correctly strips `/blog/` from
 * the incoming URL when matching routes, and a RouterLink click triggers
 * client-side navigation that lands at `/blog/about` with the right
 * page rendered.
 *
 * What's gated:
 *   1. **Initial load + hydration under base** — `/blog/` resolves to
 *      the home page, no console errors, hydration succeeds (signal
 *      handlers attach).
 *   2. **Asset URLs work** — the prerendered `<script src="/blog/assets/…">`
 *      actually loads (200), proving Vite's base wiring AND the static
 *      host's URL serving cooperate.
 *   3. **In-app navigation** — clicking the About RouterLink does a
 *      client-side push (no full reload), URL bar updates to
 *      `/blog/about`, the about page renders. Proves
 *      `createRouter({ base })` correctly handles both the rendered
 *      href AND the incoming path under base.
 *   4. **Reactive interaction post-hydration** — incrementing the home
 *      page's signal-driven counter actually patches the DOM under
 *      base (proves hydration wired the click handler correctly).
 *
 * What this DOESN'T cover:
 *   - Direct-link navigation to `/blog/about` (no trailing slash).
 *     Requires the static host to do directory rewriting (Netlify /
 *     Cloudflare Pages / GitHub Pages do this; vite preview doesn't).
 *     That's a host-config concern, not a framework concern.
 *
 * Bisect targets: removing the `base: config.base` line from
 * `vite-plugin.ts:config()` breaks asset URL prefixing → spec #2 fails.
 * Removing the `base: __ssgBase` forward in `ssg-plugin.ts`'s
 * SSR_ENTRY_SOURCE breaks RouterLink href prefixing → spec #3 fails on
 * the URL assertion.
 */
test.describe('SSG subpath / base-path runtime', () => {
  test('initial load at /blog/ renders home page without console errors', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/blog/')
    await expect(page.getByTestId('home-page')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('asset URLs are served correctly under /blog/ prefix', async ({ page }) => {
    // Track every JS/CSS request the page makes during initial load.
    // Vite's prerendered HTML carries `<script src="/blog/assets/...">`
    // — those requests must succeed (200) for hydration to work. If the
    // base wiring is broken (assets emitted at `/assets/...` while
    // the host serves at `/blog/`), this fails with a flood of 404s.
    const failedAssetRequests: string[] = []
    page.on('response', (response) => {
      const url = response.url()
      const isAsset = url.includes('/assets/') && (url.endsWith('.js') || url.endsWith('.css'))
      if (isAsset && response.status() >= 400) {
        failedAssetRequests.push(`${response.status()} ${url}`)
      }
    })

    await page.goto('/blog/')
    await expect(page.getByTestId('home-page')).toBeVisible()

    expect(failedAssetRequests).toEqual([])

    // Sanity: the script tag in the HTML must include the /blog/ prefix.
    // Mirrors what verify-modes asserts at the build-artifact level —
    // here we assert it from the live Chromium DOM after hydration.
    const scriptSrcs = await page.locator('script[src]').evaluateAll((els) =>
      els.map((el) => (el as HTMLScriptElement).src),
    )
    const hasBlogPrefixedScript = scriptSrcs.some((src) =>
      src.includes('/blog/assets/'),
    )
    expect(hasBlogPrefixedScript).toBe(true)
  })

  test('RouterLink click navigates to /blog/about via client-side push', async ({
    page,
  }) => {
    await page.goto('/blog/')
    await expect(page.getByTestId('home-page')).toBeVisible()

    // The about link's href is what proves the router-base wiring at
    // SSR time. Verify it has the /blog/ prefix BEFORE clicking — if
    // this assertion fails, the rendered href was wrong, the click
    // would still work but for the wrong reason.
    const aboutLink = page.getByTestId('nav-about')
    await expect(aboutLink).toHaveAttribute('href', '/blog/about')

    // Stash a sentinel on the window — pushState preserves it; a full
    // reload wipes the JS context so the property is gone. More reliable
    // than `framenavigated` which fires for in-app pushState too in
    // Playwright.
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__pyreonNavSentinel = 'preserved'
    })

    await aboutLink.click()

    // URL bar updates immediately — that's the pushState assertion.
    await expect(page).toHaveURL(/\/blog\/about$/)
    // About page content shows. Proves stripBase('/blog/about', '/blog/')
    // returned '/about' and the router matched the about route.
    await expect(page.getByTestId('about-page')).toBeVisible()
    // Home page is gone — sanity check that we didn't render BOTH.
    await expect(page.getByTestId('home-page')).toBeHidden()

    // No full reload happened: the sentinel set on window before the
    // click survived. A full page reload would re-execute entry-client
    // and `__pyreonNavSentinel` would be undefined.
    const sentinel = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__pyreonNavSentinel,
    )
    expect(sentinel).toBe('preserved')
  })

  test('post-hydration counter signal works under base', async ({ page }) => {
    // After SSG rendering + hydration under /blog/, the counter on the
    // home page must be reactive. This proves hydration successfully
    // attached its signal handlers — base prefixing didn't break
    // hydration's element-matching pass. (A failure here would mean
    // the DOM matched but events didn't wire up — symptom of a
    // mid-hydration crash that hydration recovers from silently.)
    await page.goto('/blog/')
    await expect(page.getByTestId('home-page')).toBeVisible()

    const counterValue = page.getByTestId('counter-value')
    await expect(counterValue).toHaveText('0')

    await page.getByTestId('increment').click()
    await expect(counterValue).toHaveText('1')

    await page.getByTestId('increment').click()
    await page.getByTestId('increment').click()
    await expect(counterValue).toHaveText('3')
  })
})
