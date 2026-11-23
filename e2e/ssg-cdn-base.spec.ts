import { expect, test } from '@playwright/test'

/**
 * A full-URL (CDN) asset base with no `zero({ base })` (#4269).
 *
 * `examples/fixtures/ssr-showcase` built with `vite.config.cdn.ts`
 * (`base: 'http://localhost:5236/'`) and served by `vite preview` on 5236
 * (`e2e-configs/ssg-subpath.config.ts`). zero has two bases: the asset base
 * (that URL: chunks, preloads, CSS) and the route base (`/`: links,
 * `pushState`, `__ZERO_BASE__`). When zero used the URL as the route base,
 * every link rendered as `/http://localhost:5236/about` and a reload 404'd.
 *
 * Bisect: give `__ZERO_BASE__` Vite's raw base in `vite-plugin.ts`'s
 * `configResolved` → the href assertion fails.
 */
test.describe('SSG with a CDN asset base', () => {
  test('assets load from the base URL; links and client navigation stay root-relative', async ({ page }) => {
    const errors: string[] = []
    const failed: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('response', (r) => {
      if (r.url().includes('/assets/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
    })

    await page.goto('/')
    await expect(page.getByTestId('home-page')).toBeVisible()
    const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((el) => el.getAttribute('src')))
    expect(scripts.some((s) => s?.startsWith('http://localhost:5236/assets/'))).toBe(true)

    const about = page.getByTestId('nav-about')
    await expect(about).toHaveAttribute('href', '/about')

    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__cdnNav = 'kept'
    })
    await about.click()
    await expect(page).toHaveURL(/localhost:5236\/about$/)
    await expect(page.getByTestId('about-page')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__cdnNav)).toBe('kept')

    // A reload of the pushed URL is the prerendered page, not a 404.
    await page.reload()
    await expect(page.getByTestId('about-page')).toBeVisible()

    expect(failed).toEqual([])
    expect(errors).toEqual([])
  })

  test('hydration wires the counter under the CDN base', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('counter-value')).toHaveText('0')
    await page.getByTestId('increment').click()
    await expect(page.getByTestId('counter-value')).toHaveText('1')
  })
})
