import { expect, test } from '@playwright/test'

/**
 * `@pyreon/charts` real-app e2e — locks in that the charts demo renders
 * canvases when the consumer Vite app applies `chartsViteAlias()` from
 * `@pyreon/charts/vite`.
 *
 * Why this file exists: PR #417 shipped `chartsViteAlias()` to fix the
 * recurring tslib `__extends` crash that breaks ECharts under Vite's
 * prebundle. Both example apps' `vite.config.ts` adopted the helper.
 * Without an e2e regression-locking the canvas mount, a future Vite or
 * ECharts version bump could re-break the path silently — neither
 * `chartsViteAlias()`'s unit tests nor the helper's own resolver
 * branches would catch a downstream prebundle change.
 *
 * The dashboard route in `examples/app-showcase/src/routes/dashboard/`
 * mounts two charts (RevenueChart + CategoryChart) via `<Chart>` from
 * `@pyreon/charts`. If the alias is broken or removed, ECharts's lazy
 * import throws `TypeError: Cannot destructure property '__extends' of
 * '__toESM(...).default'` — useChart's effect catches it via
 * `error.set()` and the canvas never mounts. The spec asserts the
 * happy path: canvases ARE present.
 */

test.describe('app-showcase /dashboard — charts canvas mount', () => {
  test('renders ≥2 chart canvases via @pyreon/charts', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
    })

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Wait for the first canvas — ECharts lazy-loads modules on first
    // chart mount. Generous timeout because the dashboard mounts under
    // a `QueryClient` provider and the chart-data query has to settle
    // before <RevenueChart> emits its <Chart> via reactive children.
    await page.locator('canvas').first().waitFor({ timeout: 10_000 })

    // Two charts on the dashboard: RevenueChart + CategoryChart. Both
    // render their own <canvas>. Asserting `>= 2` rather than `=== 2`
    // leaves headroom for a future third chart on the same page.
    const canvasCount = await page.locator('canvas').count()
    expect(canvasCount).toBeGreaterThanOrEqual(2)

    // Sanity: each canvas has non-zero pixel dimensions. A canvas with
    // `width === 0` would mean ECharts mounted but the container had no
    // bounding box — a different regression class but worth catching.
    const dims = await page.locator('canvas').evaluateAll((els) =>
      (els as HTMLCanvasElement[]).map((c) => ({ w: c.width, h: c.height })),
    )
    for (const { w, h } of dims) {
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
    }

    // No console errors — specifically no tslib `__extends` errors.
    // If `chartsViteAlias()` is removed from the consumer Vite config,
    // this assertion fails with the exact bug shape the helper exists
    // to prevent.
    const tslibErrors = errors.filter((e) => /__extends|tslib/i.test(e))
    expect(tslibErrors, `Unexpected tslib-related errors:\n${tslibErrors.join('\n')}`).toHaveLength(
      0,
    )
  })
})
