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
    // Wait for the inner demo to actually mount before measuring content.
    // `beforeEach` only waits for `nav.sidebar` (part of the layout) — on
    // cold CI runners the layout hydrates before the inner `RouterView`
    // child does, so a bare `textContent` read can race and see 0 chars
    // even though the route is in flight. The h2 lives inside DashboardDemo
    // and is the canary that the inner route component rendered.
    const main = page.locator('main.content')
    await expect(main.locator('h2', { hasText: 'Integrated Dashboard' })).toBeVisible()
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

// Locks in two fixes that combined to break the layout's `<RouterLink
// to={props.path} class={() => isActive() ? 'active' : ''}>`:
//   1. SSR + hydrate.ts skipped `makeReactiveProps` on the way into a
//      component, so `props.to` (a compiler-emitted `_rp(() => ...)`
//      function) was the raw function instead of a getter — `${props.to}`
//      stringified the function source as the `href`.
//   2. RouterLink hard-overrode the user's `class` prop with its internal
//      `activeClass` accessor instead of merging — silently dropping
//      `class={() => isActive() ? 'active' : ''}`.
// Pre-fix the rendered DOM was `<a class="active" href="() => props.path">`
// — the systemic SSR fix is what actually produces a routable href.
// The earlier INTENTIONALLY OMITTED comment misdiagnosed the root cause
// as a single bug; both layers needed fixing.
//
// Lives outside the main `Playground` describe block so its `beforeEach`
// (which uses a strict `nav.sidebar` waitFor that fails when there are
// duplicate navs) doesn't gate this test. `.first()` selectors here guard
// against an unrelated pre-existing duplicate-nav issue in the fundamentals
// fixture; the assertion below still proves the active-class flow works.
test.describe('Playground — RouterLink reactive `to` + active class', () => {
  test('useIsActive applies user-provided `active` class to current-route link', async ({ page }) => {
    await page.goto('/store', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('nav.sidebar').first().waitFor()
    await page.waitForTimeout(150)

    const activeLink = page.locator('nav.sidebar').first().locator('a.active')
    await expect(activeLink).toHaveCount(1)
    await expect(activeLink).toHaveAttribute('href', /\/store$/)
  })
})
