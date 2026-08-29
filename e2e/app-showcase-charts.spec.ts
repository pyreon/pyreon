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

/**
 * Pyreon's OWN engine (`@pyreon/charts/plot`) in a real app.
 *
 * The engine's own suite runs under vitest's JSX transform, which is NOT the
 * transform that ships. This repo's recurring lesson is that a package's
 * browser tests can be green while `@pyreon/vite-plugin`'s real compiler
 * produces different — and broken — output for the same source. Only a real
 * app boot exercises the shipping path.
 *
 * The assertion is PAINTED PIXELS, not structure. A canvas that mounted but
 * was never drawn to passes every structural check there is, which is exactly
 * the failure a chart engine can have.
 */
test.describe('app-showcase /dashboard — the plot engine, real compiler', () => {
  test('paints a chart drawn by @pyreon/charts/plot', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    const host = page.locator('[data-testid="plot-engine-chart"]')
    await host.waitFor({ timeout: 15_000 })
    const canvas = host.locator('canvas')
    await canvas.waitFor({ timeout: 15_000 })

    // The backing store is sized for the device pixel ratio, so a soft chart
    // (a canvas at CSS size on a 2x display) shows up here as a smaller width.
    const { w, h, painted } = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement
      const ctx = c.getContext('2d')
      if (ctx === null) return { w: c.width, h: c.height, painted: 0 }
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      let n = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++
      return { w: c.width, h: c.height, painted: n }
    })

    expect(w, 'canvas has no backing width — the container had no box').toBeGreaterThan(0)
    expect(h).toBeGreaterThan(0)
    // A blank canvas is the failure this test exists for: the axes, bars and
    // line together cover far more than a handful of pixels.
    expect(
      painted,
      'the plot canvas is blank — the engine mounted but never drew (or the real compiler emitted something the vitest transform does not)',
    ).toBeGreaterThan(500)

    expect(errors, `page errors:\n${errors.join('\n')}`).toHaveLength(0)
  })
})
