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

  // Multi-route SWEEP — visit every demo route via direct goto and
  // verify no JS pageerrors. Was previously `test.fixme()`'d due to
  // `net::ERR_ABORTED` on heavy lazy-loading routes (`/code`,
  // `/document`, `/charts`) under cold-cache navigation in CI.
  //
  // Diagnosis (PR closing this fixme): the abort is NOT a server-side
  // 500 — Vite's dev server returns 200 in <100ms for every route in
  // local cold-cache repro. The abort is a CHROME-LEVEL navigation
  // race: when `page.goto(B)` fires while the prior page (`A`) is
  // still loading its client JS modules under Vite's on-demand
  // bundling, Chrome's in-flight resource fetches for A get cancelled,
  // and the navigation to B can be aborted as part of the cleanup.
  // Cold-cache only because Vite bundles modules on first request;
  // warm-cache repro never reproduces.
  //
  // Fix: retry on `ERR_ABORTED` once after a short backoff. The retry
  // succeeds because the prior page's modules are now fully cached,
  // so the next navigation doesn't race with bundling. This is the
  // same shape Playwright recommends for transient navigation aborts.
  // Cap retries at 1 — a real failure (e.g. SSR error returning 500)
  // would still surface deterministically.
  async function gotoWithRetry(page: import('@playwright/test').Page, path: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Only retry on the cold-cache race signature. Any other error
        // bubbles up to the test as a real failure.
        if (attempt === 0 && /ERR_ABORTED/.test(msg)) {
          await page.waitForTimeout(500)
          continue
        }
        throw err
      }
    }
  }

  test('navigates through every tab without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    for (const path of TAB_PATHS) {
      // `waitUntil: 'domcontentloaded'` instead of the default `load`:
      // some routes (`/code`, `/charts`, `/document`) lazy-load heavy
      // bundles (CodeMirror, ECharts, document renderers) whose `load`
      // event can exceed Playwright's default 30s under cold CI load.
      // We only need the route to mount and not throw; we don't need
      // every async chunk to settle.
      await gotoWithRetry(page, path)
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

// Locks in CodeDemo's CodeEditor mount post-fix. The fundamentals
// `/code` route is `test.fixme()`d in the multi-route SWEEP above
// because direct SSR navigation to `/code` was historically aborting
// on cold CI runners (#383). Path B from the e2e expansion plan
// (`.claude/plans/jaunty-herding-kazoo.md`) sidesteps that by visiting
// a lightweight route first then client-side navigating to `/code` —
// no SSR cold-start under load. Combined with the post-fix demo
// (using `<CodeEditor instance={editor}>` instead of a one-shot ref),
// CodeMirror mounts deterministically and `.cm-editor` becomes visible.
//
// Bisect-shape: revert
// `examples/fundamentals-playground/src/demos/CodeDemo.tsx` to the
// pre-fix `<div ref={(el) => { editor.view.peek() ... }}>` form →
// `.cm-editor` never mounts → spec times out.
test.describe('Playground — /code editor mount', () => {
  test('CodeMirror mounts via client-side nav from /', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('nav.sidebar').first().waitFor()

    // Client-side navigate via the sidebar link — no SSR cold-start.
    await page.locator('nav.sidebar a[href="/code"]').first().click()

    // CodeMirror's lazy-load chunk + `<CodeEditor>`'s async `_mount(el)`
    // can take a beat under cold CI. Generous timeout; the spec is
    // proving "mounts at all", not "mounts fast".
    await page.locator('.cm-editor').waitFor({ timeout: 10_000 })

    // Initial value visible in the rendered content. The seed file
    // is `main.ts` from `CodeDemo.tsx`'s `sampleFiles`, whose first
    // line imports from `@pyreon/reactivity`. Asserting on a stable
    // text fragment from the seed is more robust than counting lines.
    const cmContent = page.locator('.cm-content')
    await expect(cmContent).toContainText('@pyreon/reactivity')
  })
})
