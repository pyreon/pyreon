import { gzipSync } from 'node:zlib'
import { expect, type Page, test } from '@playwright/test'
import { waitForHydration } from './hydration-barrier'

// Islands-only pages in @pyreon/zero (#4371), against a real SSG build of
// zero's `fixture-islands-only` (see e2e-configs/zero-islands-only.config.ts).
// `/` and `/about` are app pages; `/static` (a `load` island under an island
// root that provides the theme) and `/empty` (no islands) declare
// `export const hydrate = 'islands'`. The client entry is `startClientLazy`.

interface Script {
  url: string
  body: string
}

/** Every JS response the page receives, with its body. */
function captureScripts(page: Page): Script[] {
  const scripts: Script[] = []
  page.on('response', async (res) => {
    if (!res.url().endsWith('.js')) return
    scripts.push({ url: res.url(), body: await res.text().catch(() => '') })
  })
  return scripts
}

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

const gz = (scripts: Script[]) => scripts.reduce((n, s) => n + gzipSync(s.body, { level: 9 }).length, 0)

/** Mark the current document, to tell a client-side navigation from a document load. */
const stamp = (page: Page) => page.evaluate(() => ((window as { __doc?: number }).__doc = 1))
const sameDocument = (page: Page) => page.evaluate(() => (window as { __doc?: number }).__doc === 1)

test.describe('islands-only pages in @pyreon/zero', () => {
  test('the island hydrates, adopts its server HTML and is interactive; the app never loads', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    const scripts = captureScripts(page)
    await page.goto('/static')
    const counter = page.getByTestId('counter')
    // Server HTML: the island rendered under the layout's theme provider.
    await expect(counter).toHaveText('dark:0')
    await expect(page.locator('pyreon-island[data-island-hydrated]')).toHaveCount(1)
    // Adopted, not rebuilt: the node the server sent is the one that hydrated.
    await page.evaluate(() => {
      ;(document.querySelector('[data-testid="counter"]') as HTMLElement & { __server?: boolean }).__server = true
    })
    await counter.click()
    await expect(counter).toHaveText('dark:1')
    expect(
      await page.evaluate(
        () => (document.querySelector('[data-testid="counter"]') as HTMLElement & { __server?: boolean }).__server,
      ),
    ).toBe(true)
    // No app on this page: the container was never hydrated.
    expect(await page.locator('#app[data-pyreon-hydrated]').count()).toBe(0)
    await page.waitForLoadState('networkidle')
    // The JS this page requested holds no router and no route code.
    expect(scripts.length).toBeGreaterThan(0)
    expect(scripts.filter((s) => s.body.includes('popstate')).map((s) => s.url)).toEqual([])
    expect(scripts.filter((s) => s.body.includes('STATIC_ROUTE_MODULE_MARKER')).map((s) => s.url)).toEqual([])
    expect(errors).toEqual([])
    console.log(`[islands-only bytes] /static: ${scripts.length} JS files, ${gz(scripts)} B gzip -9`)
  })

  test('an islands-only page with no islands requests only the entry', async ({ page }) => {
    const errors = collectErrors(page)
    const scripts = captureScripts(page)
    await page.goto('/empty')
    await expect(page.getByTestId('empty-page')).toBeVisible()
    await page.waitForLoadState('networkidle')
    // The entry (and Vite's preload helper it imports), nothing else: no
    // islands runtime, no router, no route code.
    const files = scripts.map((s) => s.url.slice(s.url.lastIndexOf('/') + 1))
    expect(files.filter((f) => !/^(?:index|preload-helper)-[\w-]+\.js$/.test(f))).toEqual([])
    expect(errors).toEqual([])
    console.log(`[islands-only bytes] /empty: ${scripts.length} JS files, ${gz(scripts)} B gzip -9`)
  })

  test('an app page still starts the app (measured for comparison)', async ({ page }) => {
    const errors = collectErrors(page)
    const scripts = captureScripts(page)
    await page.goto('/')
    await waitForHydration(page)
    await page.getByTestId('app-button').click()
    await expect(page.getByTestId('app-button')).toHaveText('app:1')
    await page.waitForLoadState('networkidle')
    expect(scripts.some((s) => s.body.includes('popstate'))).toBe(true)
    expect(errors).toEqual([])
    console.log(`[islands-only bytes] /: ${scripts.length} JS files, ${gz(scripts)} B gzip -9`)
  })

  test('app → app is client-side; app → islands-only is a full page load', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    await waitForHydration(page)
    await stamp(page)
    await page.getByTestId('to-about').click()
    await expect(page.getByTestId('about-page')).toBeVisible()
    expect(await sameDocument(page)).toBe(true)

    await page.getByTestId('to-static').click()
    await expect(page).toHaveURL(/\/static$/)
    await expect(page.locator('meta[name="pyreon-hydrate"]')).toHaveCount(1)
    expect(await sameDocument(page)).toBe(false)
    const counter = page.getByTestId('counter')
    await expect(page.locator('pyreon-island[data-island-hydrated]')).toHaveCount(1)
    await counter.click()
    await expect(counter).toHaveText('dark:1')
    expect(errors).toEqual([])
  })

  test('islands-only → app is a full page load, and back returns to the islands-only page', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/static')
    await expect(page.locator('pyreon-island[data-island-hydrated]')).toHaveCount(1)
    await stamp(page)
    // A <RouterLink> on an islands-only page is a plain link: there is no router.
    await page.getByTestId('to-app').click()
    await expect(page).toHaveURL(/\/$/)
    await waitForHydration(page)
    expect(await sameDocument(page)).toBe(false)
    await page.getByTestId('app-button').click()
    await expect(page.getByTestId('app-button')).toHaveText('app:1')

    await page.goBack()
    await expect(page).toHaveURL(/\/static$/)
    const counter = page.getByTestId('counter')
    await expect(page.locator('pyreon-island[data-island-hydrated]')).toHaveCount(1)
    await counter.click()
    await expect(counter).toHaveText(/dark:[12]/)
    expect(errors).toEqual([])
  })
})

// The same fixture built in `mode: 'ssr'` with the node adapter and served by
// its emitted `node .dist-ssr/index.js` (the second web server in
// e2e-configs/zero-islands-only.config.ts): every page is rendered per
// request. With `startClientLazy` an app page's client loads the app with a
// dynamic import; the server must preload those chunks (as the SSG pages do)
// or the browser finds them only after the entry has run.
const SSR = 'http://localhost:5214'

/** The client-start preloads the server added (`<link rel="modulepreload" href=… crossorigin>`). */
const addedPreloads = (html: string): string[] =>
  [...html.matchAll(/<link rel="modulepreload" href="\/assets\/([^"]+)" crossorigin>/g)].map((m) => m[1]!)

const fileOf = (url: string) => url.slice(url.lastIndexOf('/') + 1)

test.describe('islands-only pages, server-rendered (SSR, node adapter)', () => {
  test('an app page preloads the chunks its lazy entry imports, and the browser uses them', async ({
    page,
    request,
  }) => {
    const html = await (await request.get(`${SSR}/`)).text()
    expect(html).toContain('APP_LOADER_TITLE')
    expect(html).not.toContain('name="pyreon-hydrate"')
    const preloads = addedPreloads(html)
    // The routes module is what the lazy entry imports to start the app.
    expect(preloads.some((f) => /^routes-[\w-]+\.js$/.test(f))).toBe(true)

    const errors = collectErrors(page)
    const scripts = captureScripts(page)
    await page.goto(`${SSR}/`)
    await waitForHydration(page)
    await page.getByTestId('app-button').click()
    await expect(page.getByTestId('app-button')).toHaveText('app:1')
    await page.waitForLoadState('networkidle')
    const requested = new Set(scripts.map((s) => fileOf(s.url)))
    // Every preload is a file the page really loads: no wasted fetch.
    expect(preloads.filter((f) => !requested.has(f))).toEqual([])
    expect(errors).toEqual([])
  })

  test('an islands-only page preloads only the islands runtime: no router, no route code', async ({
    page,
    request,
  }) => {
    const html = await (await request.get(`${SSR}/static`)).text()
    expect(html).toContain('<meta name="pyreon-hydrate" content="islands">')
    expect(html).toContain('STATIC_LOADER_TITLE')
    expect(html).not.toContain('__PYREON_LOADER_DATA__')
    const preloads = addedPreloads(html)
    expect(preloads.some((f) => f.startsWith('islands-runtime-'))).toBe(true)
    expect(preloads.some((f) => /^routes-[\w-]+\.js$/.test(f))).toBe(false)
    for (const file of preloads) {
      const body = await (await request.get(`${SSR}/assets/${file}`)).text()
      expect(body, file).not.toContain('popstate')
      expect(body, file).not.toContain('STATIC_ROUTE_MODULE_MARKER')
    }

    const errors = collectErrors(page)
    const scripts = captureScripts(page)
    await page.goto(`${SSR}/static`)
    const counter = page.getByTestId('counter')
    await expect(page.locator('pyreon-island[data-island-hydrated]')).toHaveCount(1)
    await counter.click()
    await expect(counter).toHaveText('dark:1')
    await page.waitForLoadState('networkidle')
    const requested = new Set(scripts.map((s) => fileOf(s.url)))
    expect(preloads.filter((f) => !requested.has(f))).toEqual([])
    expect(scripts.filter((s) => s.body.includes('popstate')).map((s) => s.url)).toEqual([])
    expect(errors).toEqual([])
  })

  test('an islands-only page with no islands preloads nothing', async ({ request }) => {
    const html = await (await request.get(`${SSR}/empty`)).text()
    expect(html).toContain('<meta name="pyreon-hydrate" content="islands">')
    expect(addedPreloads(html)).toEqual([])
  })
})

// The same fixture under zero's DEV server (the third web server): HMR. The
// browser never loads an islands-only page's route code, so when a module the
// server rendered with changes, Vite has no client module to update; the page
// must reload to get the new server HTML. `/__pyreon_hmr_touch__` drives
// Vite's real HMR pipeline for a fixture file (see fixture-islands-only/dev.ts).
const DEV = 'http://localhost:5218'
const touch = (page: Page, file: string) => page.request.get(`${DEV}/__pyreon_hmr_touch__?f=${file}`)

test.describe('islands-only pages under the dev server (HMR)', () => {
  test('an edit to the route reloads the islands-only page, which hydrates again', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto(`${DEV}/static`)
    await expect(page.locator('meta[name="pyreon-hydrate"]')).toHaveCount(1)
    await expect(page.locator('pyreon-island[data-island-hydrated]')).toHaveCount(1)
    await stamp(page)
    const reloaded = page.waitForEvent('load')
    expect((await touch(page, 'src/routes/static.tsx')).ok()).toBe(true)
    await reloaded
    expect(await sameDocument(page)).toBe(false)
    const counter = page.getByTestId('counter')
    await expect(page.locator('pyreon-island[data-island-hydrated]')).toHaveCount(1)
    await counter.click()
    await expect(counter).toHaveText('dark:1')
    expect(errors).toEqual([])
  })

  test('an edit to the layout reloads the islands-only page too', async ({ page }) => {
    await page.goto(`${DEV}/empty`)
    await expect(page.getByTestId('empty-page')).toBeVisible()
    await stamp(page)
    const reloaded = page.waitForEvent('load')
    await touch(page, 'src/routes/_layout.tsx')
    await reloaded
    expect(await sameDocument(page)).toBe(false)
  })

  test('an app page does not reload for a module it never loaded', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto(`${DEV}/`)
    await waitForHydration(page)
    await page.getByTestId('app-button').click()
    await expect(page.getByTestId('app-button')).toHaveText('app:1')
    await stamp(page)
    await touch(page, 'src/routes/static.tsx')
    // Give a reload every chance to happen before asserting it did not.
    await page.waitForTimeout(1_500)
    expect(await sameDocument(page)).toBe(true)
    await expect(page.getByTestId('app-button')).toHaveText('app:1')
    expect(errors).toEqual([])
  })
})
