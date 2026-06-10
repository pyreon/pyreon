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
    // The PAGE's own content — NOT just the layout chrome. The layout's nav
    // (`nav-home`) renders even when the page leaf is empty, so it could not
    // catch the 0.30.0 empty-page regression: the lazy page component wasn't
    // resolved before the synchronous render, so the depth-1 RouterView
    // rendered NOTHING inside the layout (status 200, masked by hydration).
    // Asserting the route's OWN content is the gap-closer.
    expect(html).toContain('Interactive Counter')
    // The unfilled SSR template placeholder must NEVER reach the client.
    expect(html).not.toContain('<!--pyreon-app-->')
  })

  test('GET /about is server-rendered (PAGE content, not just the layout nav)', async ({ page }) => {
    const resp = await page.request.get('/about')
    expect(resp.status()).toBe(200)
    const html = await resp.text()
    expect(html).toContain('data-testid="nav-about"')
    // The about PAGE's own marker — empty pre-fix (lazy component unresolved),
    // present after the handler resolves lazy components via `router.preload`.
    expect(html).toContain('data-testid="about-page"')
    expect(html).not.toContain('<!--pyreon-app-->')
  })

  test('GET /posts is server-rendered FROM ITS LOADER (page content + data + hydration payload)', async ({ page }) => {
    // The real-app surface: a route with a `loader` + `useLoaderData`. Proves
    // the production server runs the loader server-side, renders the data
    // (not an empty shell), and emits the hydration payload so the client can
    // hydrate the loaded data — not just that static routes render.
    const resp = await page.request.get('/posts')
    expect(resp.status()).toBe(200)
    const html = await resp.text()
    expect(html).toContain('data-pyreon-router-view')
    // The posts PAGE's own marker — the gap-closer (layout nav alone passed
    // even when the page rendered blank pre-fix).
    expect(html).toContain('data-testid="posts-page"')
    expect(html).not.toContain('<!--pyreon-app-->')
    // Loader data serialized for client hydration.
    expect(html).toContain('__PYREON_LOADER_DATA__')
  })

  test('dynamic [id] route + API route are served', async ({ page }) => {
    // Dynamic-route loader (/posts/1) renders ...
    const dyn = await page.request.get('/posts/1')
    expect(dyn.status()).toBe(200)
    expect(await dyn.text()).not.toContain('<!--pyreon-app-->')
    // ... and API routes are dispatched by the production server (not 404ed).
    const api = await page.request.get('/api/posts')
    expect(api.status()).toBe(200)
    expect(api.headers()['content-type']).toContain('json')
    const body = await api.json()
    expect(Array.isArray(body) && body.length > 0).toBe(true)
  })

  test('static client assets are served', async ({ page }) => {
    const html = await (await page.request.get('/')).text()
    const match = html.match(/\/assets\/[\w.-]+\.js/)
    expect(match, 'expected a hashed /assets/*.js reference in the SSR HTML').toBeTruthy()
    const asset = await page.request.get(match![0])
    expect(asset.status()).toBe(200)
    expect(asset.headers()['content-type']).toContain('javascript')
  })

  // ─── Phase 2 — hybrid rendering (per-route renderMode in an SSR app) ───────

  test("hybrid 'ssg' route is served STATIC-FIRST — identical build-time stamp across requests", async ({
    page,
  }) => {
    // hybrid-static.ts declares `renderMode = 'ssg'` and its loader bakes a
    // timestamp AT RENDER TIME. Static-first proof: two requests return the
    // SAME stamp (rendered once, at build). An SSR render would produce a
    // fresh stamp per request — so this assertion is the load-bearing
    // discriminator, not just a 200 check.
    const first = await (await page.request.get('/hybrid-static')).text()
    const second = await (await page.request.get('/hybrid-static')).text()
    const stampOf = (html: string) =>
      html.match(/data-testid="hybrid-static-stamp">(\d+)</)?.[1]
    const a = stampOf(first)
    const b = stampOf(second)
    expect(a, 'expected the build-time stamp in the response').toBeTruthy()
    expect(a).toBe(b)
  })

  test("hybrid 'spa' route returns the CSR SHELL raw — and mounts client-side", async ({
    page,
  }) => {
    // hybrid-spa.ts declares `renderMode = 'spa'` — the opt-out-of-SSR hatch.
    // RAW response: no server-rendered page markup, no unfilled placeholders.
    const raw = await (await page.request.get('/hybrid-spa')).text()
    expect(raw).not.toContain('hybrid-spa-page')
    expect(raw).not.toContain('<!--pyreon-app-->')
    // The shell still carries the hashed client entry — that's what mounts.
    expect(raw).toMatch(/\/assets\/[\w.-]+\.js/)

    // Browser: the client takes the SPA cold-start path (mount + loaders)
    // and the page becomes interactive.
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/hybrid-spa')
    await expect(page.getByTestId('hybrid-spa-page')).toBeVisible()
    await page.getByTestId('hybrid-spa-inc').click()
    await expect(page.getByTestId('hybrid-spa-count')).toHaveText('1')
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  // ─── Phase 4 — server islands (cacheable page, per-request holes) ──────────

  test('server island: the PAGE carries only the marker; fragments render PER REQUEST', async ({
    page,
  }) => {
    // 1. Raw page response: the marker (with fallback) is present, the
    //    island's CONTENT is not — that's what keeps the page cacheable.
    const raw = await (await page.request.get('/server-island-demo')).text()
    expect(raw).toContain('<pyreon-server-island')
    expect(raw).toContain('data-name="ServerStamp"')
    expect(raw).toContain('server-stamp-fallback')
    expect(raw).not.toContain('data-testid="server-stamp"')

    // 2. The fragment endpoint renders per request: two fetches → two
    //    DIFFERENT stamps (the inverse of hybrid-static's static-first
    //    proof, where two fetches must be IDENTICAL).
    const propsQ = `?props=${encodeURIComponent(JSON.stringify({ label: 'now' }))}`
    const f1 = await (await page.request.get(`/_pyreon/fragment/ServerStamp${propsQ}`)).text()
    await new Promise((r) => setTimeout(r, 5))
    const f2 = await (await page.request.get(`/_pyreon/fragment/ServerStamp${propsQ}`)).text()
    expect(f1).toContain('now:')
    expect(f2).toContain('now:')
    expect(f1).not.toBe(f2)

    // 3. Unknown island names 404 (the endpoint allowlist).
    const nope = await page.request.get('/_pyreon/fragment/NotRegistered')
    expect(nope.status()).toBe(404)

    // 4. In the browser, the client activation swaps the fragment in.
    await page.goto('/server-island-demo')
    await expect(page.getByTestId('server-stamp')).toBeVisible()
    await expect(page.getByTestId('server-stamp')).toContainText('now:')
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
