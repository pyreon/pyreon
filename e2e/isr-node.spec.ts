import { expect, test } from '@playwright/test'

/**
 * ISR node-deploy artifact gate — runs against the emitted `node dist/index.js`
 * (ISR-wrapped handler). See `e2e-configs/isr-node.config.ts`.
 *
 * ISR shares the SSR deploy path (Bug A/C staging + production-template
 * hydration fix); this gate proves the `mode: 'isr'` artifact runs + serves +
 * hydrates + is cache-consistent end-to-end. Caching semantics (TTL/LRU/
 * cacheKey/revalidate) are unit-covered by isr.test.ts.
 *
 * If the artifact didn't build/boot, every spec fails at the webServer step.
 */
test.describe('ISR node deploy artifact', () => {
  test('GET / is server-rendered and cache-consistent across requests', async ({ page }) => {
    const r1 = await page.request.get('/')
    const r2 = await page.request.get('/')
    expect(r1.status()).toBe(200)
    expect(r2.status()).toBe(200)
    const h1 = await r1.text()
    const h2 = await r2.text()
    // Server-rendered route content (not the unfilled template shell).
    expect(h1).toContain('data-pyreon-router-view')
    expect(h1).toContain('data-testid="nav-home"')
    expect(h1).not.toContain('<!--pyreon-app-->')
    // Production hydration entry (hashed asset, NOT the dev /src/entry-client.ts).
    expect(h1).toMatch(/\/assets\/index-[\w.-]+\.js/)
    expect(h1).not.toContain('/src/entry-client.ts')
    // ISR cache returns identical HTML on the repeat request.
    expect(h2).toBe(h1)
  })

  test('GET /about is server-rendered', async ({ page }) => {
    const resp = await page.request.get('/about')
    expect(resp.status()).toBe(200)
    const html = await resp.text()
    expect(html).toContain('data-testid="nav-about"')
    expect(html).not.toContain('<!--pyreon-app-->')
  })

  test('hydrates + client-side navigation works', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/')
    await expect(page.getByTestId('nav-home')).toBeVisible()
    await page.getByTestId('nav-about').click()
    await expect(page).toHaveURL(/\/about$/)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
