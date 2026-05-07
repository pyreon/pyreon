import { expect, test } from '@playwright/test'

/**
 * islands-showcase e2e — exercises each `@pyreon/server` hydration strategy
 * end-to-end against `examples/islands-showcase` in real Chromium.
 *
 * The whole point of islands is "ship per-island JS that hydrates on its
 * declared cadence" — and that contract is invisible at the unit level.
 * Real Chromium with real `IntersectionObserver` / `requestIdleCallback` /
 * `matchMedia` is the only place these strategies' timing actually fires.
 *
 * Mobile-only media-query coverage lives in
 * `e2e/islands-showcase-mobile.spec.ts` (separate iPhone-12 viewport
 * project in the same config).
 */

test.describe('islands-showcase — hydration strategies', () => {
  test('SSR HTML is complete: 7 islands, correct data-hydrate, correct SSR children', async ({
    page,
  }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)

    // All 7 islands present in SSR HTML (StaticBadge appears twice — once in
    // the intro paragraph + once in the "never" section).
    await expect(page.locator('pyreon-island')).toHaveCount(7)

    // Each strategy is represented at least once.
    await expect(
      page.locator('pyreon-island[data-hydrate="load"]'),
    ).toHaveCount(1)
    await expect(
      page.locator('pyreon-island[data-hydrate="idle"]'),
    ).toHaveCount(1)
    await expect(
      page.locator('pyreon-island[data-hydrate="visible"]'),
    ).toHaveCount(1)
    await expect(
      page.locator('pyreon-island[data-hydrate^="media("]'),
    ).toHaveCount(1)
    await expect(
      page.locator('pyreon-island[data-hydrate="interaction"]'),
    ).toHaveCount(1)
    await expect(
      page.locator('pyreon-island[data-hydrate="never"]'),
    ).toHaveCount(2)

    // SSR rendered children present (proves SSR pipeline ran inside <pyreon-island>).
    await expect(page.getByTestId('counter-value')).toHaveText('0')
    await expect(page.getByTestId('idle-clock-time')).toBeVisible()
    await expect(page.getByTestId('static-intro')).toBeVisible()
  })

  test('hydrate=load: Counter is interactive immediately', async ({ page }) => {
    await page.goto('/')

    // Wait for the load-strategy island to hydrate.
    const counterIsland = page.locator('pyreon-island[data-component="Counter"]')
    await expect(counterIsland).not.toHaveAttribute('data-island-error', /.+/, {
      timeout: 5000,
    })

    const value = page.getByTestId('counter-value')
    await expect(value).toHaveText('0')

    await page.getByTestId('counter-inc').click()
    await expect(value).toHaveText('1')

    await page.getByTestId('counter-inc').click()
    await expect(value).toHaveText('2')
  })

  test('hydrate=idle: IdleClock hydrates and ticks at least once', async ({ page }) => {
    await page.goto('/')

    const clockIsland = page.locator('pyreon-island[data-component="IdleClock"]')
    await expect(clockIsland).not.toHaveAttribute('data-island-error', /.+/, {
      timeout: 5000,
    })

    const before = (await page.getByTestId('idle-clock-time').textContent()) ?? ''
    expect(before).toMatch(/\d/)

    // Wait for at least one tick (the live clock updates every 1s once
    // hydrated). The SSR-rendered initial value is captured at request time
    // and stays static until the client-side onMount setInterval kicks in.
    await page.waitForTimeout(2200)
    const after = (await page.getByTestId('idle-clock-time').textContent()) ?? ''
    expect(after).toMatch(/\d/)
    expect(after).not.toBe(before)
  })

  test('prefetch=idle: VisibleComments chunk is fetched BEFORE scroll-in (warm cache on hydration)', async ({
    page,
  }) => {
    // The VisibleComments island pairs `hydrate: 'visible'` with
    // `prefetch: 'idle'` — the chunk should be requested during browser idle
    // BEFORE the IntersectionObserver fires from a scroll. Counter-based
    // network assertion (timing-based would be flaky).
    const visibleCommentsRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      // Match BOTH dev-mode URL (Vite serves `/src/components/VisibleComments.tsx?...`)
      // AND prod-mode chunk filename (`VisibleComments-<hash>.js`). The webServer
      // here runs `vite dev`, so the dev pattern is the active one — but keep
      // the prod pattern so the spec works when run against `vite build` too.
      if (
        /\/components\/VisibleComments\.tsx(\?|$)/.test(url) ||
        /\/VisibleComments[-.][^/]*\.js(\?|$)/.test(url)
      ) {
        visibleCommentsRequests.push(url)
      }
    })

    await page.goto('/')

    // Sanity: the SSR-emitted attribute is present.
    const island = page.locator('pyreon-island[data-component="VisibleComments"]')
    await expect(island).toHaveAttribute('data-prefetch', 'idle')
    await expect(island).toHaveAttribute('data-hydrate', 'visible')

    // Wait for browser idle to fire prefetch. requestIdleCallback in headless
    // Chromium typically fires within a few ms after the main bundle settles.
    // Generous timeout — we want signal, not flake.
    await expect.poll(() => visibleCommentsRequests.length, { timeout: 5000 }).toBeGreaterThan(0)

    // CRITICAL: prove the chunk arrived BEFORE we scrolled. The island is
    // still below the fold — its IntersectionObserver hasn't fired.
    const list = page.getByTestId('visible-comments-list')
    await expect(list.locator('li')).toHaveCount(0)
  })

  test('hydrate=visible: VisibleComments stays SSR-only until scrolled into view', async ({
    page,
  }) => {
    await page.goto('/')

    const list = page.getByTestId('visible-comments-list')

    // Initially the comments island is below the fold — the list should be
    // empty (SSR rendered <For each={[]}> = no <li> elements).
    await expect(list.locator('li')).toHaveCount(0)

    // Scroll the comments island into view → IntersectionObserver fires →
    // hydration runs → onMount setTimeout populates the comments after 50ms.
    await page.getByTestId('visible-comments').scrollIntoViewIfNeeded()
    await expect(list.locator('li')).toHaveCount(3, { timeout: 5000 })
    await expect(list).toContainText('alice')
  })

  test('hydrate=media (desktop viewport): MobileMenu does NOT hydrate above 768px', async ({
    page,
  }) => {
    // This config's desktop project runs at 1280×720; the (max-width: 768px)
    // query is FALSE here. The button is server-rendered (SSR ran the
    // component once to produce HTML) but the click handler is never bound.
    await page.goto('/')

    const menuIsland = page.locator('pyreon-island[data-component="MobileMenu"]')
    await expect(menuIsland).toBeVisible()

    // SSR-rendered "closed" state.
    await expect(page.getByTestId('mobile-menu-state')).toHaveText('closed')

    // Click the SSR button — without hydration, the click handler is not
    // bound and the state should NOT toggle.
    await page.getByTestId('mobile-menu-toggle').click()
    // Wait long enough for any hydration to settle if it WERE going to.
    await page.waitForTimeout(500)
    await expect(page.getByTestId('mobile-menu-state')).toHaveText('closed')
  })

  test('hydrate=interaction: CommandPalette stays SSR-only until first interaction, then hydrates and is interactive', async ({
    page,
  }) => {
    await page.goto('/')

    const island = page.locator('pyreon-island[data-component="CommandPalette"]')
    await expect(island).toBeVisible()
    await expect(island).toHaveAttribute('data-hydrate', 'interaction')

    // Pre-interaction: listeners attached, panel SSR-rendered with
    // display:none, loader hasn't fired.
    await expect(island).toHaveAttribute('data-island-state', 'awaiting-interaction')
    await expect(page.getByTestId('command-palette-state')).toHaveText('closed')
    await expect(page.getByTestId('command-palette-panel')).toHaveCSS('display', 'none')
    await expect(island).not.toHaveAttribute('data-island-error', /.+/)

    // First interaction: clicking the trigger button. The capture-phase
    // listener on the island wrapper fires FIRST, captures the click target,
    // stops the in-flight event, hydrates async, then re-dispatches the
    // click on the same target so the live handler runs. Net result: the
    // user's first click both wakes the island AND fires the action.
    await page.getByTestId('command-palette-trigger').click()

    // After hydration the data-island-state attribute is removed.
    await expect(island).not.toHaveAttribute('data-island-state', /.+/, {
      timeout: 5000,
    })
    // Palette is open now (replayed click hit the live handler).
    await expect(page.getByTestId('command-palette-state')).toHaveText('open')
    await expect(page.getByTestId('command-palette-panel')).toHaveCSS('display', 'block')

    // Type into the palette — proves the live component is fully interactive.
    await page.getByTestId('command-palette-input').fill('term')
    await expect(page.getByTestId('command-palette-list')).toContainText('terminal')
  })

  test('hydrate=never: StaticBadge stays SSR-only with NO data-island-error and NO interactivity', async ({
    page,
  }) => {
    await page.goto('/')

    const islands = page.locator('pyreon-island[data-hydrate="never"]')
    await expect(islands).toHaveCount(2)

    // The "never" islands must NOT be flagged as errored — never-hydration
    // is a deliberate strategy, not a failure mode.
    for (const island of await islands.all()) {
      await expect(island).not.toHaveAttribute('data-island-error', /.+/)
    }

    // SSR rendered the badge text — it stays in the DOM unchanged.
    await expect(page.getByTestId('static-badge').first()).toContainText('zero JS')
  })
})
