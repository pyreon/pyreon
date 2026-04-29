import { expect, test } from '@playwright/test'

/**
 * Fundamentals-playground e2e — boot, navigation, no-error sweep.
 *
 * After the multi-route refactor, the layout uses `<RouterLink>` (renders
 * `<a>`) inside `nav.sidebar`, not `<button>`. Realigned to the current
 * markup. The previous `.first()` workarounds (added to scope past a
 * duplicate `nav.sidebar` from the layout double-mount loop) are gone —
 * the loop is fixed (PR #406's RouterView structure/data decoupling). The
 * specs below now explicitly assert `nav.sidebar` and `main.content` each
 * appear EXACTLY once on the page, locking the post-fix shape against
 * any future regression that would silently re-introduce duplicates.
 */

const TAB_PATHS = [
  '/',
  '/store',
  '/state-tree',
  '/form',
  '/validation',
  '/i18n',
  '/query',
  '/table',
  '/virtual',
  '/charts',
  '/code',
  '/document',
  '/storage',
  '/hotkeys',
  '/permissions',
  '/machine',
] as const

test.describe('Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('nav.sidebar').waitFor()
  })

  test('renders sidebar with all demo links', async ({ page }) => {
    // Layout double-mount lock-in: `nav.sidebar` must appear exactly
    // once. Pre-#406 this rendered twice (the layout's reactive
    // `<RouterView />` re-emitted on every `_loadingSignal` tick during
    // a navigate flow). A regression to the loop would silently mount
    // duplicate sidebars; this assertion fails loudly.
    await expect(page.locator('nav.sidebar')).toHaveCount(1)
    await expect(page.locator('nav.sidebar h1')).toContainText('Pyreon Fundamentals')
    // 16 routes today; assert ≥12 to leave headroom for future renames.
    const links = page.locator('nav.sidebar a')
    expect(await links.count()).toBeGreaterThanOrEqual(12)
  })

  test('dashboard renders content at /', async ({ page }) => {
    // Layout double-mount lock-in (matches the sidebar assertion above).
    await expect(page.locator('main.content')).toHaveCount(1)
    // Dashboard demo at `/` is content-rich; the canary that the route
    // mounted and the demo's signals/computeds executed without throwing.
    const main = page.locator('main.content')
    await expect(main).toBeVisible()
    expect((await main.textContent())?.length ?? 0).toBeGreaterThan(100)
  })

  test('no JavaScript errors on initial load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await page.locator('nav.sidebar').waitFor()
    await page.waitForTimeout(1000)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  // FIXME: `/code` route consistently aborts navigation on CI with
  // `net::ERR_ABORTED` even with `waitUntil: 'domcontentloaded'` +
  // a 60s timeout (#383's fix). Local: passes. CI: fails 100% on
  // cold runners. Likely SSR error in zero's dev pipeline when
  // CodeMirror's lazy chunk first loads under CI's CPU/memory
  // pressure — a server-side error returns a 500 that the browser
  // surfaces as ERR_ABORTED. Tracking a separate fix PR; restore
  // `test()` once the dev-SSR `/code` path is hardened (likely
  // needs a pre-warm of CodeMirror's chunk OR a redirect away from
  // the heavy route as the first navigation in the sweep).
  test.fixme('navigates through every tab without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    for (const path of TAB_PATHS) {
      // `waitUntil: 'domcontentloaded'` instead of the default `load`:
      // some routes (`/code`, `/charts`, `/document`) lazy-load heavy
      // bundles (CodeMirror, ECharts, document renderers) whose `load`
      // event can exceed Playwright's default 30s under cold CI load.
      // We only need the route to mount and not throw; we don't need
      // every async chunk to settle.
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      // Wait for SPA navigation + initial mount.
      await page.locator('nav.sidebar').waitFor()
      await page.waitForTimeout(150)
    }

    expect(errors, errors.join('\n')).toHaveLength(0)
  })

})

// Real-app gate for the RouterLink accessor `to` resolution fix
// (separate describe so we own beforeEach — the parent `Playground`
// describe's `beforeEach` uses `nav.sidebar` without `.first()` which
// trips strict-mode against a separate, pre-existing layout bug that
// renders multiple sidebars; not in this PR's scope to fix).
//
// Pre-fix: every sidebar `<a>` had `href="() => props.path"` literally
// because RouterLink template-string-coerced `props.to` without
// unwrapping the accessor wrap that the compiler emits for any prop
// expression referencing other props (`<RouterLink to={props.path}>`
// becomes `to: () => props.path`). The previous INTENTIONALLY OMITTED
// useIsActive assertion was blocked on this shape; with the fix in
// place these are load-bearing assertions.

test.describe('Playground — RouterLink accessor `to`', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // `.first()` because main has multiple `nav.sidebar` elements —
    // pre-existing layout bug separate from this PR.
    await page.locator('nav.sidebar').first().waitFor()
  })

  test('sidebar links render with real hrefs (not stringified accessors)', async ({ page }) => {
    const links = page.locator('nav.sidebar').first().locator('a')
    const count = await links.count()
    expect(count).toBeGreaterThanOrEqual(12)

    // Sample the first handful — all must look like real paths, never
    // the stringified accessor source.
    for (let i = 0; i < Math.min(count, 6); i++) {
      const href = await links.nth(i).getAttribute('href')
      expect(href, `link ${i} has stringified accessor`).not.toContain('=>')
      expect(href, `link ${i} missing href`).toBeTruthy()
      expect(href!.startsWith('/'), `link ${i} not a real path: ${href}`).toBe(true)
    }
  })

  test('clicking a sidebar link navigates via SPA router', async ({ page }) => {
    // Click the /store link, assert URL changes + content swaps in
    // without a full-page reload. Pre-fix the click handler called
    // `router.push(props.to)` with the accessor function as the
    // argument — push tried to navigate to the stringified function
    // source and never landed on the real route.
    let fullPageReload = false
    page.on('load', () => {
      fullPageReload = true
    })
    fullPageReload = false // reset after initial /

    const storeLink = page.locator('nav.sidebar').first().locator('a[href="/store"]').first()
    await storeLink.click()

    await expect(page.locator('main h2').first()).toHaveText('Store')
    expect(page.url()).toContain('/store')
    expect(fullPageReload, 'navigation triggered a full page reload').toBe(false)
  })

  test('useIsActive marks the current route link with active class', async ({ page }) => {
    // Pre-fix: useIsActive compared current path against the malformed
    // `href="() => props.path"` and never matched, so no link got the
    // `router-link-active` class regardless of route. The fix unblocks
    // this assertion.
    await page.goto('/store')
    await page.locator('nav.sidebar').first().waitFor()
    const activeLink = page.locator('nav.sidebar').first().locator('a.router-link-active').first()
    await expect(activeLink).toBeVisible()
    await expect(activeLink).toHaveAttribute('href', '/store')
  })
})
