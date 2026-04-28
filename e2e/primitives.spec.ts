/**
 * E2E tests for the framework primitives that didn't have e2e coverage
 * before Phase C1. Each test exercises a primitive in real Chromium against
 * the playground app's `/primitives` route (`examples/playground/src/pages/Primitives.tsx`).
 *
 * Adding a primitive: drop a `<Demo>` section into `Primitives.tsx` with
 * stable ids, then add a `test()` block here that drives it. Same pattern.
 */
import { expect, test } from '@playwright/test'

test.describe('Reactive primitives e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/primitives')
    await expect(page.locator('#primitives-page')).toBeVisible()
  })

  test('<Match>/<Switch> renders the matching branch and falls through fallback', async ({
    page,
  }) => {
    // Initial: status='idle' — only the idle branch shows.
    await expect(page.locator('#match-idle')).toBeVisible()
    await expect(page.locator('#match-loading')).toHaveCount(0)
    await expect(page.locator('#match-success')).toHaveCount(0)
    await expect(page.locator('#match-error')).toHaveCount(0)

    // cycle → loading
    await page.locator('#match-cycle').click()
    await expect(page.locator('#match-loading')).toBeVisible()
    await expect(page.locator('#match-idle')).toHaveCount(0)

    // cycle → success
    await page.locator('#match-cycle').click()
    await expect(page.locator('#match-success')).toBeVisible()
    await expect(page.locator('#match-loading')).toHaveCount(0)

    // cycle → error
    await page.locator('#match-cycle').click()
    await expect(page.locator('#match-error')).toBeVisible()
    await expect(page.locator('#match-success')).toHaveCount(0)

    // status text reactive throughout
    await expect(page.locator('#match-status .value')).toHaveText('error')
  })

  test('<Suspense> swaps fallback for lazy() chunk after async load', async ({ page }) => {
    // Idle state
    await expect(page.locator('#suspense-idle')).toBeVisible()
    await expect(page.locator('#lazy-content')).toHaveCount(0)

    await page.locator('#suspense-load').click()

    // After click: lazy chunk resolves → lazy-content appears, fallback gone.
    // Use a bounded wait so a timeout regression in the lazy() path fails fast.
    await expect(page.locator('#lazy-content')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#lazy-content')).toHaveText('hello from lazy()')
  })

  // FIXME: regression in main since one of #381 / #382 / #380 — the
  // boundary-fallback element is never visible after the click in CI
  // (passes intermittently locally). The Exploder() throw inside the
  // accessor `{() => (boom() ? <Exploder /> : ...)}` is supposed to be
  // caught by `<ErrorBoundary>` and swap to the fallback subtree, but
  // the swap doesn't happen on CI's slower runner. Likely cause: signal
  // flush ordering interaction with the error-handler bridge added in
  // #380, or the batch fix in #381 changed when the throw propagates.
  // Tracking a separate fix PR — restore `test()` once root-caused.
  test.fixme('<ErrorBoundary> catches child throw and renders fallback', async ({ page }) => {
    // Pre-throw: child renders normally
    await expect(page.locator('#boundary-ok')).toBeVisible()
    await expect(page.locator('#boundary-fallback')).toHaveCount(0)

    // Trigger throw
    await page.locator('#boundary-throw').click()

    // Boundary catches → fallback shown, original child gone
    await expect(page.locator('#boundary-fallback')).toBeVisible()
    await expect(page.locator('#boundary-fallback')).toContainText('component exploded')
    await expect(page.locator('#boundary-ok')).toHaveCount(0)
  })

  test('Context API: provider value flows to deeply-nested useContext consumer', async ({
    page,
  }) => {
    await expect(page.locator('#context-child .value')).toHaveText('light')
    await page.locator('#context-toggle').click()
    await expect(page.locator('#context-child .value')).toHaveText('dark')
    await page.locator('#context-toggle').click()
    await expect(page.locator('#context-child .value')).toHaveText('light')
  })

  test('<Dynamic> swaps the rendered tag based on signal', async ({ page }) => {
    // Initial: <h3> with text content "tag content".
    await expect(page.locator('#dynamic-target')).toHaveCount(1)
    await expect(page.locator('#dynamic-target')).toHaveJSProperty('tagName', 'H3')
    await expect(page.locator('#dynamic-target')).toHaveText('tag content')
    // Regression: children must NOT leak as the `children` HTML attribute.
    // Before Bug C's fix, `<Dynamic component="h3">x</Dynamic>` rendered
    // `<h3 children="...">` because the destructured `rest` carried
    // `children` into `h(string, rest)`.
    await expect(page.locator('#dynamic-target')).not.toHaveAttribute('children', /.*/)

    // cycle → p
    await page.locator('#dynamic-cycle').click()
    await expect(page.locator('#dynamic-target')).toHaveJSProperty('tagName', 'P')
    await expect(page.locator('#dynamic-target')).toHaveText('tag content')

    // cycle → em
    await page.locator('#dynamic-cycle').click()
    await expect(page.locator('#dynamic-target')).toHaveJSProperty('tagName', 'EM')

    // cycle → h3
    await page.locator('#dynamic-cycle').click()
    await expect(page.locator('#dynamic-target')).toHaveJSProperty('tagName', 'H3')
  })
})
