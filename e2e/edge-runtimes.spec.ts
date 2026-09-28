import { expect, test } from '@playwright/test'

/**
 * Edge deploy artifacts, served by their REAL runtimes — see
 * `e2e-configs/edge-runtimes.config.ts`. One Playwright project per runtime;
 * every spec runs against every runtime.
 *
 * Content is asserted on the RAW HTTP response (`request.get`, no JS):
 * hydration re-renders the page client-side, so a DOM assertion passes even
 * when the server sent an empty shell.
 */

/** What `/api/runtime` must report per project — proof the request really ran there. */
const EXPECTED_RUNTIME: Record<string, string> = {
  deno: 'deno',
  netlify: 'deno',
  vercel: 'edge-runtime',
  cloudflare: 'workerd',
}

test.describe('edge runtime deploy artifact', () => {
  test('the API route executes inside the expected runtime', async ({ request }, info) => {
    const res = await request.get('/api/runtime')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ runtime: EXPECTED_RUNTIME[info.project.name], path: '/api/runtime' })
  })

  test('an API route accepts a POST body', async ({ request }) => {
    const res = await request.post('/api/runtime', { data: { echo: 'edge-post' } })
    expect(res.status()).toBe(201)
    expect(await res.json()).toEqual({ echo: 'edge-post' })
  })

  test('GET / is server-rendered with the BUILT client entry', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('EDGE_HOME_SENTINEL')
    // No filesystem on the edge: the built template (hashed entry) must be
    // inlined. Without it the page ships the DEV entry and never hydrates.
    expect(html).toMatch(/<script type="module"[^>]*src="\/assets\/index-[\w-]+\.js"/)
    expect(html).not.toContain('/src/entry-client')
    expect(html).not.toContain('<!--pyreon-app-->')
  })

  test('a loader route renders its data and embeds it for hydration', async ({ request }) => {
    const html = await (await request.get('/posts/1')).text()
    expect(html).toContain('<h1 data-testid="post-title">EDGE_POST_ONE</h1>')
    expect(html).toContain('window.__PYREON_LOADER_DATA__={"/posts/:id":{"id":1,"title":"EDGE_POST_ONE"}}')
  })

  test('a loader redirect() is a real 3xx', async ({ request }) => {
    const res = await request.get('/old-home', { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers().location).toBe('/posts/2')
  })

  test('a streamed route flushes the fallback before the resolved boundary', async ({ request }) => {
    const html = await (await request.get('/stream')).text()
    const fallback = html.indexOf('data-testid="stream-fallback"')
    const resolved = html.indexOf('EDGE_STREAMED_SENTINEL')
    expect(fallback).toBeGreaterThan(-1)
    expect(resolved).toBeGreaterThan(fallback)
    expect(html).toContain('__NS("pyreon-s-0","pyreon-t-0")')
  })

  test('hashed client assets are served as JavaScript', async ({ request }) => {
    const home = await (await request.get('/')).text()
    const entry = home.match(/src="(\/assets\/index-[\w-]+\.js)"/)?.[1]
    expect(entry).toBeDefined()
    const res = await request.get(entry as string)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/javascript/)
    expect(await res.text()).not.toContain('<!doctype html>')
  })

  test('public/ files are served as themselves, not shadowed by SSR', async ({ request }) => {
    // `robots.txt` is on every adapter's hardcoded list; `humans.txt` is not —
    // it stands for every other file a user puts in `public/`.
    for (const [path, body] of [
      ['/robots.txt', 'User-agent: *'],
      ['/humans.txt', 'EDGE_PUBLIC_FILE_SENTINEL'],
    ] as const) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(200)
      const text = await res.text()
      expect(text, path).toContain(body)
      expect(text, path).not.toContain('<!doctype html>')
    }
  })

  test('the page hydrates in a real browser', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    // The client entry is a (deferred) module + a lazy route chunk; once the
    // network settles, hydration has run and the handlers are live.
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('counter-value')).toHaveText('0')
    await page.getByTestId('increment').click()
    await expect(page.getByTestId('counter-value')).toHaveText('1')
    // Client-side navigation runs the loader in the browser.
    await page.getByTestId('nav-post').click()
    await expect(page.getByTestId('post-title')).toHaveText('EDGE_POST_ONE')
    expect(errors).toEqual([])
  })
})
