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

  // Route middleware is the documented auth hook. It must gate EVERY way to
  // the page and its server data — not only a bare full-page GET.
  test('route middleware gates the page, a query-string variant, and the data endpoint', async ({ page }) => {
    for (const path of [
      '/guarded',
      '/guarded?x=1',
      '/_pyreon/data?path=/guarded',
      `/_pyreon/data?path=${encodeURIComponent('/guarded?x=1')}`,
    ]) {
      const res = await page.request.get(path)
      expect(res.status(), path).toBe(401)
      expect(await res.text(), path).not.toContain('GUARDED_SENTINEL_m4k2')
    }
    const ok = await page.request.get('/_pyreon/data?path=/guarded', {
      headers: { 'x-demo-auth': 'let-me-in' },
    })
    expect(ok.status()).toBe(200)
    expect(await ok.text()).toContain('GUARDED_SENTINEL_m4k2')
  })

  // The node runner used to drop request bodies, so every API POST arrived
  // empty and `req.json()` threw.
  test('an API POST reaches its handler with its body', async ({ page }) => {
    const res = await page.request.post('/api/posts', {
      data: { title: 'from e2e', body: 'body survives' },
    })
    expect(res.status()).toBe(201)
    expect(await res.json()).toMatchObject({ title: 'from e2e', body: 'body survives' })
  })

  // `zero({ mode: 'isr' })` must reach the running server. Before the config
  // was injected into the server build, this app rendered as plain SSR and
  // the "same HTML twice" check above passed anyway.
  test('the ISR cache is actually active (second request is a HIT)', async ({ page }) => {
    await page.request.get('/about')
    const second = await page.request.get('/about')
    expect(second.headers()['x-isr-cache']).toBe('HIT')
  })

  // ISR caches page renders only: an API route stays live and keeps its type.
  test('API routes are never ISR-cached and keep their content type', async ({ page }) => {
    const res = await page.request.get('/api/posts')
    expect(res.headers()['content-type']).toContain('application/json')
    expect(res.headers()['x-isr-cache']).toBeUndefined()
  })
})
