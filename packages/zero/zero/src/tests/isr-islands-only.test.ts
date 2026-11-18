/**
 * ISR and islands-only pages (#4371). The cache stores the render it was
 * given and its key is the path, and the path decides the page kind, so a
 * cached islands-only page must come back exactly as rendered: marked, with no
 * loader data. And an app page's entry must never be served for it, nor the
 * reverse.
 */
import { h } from '@pyreon/core'
import { RouterView, type RouteRecord, useLoaderData } from '@pyreon/router'
import { createHandler, ISLANDS_ONLY_MARKER } from '@pyreon/server'
import { describe, expect, it } from 'vitest'
import { createISRHandler } from '../isr'

const Page = () => h('main', null, () => useLoaderData<{ title: string }>()?.title ?? '')

const routes: RouteRecord[] = [
  {
    path: '/static',
    component: Page,
    loader: async () => ({ title: 'static' }),
    meta: { hydrate: 'islands' } as never,
  },
  { path: '/app', component: Page, loader: async () => ({ title: 'app' }) },
]

describe('ISR — islands-only pages', () => {
  it('a HIT serves the islands-only page as rendered, and the app page as rendered', async () => {
    const base = createHandler({ App: () => h(RouterView, null), routes, clientEntry: false })
    const isr = createISRHandler(base, { revalidate: 60 })

    for (let round = 0; round < 2; round++) {
      const staticRes = await isr(new Request('http://localhost/static'))
      const appRes = await isr(new Request('http://localhost/app'))
      expect(staticRes.headers.get('x-isr-cache')).toBe(round === 0 ? 'MISS' : 'HIT')
      expect(appRes.headers.get('x-isr-cache')).toBe(round === 0 ? 'MISS' : 'HIT')
      const staticHtml = await staticRes.text()
      const appHtml = await appRes.text()
      expect(staticHtml).toContain(ISLANDS_ONLY_MARKER)
      expect(staticHtml).not.toContain('__PYREON_LOADER_DATA__')
      expect(appHtml).not.toContain(ISLANDS_ONLY_MARKER)
      expect(appHtml).toContain('__PYREON_LOADER_DATA__')
    }
  })
})

/**
 * Client-start preloads (#4371) through zero's own server: `createServer`
 * hands the build's `__ZERO_CLIENT_PRELOAD__` to the handler, so an app page
 * preloads the lazy entry's app chunks and an islands-only page never does.
 * Under ISR the cache stores each render with its own set: a HIT must carry
 * exactly what its MISS carried.
 */
describe('ISR — client-start preloads per page kind', () => {
  const TEMPLATE =
    '<!doctype html><html><head><!--pyreon-head--><script type="module" src="/assets/entry.js"></script></head>' +
    '<body><div id="app"><!--pyreon-app--></div><!--pyreon-scripts--></body></html>'
  const PRELOAD = { app: ['/assets/client-A.js', '/assets/routes-B.js'], islands: ['/assets/client-islands-C.js'] }
  const g = globalThis as { __ZERO_CLIENT_PRELOAD__?: unknown }
  const preloadsOf = (html: string): string[] =>
    [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1] as string)

  it('MISS and HIT carry the preload set of their own page kind', async () => {
    const { createServer } = await import('../entry-server')
    g.__ZERO_CLIENT_PRELOAD__ = PRELOAD
    try {
      const server = createServer({
        routes,
        config: { mode: 'isr', isr: { revalidate: 60 } },
        template: TEMPLATE,
        clientEntry: false,
      })
      for (const round of ['MISS', 'HIT']) {
        const appRes = await server(new Request('http://localhost/app'))
        const staticRes = await server(new Request('http://localhost/static'))
        expect(appRes.headers.get('x-isr-cache')).toBe(round)
        expect(staticRes.headers.get('x-isr-cache')).toBe(round)
        expect(preloadsOf(await appRes.text())).toEqual(PRELOAD.app)
        // No island on this page: nothing to hydrate, so nothing to preload,
        // and never the app's chunks.
        expect(preloadsOf(await staticRes.text())).toEqual([])
      }
    } finally {
      delete g.__ZERO_CLIENT_PRELOAD__
    }
  })

  it('a dev client entry (not the built one) gets no preloads', async () => {
    const { createServer } = await import('../entry-server')
    g.__ZERO_CLIENT_PRELOAD__ = PRELOAD
    try {
      const server = createServer({ routes, config: { mode: 'ssr' }, template: TEMPLATE })
      expect(preloadsOf(await (await server(new Request('http://localhost/app'))).text())).toEqual([])
    } finally {
      delete g.__ZERO_CLIENT_PRELOAD__
    }
  })
})
