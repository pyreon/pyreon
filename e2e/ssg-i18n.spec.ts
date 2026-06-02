import { expect, test } from '@playwright/test'

/**
 * SSG i18n route duplication runtime gate (PR H follow-up).
 *
 * Targets `examples/ssr-showcase` BUILT under `vite.config.i18n.ts`
 * (with `zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en' } })`)
 * and SERVED via `vite preview` at `http://localhost:5199` — config in
 * `e2e-configs/ssg-i18n.config.ts`.
 *
 * Companion to the build-artifact gate `verify-modes ssr-showcase ×
 * ssg-i18n`. The verify-modes cell asserts the EMITTED dist filesystem
 * (per-locale `index.html` files at the right prefixes). This spec
 * asserts the RUNTIME contract: real Chromium loads each per-locale
 * page, runs hydration, the router matches the duplicated route record,
 * and a RouterLink click triggers client-side navigation that lands at
 * the right URL.
 *
 * Strategy `prefix-except-default`:
 *   - Default locale `en` keeps unprefixed URLs (`/`, `/about`, `/posts`).
 *     SEO-canonical for primary-locale apps.
 *   - Non-default locales `de` and `cs` get explicit prefixes (`/de/`,
 *     `/de/about`, `/cs/about`, …).
 *
 * What's gated:
 *   1. **Default-locale unprefixed load** — `/about` resolves to the
 *      About page (not 404, not the de-locale variant). Proves the
 *      default locale path stays unprefixed under
 *      `prefix-except-default`.
 *   2. **Non-default locale prefixed load** — `/de/about` resolves to
 *      the same About component (i18n duplicates URL patterns, not
 *      content modules). Proves `expandRoutesForLocales` produced a
 *      route record at the prefixed pattern AND the router's matcher
 *      finds it at request time. Hydration succeeds with no console
 *      errors.
 *   3. **Cross-locale RouterLink navigation** — clicking the home link
 *      from `/de/about` does NOT do a full reload (the click is a
 *      client-side push). The current rendered nav uses unprefixed
 *      hrefs, so the click lands at `/` (the default-locale home). This
 *      gates the runtime contract that BOTH locale subtrees stay
 *      hydrated under the same client.
 *   4. **Locale prefix sanity** — `/cs/posts` exists and renders the
 *      Posts page. Proves multi-locale duplication isn't single-pair
 *      lucky; the third locale also got its full subtree.
 *
 * What this DOESN'T cover:
 *   - Per-locale CONTENT differences. The ssr-showcase routes don't
 *     branch on locale, so all variants render the same English text.
 *     A real i18n consumer would read `useLocale()` from
 *     `@pyreon/zero` and translate strings. That's user-side concern;
 *     the framework's job is just to make the URL pattern AND the
 *     route record exist.
 *   - Locale-aware nav (RouterLinks that flip prefix on locale change).
 *     `prefix-except-default` doesn't currently expose route-level
 *     `meta.locale` to consumers; that's a follow-up after PR I.
 *   - Direct-link navigation — same caveat as the ssg-subpath spec.
 *     Static-host directory rewriting is a host-config concern.
 *
 * Bisect targets: removing the `expandRoutesForLocales` call in
 * `ssg-plugin.ts:autoDetectStaticPaths` AND `vite-plugin.ts`'s
 * virtual-routes load → the build never emits `dist/de/about/index.html`,
 * the preview server returns 404, and spec #2 fails on
 * `expect(page.getByTestId('about-page')).toBeVisible()`.
 *
 * Bisect-verified: rebuilt lib/ with the calls reverted in BOTH src
 * files, ran the suite → spec #2 fails with "expected to be visible".
 * Restored → 4/4 specs pass.
 */
test.describe('SSG i18n route duplication runtime', () => {
  test('default-locale path /about renders unprefixed (prefix-except-default)', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/about')
    await expect(page.getByTestId('about-page')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('non-default-locale path /de/about renders the duplicated route', async ({
    page,
  }) => {
    // The de-locale variant of /about exists ONLY because
    // `expandRoutesForLocales` fanned the FileRoute into per-locale
    // duplicates. Pre-PR-H this URL would 404 because the route
    // record never existed at the prefixed pattern.
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/de/about')
    // Same component, same testid — i18n duplicates URL patterns,
    // not content modules. The about-page testid is from the SHARED
    // `about.ts` source file that all three locale variants inherit.
    await expect(page.getByTestId('about-page')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('third-locale path /cs/posts renders with hydrated loader data — multi-locale duplication holds', async ({
    page,
  }) => {
    // Three-locale config means the third locale gets its full
    // subtree too. If something narrows the duplication to "default
    // + first non-default" by accident, this spec catches it.
    //
    // Loader-data hydration. The SSG'd HTML at /cs/posts includes 3
    // `data-testid="post-item"` elements rendered from the loader at
    // SSG time (`prefetchLoaderData` runs during the synthetic SSR
    // build), AND embeds the data as `window.__PYREON_LOADER_DATA__=
    // {"/cs/posts":[...]}` for the client to pick up.
    //
    // On the client, `hydrateLoaderData(router, serialized)` walks
    // the matched chain for the current path and sets each record's
    // data by `record.path`. For the duplicated /cs/posts route,
    // `record.path === '/cs/posts'` (PR H sets urlPath to the
    // locale-prefixed pattern), so the lookup succeeds and the
    // hydrated page renders with the 3 SSG-emitted post-items.
    //
    // PR #516 originally documented this assertion as a "known gap"
    // — `useLoaderData()` was returning undefined post-hydration.
    // Investigation in PR #519 traced the root cause: `vite preview`
    // does SPA fallback (serves `dist/index.html` for every URL), so
    // /cs/posts was actually served the HOME page HTML — which has
    // no loader data inline script. The framework hydration was
    // correct all along; the test was running against a server that
    // wasn't honoring the per-route HTML SSG produced. The
    // playwright config now uses `scripts/serve-ssg.ts` which does
    // directory rewriting like real static hosts, so this assertion
    // can now actually run.
    await page.goto('/cs/posts')
    await expect(page.getByTestId('posts-page')).toBeVisible()
    // Post-hydration item count — must remain at 3. A regression
    // where loader-data hydration drops the duplicated-route data
    // would fail with "expected 3, received 0".
    const items = page.getByTestId('post-item')
    await expect(items).toHaveCount(3)
    await expect(items.first()).toContainText('Getting Started with Pyreon')
    // Window global must carry the dehydrated payload so consumers
    // that read it post-mount (e.g. analytics, devtools) see the
    // same shape SSR produced.
    const loaderData = await page.evaluate(() => {
      const data = (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
      return data && typeof data === 'object' ? Object.keys(data) : null
    })
    expect(loaderData).toEqual(['/cs/posts'])
  })

  test('RouterLink click from /de/about does client-side push (not full reload)', async ({
    page,
  }) => {
    // Stash a sentinel on the window — a client-side push preserves
    // it; a full reload wipes the JS context so the property is gone.
    // Same pattern the ssg-subpath spec uses to prove pushState vs
    // reload. Critical for i18n: a regression that made the locale
    // duplicate render a separate-app subtree (instead of sharing
    // hydration) would fail the sentinel check even if the URL bar
    // updates correctly.
    await page.goto('/de/about')
    await expect(page.getByTestId('about-page')).toBeVisible()

    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__pyreonI18nSentinel
        = 'preserved'
    })

    // The current nav renders unprefixed RouterLinks regardless of
    // current locale (no locale-aware nav yet — that's a follow-up).
    // So clicking "Home" from /de/about lands at /, the default-locale
    // home. What we're testing: the click is a client-side push, the
    // sentinel survives, the home page renders. Locale-flipping nav
    // is out of scope for this PR.
    const homeLink = page.getByTestId('nav-home')
    await expect(homeLink).toHaveAttribute('href', '/')
    await homeLink.click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('home-page')).toBeVisible()
    await expect(page.getByTestId('about-page')).toBeHidden()

    const sentinel = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__pyreonI18nSentinel,
    )
    expect(sentinel).toBe('preserved')
  })

  test('per-locale 404: dist/de/404.html exists for unmatched /de/* paths (PR K)', async ({
    page,
  }) => {
    // PR K — the SSG closeBundle walks the route tree per-locale and
    // emits dist/{locale}/404.html alongside the default dist/404.html.
    // Static hosts (Netlify per-directory `errors_404`, Cloudflare
    // Pages, GitHub Pages, nginx) serve the right per-prefix 404 file
    // for unmatched URLs under that prefix.
    //
    // **Bisect-verified at L1.** Reverting the per-locale walker in
    // `ssg-plugin.ts` to single-shot mode (only `dist/404.html`
    // emitted) → this test FAILS with `Expected response.status to be
    // 200, got 404` because `scripts/serve-ssg.ts` falls back to
    // `dist/404.html` (status 404) when the per-locale file doesn't
    // exist. The HTTP-status assertion is what makes the spec load-
    // bearing: ssr-showcase's `_404.ts` is the SAME source for all
    // locales (renders byte-identical HTML), so a simple "testid
    // visible" assertion would FALSE-POSITIVE — both the missing-
    // file fallback AND the real per-locale file render the same
    // not-found-page DOM. Restored → spec passes (200 response from
    // the actual `dist/de/404.html` file).
    //
    // Real i18n apps with `useI18n()` in `_404` would also be able to
    // assert locale-specific text, but the framework's contract today
    // is "file exists at the locale-prefixed path with the same
    // _404.tsx output, host serves it under that prefix." Per-locale
    // CONTENT (German text in `/de/404.html`) requires server-side
    // i18n context in the 404 renderer — separate concern, tracked
    // in PR L5.
    const localeResponse = await page.goto('/de/404.html')
    expect(localeResponse?.status()).toBe(200)
    await expect(page.getByTestId('not-found-page')).toBeVisible()
    // PR L5 — layout chrome wraps the 404. The router-driven 404 render
    // navigates to a synthetic non-matching probe URL per locale, so the
    // matched chain is `[rootLayout, syntheticLeaf]`. The rendered HTML
    // carries the layout's nav AND the 404 content. Bisect-verified at
    // verify-modes layer (`ssr-showcase × ssg` cell asserts the same
    // co-occurrence at the dist filesystem layer); this asserts the
    // runtime contract (real Chromium parses + paints both).
    await expect(page.getByTestId('nav-home')).toBeVisible()
    await expect(page.getByTestId('nav-about')).toBeVisible()

    // Default-locale 404 still emitted at the root (no regression).
    const defaultResponse = await page.goto('/404.html')
    expect(defaultResponse?.status()).toBe(200)
    await expect(page.getByTestId('not-found-page')).toBeVisible()
    await expect(page.getByTestId('nav-home')).toBeVisible()
  })

  test('hreflang sitemap.xml carries xhtml:link cross-references per locale (PR K)', async ({
    page,
  }) => {
    // PR K — `seoPlugin({ sitemap: { hreflang: true } })` (configured
    // in `vite.config.i18n.ts`) reads the i18n config from the SSG
    // manifest the zero plugin writes, clusters URLs by their
    // un-prefixed form, and emits `<xhtml:link rel="alternate"
    // hreflang>` siblings inside each `<url>` entry plus an
    // `x-default` entry pointing at the default-locale URL.
    //
    // **Bisect-verified at L1.** Reverting the SSG plugin's manifest
    // emit to omit the `i18n` field (line ~1041 of `ssg-plugin.ts`)
    // → this spec FAILS with `Expected substring "xmlns:xhtml=..."
    // not in sitemap` because `seoPlugin`'s `hreflang: true` auto-
    // detect path returns undefined when the manifest doesn't carry
    // i18n, and `generateSitemap` then emits the plain-sitemap form
    // (no xmlns:xhtml namespace, no xhtml:link siblings). Restored
    // → spec passes. This makes the manifest-i18n-emit codepath
    // load-bearing, not decorative.
    //
    // We fetch /sitemap.xml directly (no JS / hydration involved —
    // pure static asset served by the directory-rewriting server)
    // and assert the hreflang shape.
    const response = await page.goto('/sitemap.xml')
    expect(response?.status()).toBe(200)
    const xml = await response!.text()

    // xhtml namespace declared on <urlset> (required for valid XML
    // when using xhtml:link).
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')

    // /about cluster — all 3 locales + x-default.
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>',
    )
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about"/>',
    )
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="cs" href="https://example.com/cs/about"/>',
    )
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>',
    )

    // Dynamic-route × locale cross-product — /posts/1 cluster also
    // gets hreflang siblings (proves SSG-enumerated paths flow through
    // hreflang clustering, not just static routes).
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/posts/1"/>',
    )
  })
})
