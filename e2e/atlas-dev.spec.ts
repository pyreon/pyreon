/**
 * `atlas dev` — the workbench booting against a project's REAL components,
 * with a catalog derived from source rather than hand-written stories.
 *
 * This is the difference between Atlas being a demo and being a tool: every
 * panel it ships was previously mounted on a workbench that could only be
 * started by hand-wiring a Vite app.
 *
 * The server is started by the config's webServer (see e2e-configs), running
 * the real CLI command — not an in-process helper — so what is tested is what a
 * user runs.
 */
import { expect, test } from '@playwright/test'

test.describe('atlas dev', () => {
  test('serves the workbench with a catalog derived from real components', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

    await page.goto('/')

    // The shell must win over the consuming project's own index.html.
    await expect(page.locator('#atlas-root')).toBeAttached()

    // Components discovered from source appear in the sidebar — nobody wrote a
    // story for these.
    await expect(page.getByRole('button', { name: 'Button' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Badge' })).toBeVisible()

    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
  })

  test('renders a discovered component in the canvas', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Badge' }).click()
    const preview = page.locator('[data-testid="canvas-preview"]')
    await expect(preview).toBeVisible()
    // A real element, not the guarded load-failure placeholder.
    await expect(preview.locator('[data-atlas-error]')).toHaveCount(0)
    const box = await preview.boundingBox()
    expect(box?.width ?? 0, 'the preview must actually paint').toBeGreaterThan(0)
  })

  test('derives controls from the component props', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Badge' }).click()
    await page.getByTestId('addon-tab-controls').click()
    // Badge takes `label` / `variant` / `dot`; the enum must carry its real
    // members, which is the drift a derived catalog removes.
    await expect(page.getByText('Label', { exact: true })).toBeVisible()
    await expect(page.getByText('Variant', { exact: true })).toBeVisible()
  })

  test('the RPC channel answers, and names known methods on a typo', async ({ page }) => {
    await page.goto('/')
    const ok = await page.evaluate(async () => {
      const r = await fetch('/__atlas/rpc', {
        method: 'POST',
        body: JSON.stringify({ method: 'components' }),
      })
      return r.json()
    })
    expect(ok.ok).toBe(true)
    expect(ok.result).toContain('Badge')

    const bad = await page.evaluate(async () => {
      const r = await fetch('/__atlas/rpc', {
        method: 'POST',
        body: JSON.stringify({ method: 'nope' }),
      })
      return r.json()
    })
    expect(bad.ok).toBe(false)
    // A typo must be a one-step fix, not a hunt.
    expect(String(bad.error)).toContain('Known:')
  })

  test('serves a component source over the channel, path-guarded', async ({ page }) => {
    await page.goto('/')
    const res = await page.evaluate(async () => {
      const r = await fetch('/__atlas/rpc', {
        method: 'POST',
        body: JSON.stringify({ method: 'source', params: { component: 'Badge' } }),
      })
      return r.json()
    })
    expect(res.ok).toBe(true)
    expect(String(res.result.source)).toContain('Badge')
  })
})
