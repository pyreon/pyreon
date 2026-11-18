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
