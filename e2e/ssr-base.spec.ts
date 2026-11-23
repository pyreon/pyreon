import { expect, test } from '@playwright/test'

/**
 * A server island under a base path, end to end (#4269 follow-up, #4768).
 *
 * `examples/fixtures/ssr-showcase` built with `vite.config.ssr-base.ts`
 * (`base: '/sub/'`, SSR, node adapter) and run on 5204 — see
 * `e2e-configs/ssr-node.config.ts`. What must hold under the base:
 *
 * - the server render signs the marker for the BASED page path
 *   (`data-page="/sub/server-island-demo"`) and never writes the base into
 *   the DOM (the client takes it from code: the fragment is inserted as HTML);
 * - the browser fetches the fragment under the base, and the server
 *   verifies the signature over that same page value (200, not 403);
 * - a marker rendered only on the client has no signature: its first
 *   request is refused (403), and it retries with the signed marker from
 *   the page's server render — all under `/sub/`;
 * - nothing is requested from `/_pyreon/fragment/…` at the host root.
 *
 * Bisect: drop the router base in `serverIsland`'s component body → the
 * fragment goes to the root and the "under the base" assertions fail.
 */
const FRAGMENT = /\/_pyreon\/fragment\/ServerStamp/

test.describe('server island under /sub/', () => {
  test('the server signs the based page path and keeps the base out of the DOM', async ({ page }) => {
    const raw = await (await page.request.get('/sub/server-island-demo')).text()
    expect(raw).toContain('<pyreon-server-island')
    expect(raw).not.toContain('data-base')
    expect(raw).toContain('data-page="/sub/server-island-demo"')
    expect(raw).toMatch(/data-sig="[^"]+"/)
  })

  test('the fragment is fetched, verified and swapped in under the base; the client-rendered marker retries after a 403', async ({
    page,
  }) => {
    const fragments: Array<{ url: string; status: number }> = []
    page.on('response', (r) => {
      if (FRAGMENT.test(r.url())) fragments.push({ url: new URL(r.url()).pathname + new URL(r.url()).search, status: r.status() })
    })

    await page.goto('/sub/server-island-demo')
    const first = page.locator('[data-testid="server-island-demo"] > pyreon-server-island [data-testid="server-stamp"]')
    await expect(first).toBeVisible()
    expect(fragments.length).toBe(1)
    expect(fragments[0]!.status).toBe(200)
    expect(fragments[0]!.url).toMatch(/^\/sub\/_pyreon\/fragment\/ServerStamp\?/)
    expect(fragments[0]!.url).toContain(`page=${encodeURIComponent('/sub/server-island-demo')}`)

    // The client-rendered marker: unsigned → 403 → signed retry, all under /sub/.
    await page.getByTestId('reveal-client-island').click()
    const second = page.locator('[data-testid="client-rendered-island"] [data-testid="server-stamp"]')
    await expect(second).toBeVisible()
    const later = fragments.slice(1)
    expect(later.map((f) => f.status)).toEqual([403, 200])
    for (const f of later) expect(f.url).toMatch(/^\/sub\/_pyreon\/fragment\/ServerStamp\?/)
    expect(later[1]!.url).toContain(`page=${encodeURIComponent('/sub/server-island-demo')}`)

    // Nothing went to the host root.
    expect(fragments.filter((f) => !f.url.startsWith('/sub/'))).toEqual([])
  })
})
