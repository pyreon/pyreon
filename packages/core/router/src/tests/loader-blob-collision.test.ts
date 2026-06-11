// @vitest-environment happy-dom
/**
 * Same-path collision in the SSR hydration blob (review follow-up to the
 * data-endpoint collision fix): a layout and its index page share a path,
 * and plain path-keying last-wins-overwrote one record's data. The blob
 * now keys the first record at a path bare (back-compat) and subsequent
 * same-path records as `path#<occurrence>`.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { createRouter } from '../router'
import { hydrateLoaderData, serializeLoaderData } from '../loader'
import type { RouteRecord } from '../types'

const C = () => h('div', null, 'x')

function chainRoutes() {
  const page = { path: '/dash', component: C } as RouteRecord
  const layout = { path: '/dash', component: C, children: [page] } as RouteRecord
  return { layout, page, routes: [layout] }
}

describe('hydration blob — same-path layout+page collision', () => {
  it('serialize emits DISTINCT keys for same-path records, hydrate maps them back', () => {
    const { layout, page, routes } = chainRoutes()
    const server = createRouter({ routes, mode: 'history', url: '/dash' })
    server._loaderData.set(layout, { who: 'LAYOUT' })
    server._loaderData.set(page, { who: 'PAGE' })
    const blob = serializeLoaderData(server)
    expect(blob['/dash']).toEqual({ who: 'LAYOUT' })
    expect(blob['/dash#1']).toEqual({ who: 'PAGE' }) // pre-fix: overwritten

    const client = createRouter({ routes, mode: 'history', url: '/dash' })
    hydrateLoaderData(client, blob)
    expect(client._loaderData.get(layout)).toEqual({ who: 'LAYOUT' })
    expect(client._loaderData.get(page)).toEqual({ who: 'PAGE' })
  })

  it('non-colliding chains keep the EXACT legacy bare-path format', () => {
    const page = { path: '/about', component: C } as RouteRecord
    const router = createRouter({ routes: [{ path: '/', component: C, children: [page] } as RouteRecord], mode: 'history', url: '/about' })
    router._loaderData.set(page, { a: 1 })
    expect(serializeLoaderData(router)).toEqual({ '/about': { a: 1 } })
  })

  it('hydrate falls back to the bare key for blobs from OLDER servers', () => {
    const { layout, page, routes } = chainRoutes()
    const client = createRouter({ routes, mode: 'history', url: '/dash' })
    hydrateLoaderData(client, { '/dash': { who: 'SHARED' } }) // legacy blob
    expect(client._loaderData.get(layout)).toEqual({ who: 'SHARED' })
    expect(client._loaderData.get(page)).toEqual({ who: 'SHARED' }) // pre-fix parity
  })
})
