import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

/**
 * The measuring half of the site route budgets. For every route in
 * `PYREON_SITE_ROUTES` (a JSON array) it loads the page at 1440×900 without
 * scrolling and records the gzip -9 bytes of every script the browser
 * requested: the entry, island hydration, each island the page loads on idle
 * or because it is in view, and their idle prefetches.
 *
 * It judges nothing. `scripts/check-site-budgets.ts` runs it and gives the
 * verdict (this change's own growth on a pull request, the ceiling on the
 * default branch), so no byte number lives in a spec.
 */
const DIST = resolve(process.env['PYREON_SITE_DIST'] ?? 'docs/dist')
const OUT = process.env['PYREON_SITE_SIZES_OUT']
const ROUTES = JSON.parse(process.env['PYREON_SITE_ROUTES'] ?? '[]') as string[]
/** The checkout the build ran in; removed from the code so the size does not depend on it. */
const ROOT = process.env['PYREON_SITE_ROOT']

/** How long the page must request no further script before it counts as settled. */
const QUIET_MS = 1500

test.describe.configure({ mode: 'parallel' })

test('routes to measure were given', () => {
  expect(OUT, 'PYREON_SITE_SIZES_OUT').toBeTruthy()
  expect(ROUTES.length, 'PYREON_SITE_ROUTES').toBeGreaterThan(0)
})

for (const [index, route] of ROUTES.entries()) {
  test(`measure ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const scripts = new Set<string>()
    let last = Date.now()
    page.on('request', (r) => {
      if (r.resourceType() !== 'script') return
      scripts.add(new URL(r.url()).pathname)
      last = Date.now()
    })
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    // Idle prefetches start after the load settles: wait until none has started for a while.
    await expect.poll(() => Date.now() - last, { timeout: 30_000, intervals: [250] }).toBeGreaterThanOrEqual(QUIET_MS)
    expect(scripts.size, `${route} requests JavaScript`).toBeGreaterThan(0)
    let bytes = 0
    for (const path of scripts) {
      const code = readFileSync(join(DIST, path.slice(1)), 'utf8')
      bytes += gzipSync(ROOT ? code.replaceAll(ROOT, '') : code, { level: 9 }).length
    }
    mkdirSync(OUT as string, { recursive: true })
    writeFileSync(join(OUT as string, `${index}.json`), JSON.stringify({ route, bytes, scripts: [...scripts].sort() }))
  })
}
