import { expect, test } from '@playwright/test'

/**
 * SSR node-deploy artifact gate (Bug A + C). Runs against the emitted
 * `node dist/index.js` server — see `e2e-configs/ssr-node.config.ts`.
 *
 * Bug A: the adapter staged the client with `cp(clientOutDir, outDir/client)`
 * where `clientOutDir === outDir === dist` — a copy-into-self EINVAL that
 * aborted staging, so `dist/index.js` (the runnable server) never existed.
 * Bug C: even when it ran, the server static-served the SSR template
 * `index.html` at `/`, shipping the unfilled `<!--pyreon-app-->` shell
 * instead of server-rendering the home route.
 *
 * If the server didn't boot, every spec here fails at the webServer step.
 */
test.describe('SSR node deploy artifact', () => {
  test('GET / is SERVER-RENDERED, not the empty template shell', async ({ page }) => {
    // Raw server response — no browser rendering/hydration.
    const resp = await page.request.get('/')
    expect(resp.status()).toBe(200)
    const html = await resp.text()
    // Server-rendered route content is present in the RAW response.
    expect(html).toContain('data-pyreon-router-view')
    expect(html).toContain('data-testid="nav-home"')
    // The unfilled SSR template placeholder must NEVER reach the client.
    expect(html).not.toContain('<!--pyreon-app-->')
  })

  test('GET /about is server-rendered', async ({ page }) => {
    const resp = await page.request.get('/about')
    expect(resp.status()).toBe(200)
    const html = await resp.text()
    expect(html).toContain('data-testid="nav-about"')
    expect(html).not.toContain('<!--pyreon-app-->')
  })

  test('static client assets are served', async ({ page }) => {
    const html = await (await page.request.get('/')).text()
    const match = html.match(/\/assets\/[\w.-]+\.js/)
    expect(match, 'expected a hashed /assets/*.js reference in the SSR HTML').toBeTruthy()
    const asset = await page.request.get(match![0])
    expect(asset.status()).toBe(200)
    expect(asset.headers()['content-type']).toContain('javascript')
  })

  test('hydrates + client-side navigation works (assets load + run)', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/')
    await expect(page.getByTestId('nav-home')).toBeVisible()
    // A working in-app navigation proves the client bundle loaded + hydrated
    // (which in turn proves static assets were served by the node server).
    await page.getByTestId('nav-about').click()
    await expect(page).toHaveURL(/\/about$/)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
