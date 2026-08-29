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

    // POLL the COUNT, rather than waiting for the first canvas and then
    // counting. Waiting for the first one only ever meant "ECharts has
    // finished loading" by accident — because the first canvas on the page
    // happened to be an ECharts one. The plot-engine chart added below draws
    // synchronously and now wins that race, so the old wait returned while
    // ECharts was still importing its modules and the count was short.
    //
    // The lesson generalises past this file: a wait whose meaning depends on
    // WHICH element arrives first is not a wait for the thing you care about.
    // Poll the actual condition.
    //
    // Two ECharts charts (RevenueChart + CategoryChart) plus the plot-engine
    // one, so >= 3; asserted as >= 2 for the ECharts pair specifically, since
    // this test is about the tslib alias and not about how many charts the
    // dashboard happens to show.
    await expect
      .poll(async () => page.locator('canvas').count(), {
        timeout: 15_000,
        message: 'fewer than two chart canvases mounted — ECharts lazy import likely failed',
      })
      .toBeGreaterThanOrEqual(2)

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
    // POLL rather than sample once. The canvas element exists before the first
    // paint — the ref fires, then the draw runs — so a single read races the
    // engine and fails intermittently, while a poll still fails correctly for a
    // canvas that never draws at all, which is the regression this asserts.
    const measure = async (): Promise<{ w: number; h: number; painted: number }> =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement
        const ctx = c.getContext('2d')
        if (ctx === null) return { w: c.width, h: c.height, painted: 0 }
        const { data } = ctx.getImageData(0, 0, c.width, c.height)
        let n = 0
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++
        return { w: c.width, h: c.height, painted: n }
      })

    // A blank canvas is the failure this test exists for: the axes, bars and
    // line together cover far more than a handful of pixels.
    await expect
      .poll(async () => (await measure()).painted, {
        timeout: 15_000,
        message:
          'the plot canvas is blank — the engine mounted but never drew (or the real compiler emitted something the vitest transform does not)',
      })
      .toBeGreaterThan(500)

    const { w, h } = await measure()

    expect(w, 'canvas has no backing width — the container had no box').toBeGreaterThan(0)
    expect(h).toBeGreaterThan(0)

    // The chart FILLS its column. This is a regression lock, not a nicety: the
    // width was read off the canvas itself, which is the element the read then
    // sizes — so the first draw measured 0, fell back to the default, wrote it
    // onto the canvas, and every later draw read that default straight back. A
    // chart pinned at 300px inside a 430px column, with nothing in the DOM
    // looking wrong. Only a real layout catches it; jsdom and happy-dom report
    // 0 for everything.
    const fill = await host.evaluate((el) => {
      const c = el.querySelector('canvas') as HTMLCanvasElement
      return { column: (el as HTMLElement).clientWidth, drawn: Number.parseFloat(c.style.width) }
    })
    expect(
      fill.drawn,
      `the chart drew ${fill.drawn}px inside a ${fill.column}px column — it is measuring itself instead of its container`,
    ).toBeGreaterThan(fill.column * 0.9)
    expect(errors, `page errors:\n${errors.join('\n')}`).toHaveLength(0)
  })
})
