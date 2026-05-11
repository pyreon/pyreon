import { expect, test } from '@playwright/test'

/**
 * SSG i18n `prefix`-strategy real-Chromium runtime gate (PR L3 follow-
 * up to PR L1).
 *
 * Targets `examples/ssr-showcase` BUILT under `vite.config.i18n-prefix.ts`
 * (with `zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en',
 * strategy: 'prefix' } })`) and SERVED via `scripts/serve-ssg.ts` at
 * `http://localhost:5200` — config in `playwright.ssg-i18n-prefix.config.ts`.
 *
 * Companion to:
 *   - `verify-modes ssr-showcase × ssg-i18n-prefix` cell (PR L1, build
 *     artifact: asserts `dist/en/about/index.html` exists + `dist/about/
 *     index.html` does NOT)
 *   - The existing `e2e/ssg-i18n.spec.ts` (prefix-except-default
 *     runtime gate)
 *
 * What's distinct from prefix-except-default:
 *   - Default locale `en` is PREFIXED — URLs are `/en/`, `/en/about`,
 *     `/en/posts/1`. There is NO unprefixed default — `/about` does
 *     NOT exist as a dist file.
 *   - Root `/` does not have a prerendered HTML in this dist tree.
 *     What the framework serves at `/` is a host-config concern (real
 *     Netlify / Cloudflare can redirect-to-default-locale; vite preview
 *     / serve-ssg would 404). We do NOT test the root specifically
 *     because the framework explicitly punts that to host config.
 *   - `x-default` hreflang sibling on the sitemap points at the
 *     en-PREFIXED URL (`/en/about`), not the unprefixed `/about`.
 *
 * What's gated:
 *   1. **Default-locale IS prefixed**: `/en/about` renders, no console
 *      errors. This is the strategy's distinguishing case — under
 *      prefix-except-default this same URL would 404 (the default
 *      locale doesn't get prefixed there).
 *   2. **No unprefixed default**: `/about` is NOT served. Critical
 *      contract — under `prefix` strategy the unprefixed URL must
 *      return 404 (or the host's redirect-to-default if configured).
 *      `scripts/serve-ssg.ts` returns 404 because there's no
 *      `dist/about/index.html` to serve.
 *   3. **Per-locale dynamic-route × prefix-strategy**: `/de/posts/1`
 *      renders the post content. Cross-product (PR A × PR H) works
 *      under prefix strategy too — same router code paths handle both
 *      strategies, this locks the contract.
 *   4. **Hreflang `x-default` points at en-PREFIXED URL under prefix**:
 *      `/sitemap.xml` carries `<xhtml:link rel="alternate"
 *      hreflang="x-default" href="https://example.com/en/about"/>`
 *      (en-prefixed, NOT bare `/about` like prefix-except-default).
 *      This is the strategy's distinguishing contract on the sitemap
 *      side — PR L1's verify-modes cell already asserts the file
 *      content; this gate asserts the runtime fetch sees it.
 *
 * What this DOESN'T cover:
 *   - Root-`/` behavior under `prefix` — host-config concern (Netlify /
 *     Cloudflare can redirect to `/en/`; serve-ssg / vite preview can't
 *     without explicit `_redirects` entry). Out of scope; document the
 *     limitation, don't gate it.
 *   - Locale-aware RouterLink emission — RouterLinks still emit
 *     literal hrefs from `to` regardless of strategy. Out of scope
 *     (separate locale-aware-link feature not yet shipped).
 *
 * Bisect target: revert `expandRoutesForLocales`'s `prefix`-strategy
 * branch so it behaves like `prefix-except-default` regardless of
 * config → spec 1 fails ("expected visible" — no `/en/about` exists),
 * spec 3 fails ("expected visible" — no `/de/posts/1` under default-
 * locale-unprefixed semantics either when the strategy logic is
 * forced to prefix-except-default with `de` as default... actually,
 * the bisect target is simpler: drop the strategy field entirely or
 * force prefix-except-default semantics → spec 1's `/en/about` 404s
 * because the build emits `/about` as the default-locale variant
 * instead of `/en/about`).
 */
test.describe('SSG i18n prefix-strategy runtime', () => {
  test('default-locale path /en/about IS prefixed (strategy distinguishing case)', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Under prefix strategy, /en/about MUST exist as a prerendered
    // dist file (NOT /about). Pre-bisect: build emits dist/en/about/
    // index.html; serve-ssg directory-rewrites /en/about →
    // dist/en/about/index.html; about-page testid renders.
    await page.goto('/en/about')
    await expect(page.getByTestId('about-page')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('unprefixed /about does NOT exist under prefix strategy', async ({ page }) => {
    // Critical contract — `prefix` strategy means EVERY locale is
    // prefixed including default. Unprefixed URLs must not resolve.
    // `scripts/serve-ssg.ts` returns 404 (no `dist/about/index.html`
    // exists; 404.html fallback is the per-locale `dist/en/404.html`
    // for the default-locale variant, but the root `/about` request
    // falls through to the en-prefixed 404).
    //
    // We hit the URL via `request` (not `page.goto`) so we can read
    // the HTTP status directly. `page.goto` redirects on 404 and
    // makes the assertion confusing.
    const response = await page.request.get('/about')
    expect(response.status()).toBe(404)
  })

  test('per-locale dynamic-route × prefix-strategy: /de/posts/1 renders', async ({
    page,
  }) => {
    // Dynamic-route × locale cross-product (PR A × PR H) works under
    // prefix strategy too. The router matches `/de/posts/1` to the
    // duplicated [id].ts route record with `params.id = '1'`; loader
    // runs against that param at SSG time; hydrated page renders.
    //
    // Cross-product cardinality under prefix strategy = same as
    // prefix-except-default (3 IDs × 3 locales = 9 paths), all
    // prefixed: /en/posts/{1,2,3}, /de/posts/{1,2,3}, /cs/posts/{1,2,3}.
    await page.goto('/de/posts/1')
    await expect(page.getByTestId('post-page')).toBeVisible()
    // Post 1's title from routes/posts/[id].ts's POSTS array. Mirrors
    // the same assertion the prefix-except-default spec makes — if
    // the loader didn't pick up params.id correctly under the
    // duplicated record, the title would be wrong.
    await expect(page.getByTestId('post-title')).toContainText(
      'Getting Started with Pyreon',
    )
  })

  test('hreflang sitemap.xml: x-default points at en-PREFIXED URL under prefix', async ({
    page,
  }) => {
    // PR K (#519) emitted hreflang cross-references; PR L1 added the
    // verify-modes cell asserting the file contents at build time.
    // This spec asserts the SERVED file (via serve-ssg) carries the
    // strategy-distinguishing `x-default` href.
    //
    // Under prefix-except-default: x-default → /about (unprefixed)
    // Under prefix: x-default → /en/about (en-prefixed)
    //
    // This is the sitemap-side contract that distinguishes the two
    // strategies. Drop the prefix-strategy branch in
    // `expandRoutesForLocales` (forcing prefix-except-default
    // semantics regardless of config) → sitemap emits
    // `x-default href="https://example.com/about"` and this
    // assertion fails.
    const response = await page.request.get('/sitemap.xml')
    expect(response.status()).toBe(200)
    const body = await response.text()

    // Must contain en-prefixed x-default for at least one URL.
    expect(body).toContain('hreflang="x-default"')
    expect(body).toMatch(/hreflang="x-default"\s+href="https:\/\/example\.com\/en\//)

    // And explicitly NOT the unprefixed `/about` form — under prefix
    // strategy there's no canonical unprefixed URL for x-default to
    // point at.
    expect(body).not.toMatch(/hreflang="x-default"\s+href="https:\/\/example\.com\/about"/)
  })
})
