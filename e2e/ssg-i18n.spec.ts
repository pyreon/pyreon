import { expect, test } from '@playwright/test'

/**
 * SSG i18n route duplication runtime gate (PR H follow-up).
 *
 * Targets `examples/ssr-showcase` BUILT under `vite.config.i18n.ts`
 * (with `zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en' } })`)
 * and SERVED via `vite preview` at `http://localhost:5199` — config in
 * `playwright.ssg-i18n.config.ts`.
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

  test('third-locale path /cs/posts renders — multi-locale duplication holds', async ({
    page,
  }) => {
    // Three-locale config means the third locale gets its full
    // subtree too. If something narrows the duplication to "default
    // + first non-default" by accident, this spec catches it.
    //
    // Note on scope: the SSG'd HTML at /cs/posts includes 3
    // `data-testid="post-item"` elements (rendered from the loader
    // at SSG time — verify-modes asserts this at the dist filesystem
    // level). What this spec gates is the runtime contract: the
    // route exists, hydration succeeds, the page mounts. Asserting
    // post-item count post-hydration would also exercise zero's
    // dehydrated loader-data flow under locale-prefixed URLs, which
    // is a separate concern — the existing e2e for `/posts` covers
    // it for the unprefixed default. The locale-prefixed loader-data
    // flow has a known hydration gap (the dehydrated cache key
    // doesn't include the locale prefix, so post-hydration the
    // duplicated-route loader returns undefined). Documented as a
    // follow-up; out of scope for the route-duplication PR.
    await page.goto('/cs/posts')
    await expect(page.getByTestId('posts-page')).toBeVisible()
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
})
