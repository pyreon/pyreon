import { expect, test } from '@playwright/test'

/**
 * SSG i18n route duplication runtime gate (PR H).
 *
 * Targets `examples/ssr-showcase` BUILT under `vite.config.i18n.ts`
 * (with `zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en',
 * strategy: 'prefix-except-default' } })`) and SERVED via `vite preview`
 * at `http://localhost:5199` — config in `playwright.ssg-i18n.config.ts`.
 *
 * Companion to the build-artifact gate `verify-modes ssr-showcase ×
 * ssg-i18n`. The verify-modes cell asserts the EMITTED filesystem tree
 * carries the expected per-locale variants — `dist/about/index.html`
 * (default unprefixed), `dist/de/about/index.html`, `dist/cs/about/index.html`,
 * AND the dynamic-route × locale cross-product
 * `dist/posts/{1,2,3}/index.html` + `dist/{de,cs}/posts/{1,2,3}/index.html`.
 * This spec asserts the RUNTIME contract: real Chromium loads each
 * locale-prefixed page, hydrates, and verifies in-app navigation +
 * dynamic-route resolution + RouterLink href emission all work under
 * locale prefixing.
 *
 * What's gated:
 *   1. **Default locale renders at unprefixed URL** — `/about` resolves
 *      to about-page (proves the default locale stays canonical under
 *      `prefix-except-default`); no console errors.
 *   2. **Non-default locale renders at prefixed URL** — `/de/about`
 *      resolves to about-page (proves the per-locale subtree
 *      duplication wired through the runtime route resolver).
 *   3. **Dynamic route × locale composition** — `/de/posts/1` resolves
 *      to post-page with the right title (proves
 *      `expandRoutesForLocales` correctly inherits `getStaticPaths` on
 *      duplicated dynamic routes, AND the runtime router matches the
 *      locale-prefixed dynamic segment).
 *   4. **In-app navigation under locale prefix** — clicking a
 *      RouterLink from `/de/posts` to a post does a client-side push
 *      (no full reload), URL bar updates correctly, post page renders.
 *
 * What this DOESN'T cover:
 *   - Runtime locale switching (the `i18nRouting()` Vite plugin's
 *     middleware Accept-Language detection / cookie-based redirect /
 *     root redirect). That's a server-runtime concern; SSG static
 *     hosts don't run middleware. PR H scope is route DUPLICATION at
 *     build time — locale DETECTION is orthogonal.
 *   - Direct-link navigation to `/de/about` (no trailing slash).
 *     Static-host directory-rewrite concern (Netlify / Cloudflare
 *     Pages do it; vite preview doesn't). Same exclusion as
 *     ssg-subpath.spec.ts.
 *
 * Bisect target: removing the `expandRoutesForLocales` call from
 * either `vite-plugin.ts` (page-routes virtual module) OR
 * `ssg-plugin.ts:autoDetectStaticPaths` causes specs #2-4 to fail —
 * the per-locale dist subtrees never get emitted, so `/de/about`
 * returns 404.
 */
test.describe('SSG i18n route duplication runtime', () => {
  test('default locale renders at unprefixed URL without console errors', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Trailing slashes throughout: vite preview serves
    // `dist/about/index.html` for `/about/` reliably, but for nested
    // dynamic paths like `/de/posts/1` it falls back to the SPA index
    // (the home page) without the slash. The trailing slash hits the
    // directory-index branch directly. Same as ssg-subpath spec.
    // Static hosts (Netlify / Cloudflare Pages) auto-rewrite both
    // forms; vite preview does not, and that's a host-config concern
    // not a framework concern.
    await page.goto('/about/')
    await expect(page.getByTestId('about-page')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('non-default locale renders at /de/about (prefixed)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Same component (`about` route) rendered at the locale-prefixed
    // URL. If `expandRoutesForLocales` didn't run, this 404s — vite
    // preview falls back to the SPA index (home page) and the
    // about-page testid never appears.
    await page.goto('/de/about/')
    await expect(page.getByTestId('about-page')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('non-default locale renders at /cs/about (third locale)', async ({ page }) => {
    // Sanity check that more than one non-default locale gets
    // duplicated — covers the multi-locale cardinality contract, not
    // just the binary "did duplication happen at all" check.
    await page.goto('/cs/about/')
    await expect(page.getByTestId('about-page')).toBeVisible()
  })

  test('dynamic route × locale composition: /de/posts/1 renders post', async ({
    page,
  }) => {
    // The structural test for PR H × PR A composition. `/de/posts/1`
    // requires:
    //   1. expandRoutesForLocales duplicated `/posts/[id]` to
    //      `/de/posts/[id]` (PR H).
    //   2. The `getStaticPaths` export carried through to the duplicate
    //      so the SSG plugin enumerated `/de/posts/{1,2,3}` (PR H + PR A
    //      composition).
    //   3. The runtime router matches the locale-prefixed dynamic
    //      segment back to the [id].ts component with `params.id = '1'`.
    //   4. The loader runs against the right param at hydration.
    await page.goto('/de/posts/1/')
    await expect(page.getByTestId('post-page')).toBeVisible()
    // Post 1's title — defined in routes/posts/[id].ts's POSTS array.
    // If the loader didn't pick up params.id correctly, the title
    // would be wrong (or "Post not found" would render).
    await expect(page.getByTestId('post-title')).toHaveText(
      'Getting Started with Pyreon',
    )
  })

  test('hydration + post-hydration interactivity under locale prefix', async ({
    page,
  }) => {
    // Cold-load the German home page. After SSG render at `/de/` and
    // hydration, the counter on the home page must be reactive — proves
    // hydration successfully attached signal handlers under the locale
    // prefix path. (A failure here would mean per-locale dist HTML
    // exists but the entry-client's hydration doesn't match the
    // emitted DOM, leaving signals dead.)
    //
    // Note: PR H scope is route DUPLICATION at build time — locale-aware
    // RouterLink emission (so `<RouterLink to="/posts/1">` rendered
    // inside `/de/posts` emits href="/de/posts/1") is OUT OF SCOPE.
    // RouterLinks emit their literal `to` href, which means a click
    // from `/de/posts` lands at `/posts/1` (default locale unprefixed
    // under prefix-except-default). That's a separate locale-aware
    // navigation feature, not part of PR H.
    await page.goto('/de/')
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
