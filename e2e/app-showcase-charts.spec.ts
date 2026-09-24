import { expect, test } from '@playwright/test'

/**
 * `@pyreon/charts` real-app e2e — the dashboard's charts mount and paint in a
 * real Vite build.
 *
 * The dashboard route in `examples/app-showcase/src/routes/dashboard/` mounts
 * three charts over Pyreon's own engine (RevenueChart, CategoryChart and the
 * plot chart beside them), each a `<canvas>`. The spec asserts they mount,
 * have a real box, and paint something — a canvas that mounted but never drew
 * reads as blank pixels — with no uncaught page error.
 */

test.describe('app-showcase /dashboard — charts canvas mount', () => {
  test('renders its chart canvases, each with a box and painted pixels', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // POLL the count: the two query-backed charts mount after their data
    // arrives, so waiting for the first canvas would return early.
    await expect
      .poll(async () => page.locator('canvas').count(), {
        timeout: 15_000,
        message: 'fewer than three chart canvases mounted',
      })
      .toBeGreaterThanOrEqual(3)

    const canvases = await page.locator('canvas').evaluateAll((els) =>
      (els as HTMLCanvasElement[]).map((c) => {
        const ctx = c.getContext('2d')
        let painted = false
        if (ctx !== null && c.width > 0 && c.height > 0) {
          const px = ctx.getImageData(0, 0, c.width, c.height).data
          for (let i = 3; i < px.length; i += 4) {
            if (px[i]! > 0) {
              painted = true
              break
            }
          }
        }
        return { w: c.width, h: c.height, painted }
      }),
    )
    for (const { w, h, painted } of canvases) {
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
      expect(painted, 'a chart canvas mounted but drew nothing').toBe(true)
    }

    expect(errors, `Unexpected page errors:\n${errors.join('\n')}`).toHaveLength(0)
  })
})
