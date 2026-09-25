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
      html.match(/data-testid="hybrid-static-stamp">(?:<!--\$-->)?(\d+)/)?.[1]
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

  // ─── Phase 5 — server loaders (.server.ts siblings + single-fetch) ─────────

  test('server loader: SSR runs it in-process (cookies flow); the client bundle excludes it', async ({
    page,
  }) => {
    // SSR render: the .server.ts sibling ran with the real request.
    const resp = await page.request.get('/secret-data', {
      headers: { Cookie: 'probe=1' },
    })
    const html = await resp.text()
    expect(html).toContain('SERVER_ONLY_SENTINEL_q7x9')
    // Reactive/loader values are wrapped in `<!--$-->` hydration range markers.
    expect(html).toMatch(/cookie-flag">(?:<!--\$-->)?yes/)
    // The hydration blob carries the data (no client refetch on first load).
    expect(html).toContain('__PYREON_LOADER_DATA__')
  })

  test('server loader: client-side navigation single-fetches /_pyreon/data (no reload)', async ({
    page,
  }) => {
    const dataRequests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/_pyreon/data')) dataRequests.push(r.url())
    })
    await page.goto('/')
    await page.evaluate(() => {
      ;(window as never as Record<string, unknown>).__nav_sentinel = 'alive'
    })
    // Navigate client-side through a REAL RouterLink (the router's own nav
    // pipeline — guards, loaders, the /_pyreon/data single-fetch).
    await page.getByTestId('nav-secret').click()
    await expect(page.getByTestId('secret-value')).toHaveText(
      'SERVER_ONLY_SENTINEL_q7x9',
      { timeout: 10_000 },
    )
    // Exactly one single-fetch request served the whole chain.
    expect(dataRequests.length).toBe(1)
    expect(dataRequests[0]).toContain('path=%2Fsecret-data')
    // No full reload happened (the window sentinel survived).
    const sentinel = await page.evaluate(
      () => (window as never as Record<string, unknown>).__nav_sentinel,
    )
    expect(sentinel).toBe('alive')
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
})

/**
 * @pyreon/zero `<Link>` prefetch — the modulepreload MIME bug.
 *
 * `doPrefetch` used to inject `<link rel="modulepreload" href={routePath}>`.
 * The href is the ROUTE PATH, which this SSR server returns as `text/html`, so
 * the browser fetched it as a module script and logged strict-MIME "Failed to
 * load module script" on EVERY hovered link. The fix warms the real chunk via
 * `router.preload(...)` and keeps only the valid `rel="prefetch" as="document"`
 * hint. This runs against the real built SSR server (route paths return HTML),
 * so it observes the ACTUAL browser console error — happy-dom can't.
 *
 * Bisect-verified: reverting `link.tsx` to the modulepreload injection fails
 * this spec with a captured "Failed to load module script" error + a
 * `link[rel="modulepreload"][href="/about"]` present in <head>.
 */
test.describe('zero <Link> prefetch — no modulepreload MIME error', () => {
  test('hovering a <Link> warms the route without a broken modulepreload', async ({ page }) => {
    const moduleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && /Failed to load module script/i.test(m.text())) {
        moduleErrors.push(m.text())
      }
    })
    // Some browsers surface the strict-MIME failure as a page error too.
    page.on('pageerror', (e) => {
      if (/Failed to load module script/i.test(e.message)) moduleErrors.push(e.message)
    })

    await page.goto('/link-prefetch-probe')
    const link = page.locator('[data-testid="link-prefetch-probe"] a[href="/about"]')
    await expect(link).toBeVisible()

    await link.hover()
    // Let the prefetch inject its hints and (in the broken version) let the
    // module fetch resolve to the failing MIME check.
    await page.waitForTimeout(600)

    // 1. No strict-MIME console error from a modulepreload against an HTML route.
    expect(moduleErrors, moduleErrors.join('\n')).toHaveLength(0)
    // 2. No modulepreload hint pointing at the route path (the bug's DOM mutation).
    await expect(
      page.locator('head link[rel="modulepreload"][href="/about"]'),
    ).toHaveCount(0)
    // 3. The valid document prefetch IS present (the good half of doPrefetch).
    await expect(
      page.locator('head link[rel="prefetch"][href="/about"][as="document"]'),
    ).toHaveCount(1)
  })

})

/**
 * Server functions — `examples/ssr-showcase/src/routes/form-actions.tsx`: a
 * route `action` export submitted through `<Form>`. The same form must work
 * with JavaScript DISABLED (real POST → server runs the action → re-render or
 * 303) and enhanced WITH JavaScript (fetch, no navigation, loaders revalidate).
 * Names are unique per spec: the guestbook lives in the server process.
 */
test.describe('server functions (<Form> + route action)', () => {
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('a form post runs the action and re-renders with the result', async ({ page }) => {
      await page.goto('/form-actions')
      await page.getByTestId('name-input').fill('nojs-ann')
      await page.getByTestId('submit').click()
      await expect(page.getByTestId('result')).toHaveText('added: nojs-ann')
      await expect(page.getByTestId('entries')).toContainText('nojs-ann')
      // A plain document POST landed on the page itself.
      expect(new URL(page.url()).pathname).toBe('/form-actions')
    })

    test('a fail() re-renders with the error and its status', async ({ page }) => {
      await page.goto('/form-actions')
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST'),
        page.getByTestId('submit').click(),
      ])
      expect(resp.status()).toBe(422)
      await expect(page.getByTestId('result')).toHaveText('error: Name is required')
    })

    test('a redirect() is POST/Redirect/GET (303)', async ({ page }) => {
      await page.goto('/form-actions')
      await page.getByTestId('name-input').fill('nojs-leaver')
      await page.getByTestId('submit-redirect').click()
      await expect(page).toHaveURL(/\/about$/)
      const list = await page.request.get('/form-actions')
      expect(await list.text()).toContain('nojs-leaver')
    })
  })

  test('a cross-origin form post is rejected before the handler runs', async ({ request }) => {
    const resp = await request.post('/form-actions', {
      form: { name: 'forged-entry' },
      headers: { origin: 'https://evil.example' },
    })
    expect(resp.status()).toBe(403)
    expect(await (await request.get('/form-actions')).text()).not.toContain('forged-entry')
  })

  test('with JavaScript: submits via fetch, no navigation, loaders revalidate', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/form-actions')
    await page.waitForLoadState('networkidle')
    // A full document navigation would wipe this marker.
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: boolean }).__noReload = true
    })
    const documentPosts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.resourceType() === 'document') documentPosts.push(r.url())
    })
    await page.getByTestId('name-input').fill('js-bea')
    await page.getByTestId('submit').click()
    await expect(page.getByTestId('result')).toHaveText('added: js-bea')
    // router.revalidate() re-fetched the server loader.
    await expect(page.getByTestId('entries')).toContainText('js-bea')
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
    expect(documentPosts).toEqual([])
    // resetOnSuccess cleared the field.
    await expect(page.getByTestId('name-input')).toHaveValue('')
    expect(errors).toEqual([])
  })

  test('a document POST re-render hydrates with the result kept (then enhances)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error' || /mismatch/i.test(m.text())) errors.push(m.text())
    })
    await page.goto('/form-actions?tab=guests')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('name-input').fill('hydrate-cy')
    // form.submit() skips the submit event → a real document POST, exactly
    // what a browser does before (or without) the enhancement.
    await Promise.all([
      page.waitForNavigation(),
      page.evaluate(() => {
        const f = document.querySelector('[data-testid="guestbook-form"]') as HTMLFormElement
        HTMLFormElement.prototype.submit.call(f)
      }),
    ])
    await page.waitForLoadState('networkidle')
    // The page query survived the post.
    expect(new URL(page.url()).search).toContain('tab=guests')
    // Server-rendered result survives hydration (read back from the page's state).
    await expect(page.getByTestId('result')).toHaveText('added: hydrate-cy')
    // And the hydrated form is live: an enhanced submission updates in place.
    await page.getByTestId('name-input').fill('hydrate-dee')
    await page.getByTestId('submit').click()
    await expect(page.getByTestId('result')).toHaveText('added: hydrate-dee')
    expect(errors).toEqual([])
  })

  test('with JavaScript: a redirect() navigates client-side', async ({ page }) => {
    await page.goto('/form-actions')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('name-input').fill('js-leaver')
    await page.getByTestId('submit-redirect').click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByTestId('about-page')).toBeVisible()
  })
})
