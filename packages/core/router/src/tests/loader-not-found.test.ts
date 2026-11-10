/**
 * `notFound()` thrown from a loader of a MATCHED route ("matched route,
 * missing resource") resolves to the router's not-found state on every path
 * that runs loaders: SSR preload, the data endpoint's `runServerLoaders`, a
 * client navigation (isomorphic loader or single-fetch payload), `prefetch`,
 * and the hydrating client (seeded from the loader-data blob's marker) — and
 * all of them resolve the SAME chain, so the hydrated DOM matches the server.
 */
import { hydrateLoaderData, prefetchLoaderData, serializeLoaderData } from '../loader'
import { notFound } from '../not-found'
import { redirect } from '../redirect'
import { createRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const Layout = () => null
const Item = () => null
const NotFoundPage = () => null

const ITEMS: Record<string, string> = { '1': 'First' }

function itemsRoutes(key: 'loader' | 'serverLoader' | 'hasServerLoader' = 'loader'): RouteRecord[] {
  const leaf: RouteRecord = { path: 'items/:id', component: Item }
  if (key === 'hasServerLoader') leaf.hasServerLoader = true
  else
    leaf[key] = async ({ params }) => {
      const name = ITEMS[params.id as string]
      if (!name) notFound()
      return { name }
    }
  return [
    {
      path: '/',
      component: Layout,
      notFoundComponent: NotFoundPage,
      loader: async () => 'LAYOUT',
      children: [leaf],
    },
  ]
}

const make = (routes: RouteRecord[], url = '/'): RouterInstance =>
  createRouter({ routes, url }) as RouterInstance

const leafOf = (r: RouterInstance) => {
  const m = r.currentRoute().matched
  return m[m.length - 1]
}

describe('loader notFound() — server paths', () => {
  test('preload: currentRoute resolves to the not-found chain inside the layout', async () => {
    const routes = itemsRoutes()
    const router = make(routes, '/items/9999')
    await router.preload('/items/9999')
    const route = router.currentRoute()
    expect(route.isNotFound).toBe(true)
    expect(route.path).toBe('/items/9999')
    expect(route.params).toEqual({ id: '9999' })
    expect(route.matched[0]).toBe(routes[0])
    expect(leafOf(router)?.component).toBe(NotFoundPage)
    // The layout's own loader still ran and its data is kept.
    expect(router._loaderData.get(routes[0]!)).toBe('LAYOUT')
  })

  test('preload: a found item stays on its own route', async () => {
    const router = make(itemsRoutes(), '/items/1')
    await router.preload('/items/1')
    expect(router.currentRoute().isNotFound).toBeUndefined()
    expect(leafOf(router)?.component).toBe(Item)
  })

  test('preload: redirect() still wins over a sibling notFound()', async () => {
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        loader: () => redirect('/login'),
        children: [{ path: 'x', component: Item, loader: () => notFound() }],
      },
    ]
    const router = make(routes, '/x')
    await expect(router.preload('/x')).rejects.toSatisfy(
      (e: unknown) => (e as { message?: string }).message !== 'Not Found',
    )
  })

  test('preload: no notFoundComponent anywhere → isNotFound with an empty chain (SSR 404)', async () => {
    const routes: RouteRecord[] = [{ path: '/x/:id', component: Item, loader: () => notFound() }]
    const router = make(routes, '/x/1')
    await router.preload('/x/1')
    expect(router.currentRoute().isNotFound).toBe(true)
    expect(router.currentRoute().matched).toEqual([])
  })

  test('runServerLoaders: a serverLoader notFound() → { kind: "notFound" }', async () => {
    const router = make(itemsRoutes('serverLoader'), '/items/9999')
    await expect(router.runServerLoaders('/items/9999')).resolves.toEqual({ kind: 'notFound' })
    const ok = await router.runServerLoaders('/items/1')
    expect(ok).toEqual({ kind: 'data', data: { 1: { name: 'First' } } })
  })

  test('serializeLoaderData marks the not-found state; a normal page carries no marker', async () => {
    const nf = make(itemsRoutes(), '/items/9999')
    await nf.preload('/items/9999')
    expect(serializeLoaderData(nf)).toEqual({ '/': 'LAYOUT', __pyreonNotFound: true })

    const ok = make(itemsRoutes(), '/items/1')
    await ok.preload('/items/1')
    expect(serializeLoaderData(ok)).not.toHaveProperty('__pyreonNotFound')
  })

  test('prefetchLoaderData: notFound() enters the state instead of rejecting', async () => {
    const router = make(itemsRoutes(), '/items/9999')
    await expect(prefetchLoaderData(router, '/items/9999')).resolves.toBeUndefined()
    expect(router.currentRoute().isNotFound).toBe(true)
  })
})

describe('loader notFound() — hydrating client', () => {
  test('hydrateLoaderData with the marker resolves the SAME chain the server rendered', async () => {
    const routes = itemsRoutes()
    const server = make(routes, '/items/9999')
    await server.preload('/items/9999')
    const blob = JSON.parse(JSON.stringify(serializeLoaderData(server))) as Record<string, unknown>

    const client = make(routes, '/items/9999')
    hydrateLoaderData(client, blob)
    expect(client.currentRoute().isNotFound).toBe(true)
    expect(client.currentRoute().matched).toEqual(server.currentRoute().matched)
    expect(client._loaderData.get(routes[0]!)).toBe('LAYOUT')
  })

  test('the hydrated not-found state clears on the next navigation', async () => {
    const client = make(itemsRoutes(), '/items/9999')
    hydrateLoaderData(client, { '/': 'LAYOUT', __pyreonNotFound: true })
    await client.push('/items/1')
    expect(client.currentRoute().isNotFound).toBeUndefined()
    expect(leafOf(client)?.component).toBe(Item)
  })
})

describe('loader notFound() — client navigation', () => {
  test('an isomorphic loader notFound() lands on the not-found page, not onError', async () => {
    const onError = vi.fn()
    const router = createRouter({ routes: itemsRoutes(), url: '/', onError }) as RouterInstance
    expect(await router.push('/items/9999')).toBe('committed')
    expect(router.currentRoute().isNotFound).toBe(true)
    expect(router.currentRoute().path).toBe('/items/9999')
    expect(leafOf(router)?.component).toBe(NotFoundPage)
    expect(onError).not.toHaveBeenCalled()

    // Next navigation clears it; going back re-runs the loader and re-enters it.
    await router.push('/items/1')
    expect(router.currentRoute().isNotFound).toBeUndefined()
    expect(leafOf(router)?.component).toBe(Item)
    await router.push('/items/9999')
    expect(router.currentRoute().isNotFound).toBe(true)
  })

  test('a single-fetch payload { notFound: true } lands on the not-found page', async () => {
    const router = make(itemsRoutes('hasServerLoader'), '/')
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('{"notFound":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch
    try {
      expect(await router.push('/items/9999')).toBe('committed')
      expect(router.currentRoute().isNotFound).toBe(true)
      expect(leafOf(router)?.component).toBe(NotFoundPage)
    } finally {
      globalThis.fetch = original
    }
  })

  test('revalidate: a resource that disappeared enters the not-found state', async () => {
    let exists = true
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundPage,
        children: [
          {
            path: 'doc',
            component: Item,
            loader: async () => (exists ? 'DOC' : notFound()),
          },
        ],
      },
    ]
    const router = make(routes, '/')
    await router.push('/doc')
    expect(router.currentRoute().isNotFound).toBeUndefined()
    exists = false
    await router.revalidate()
    expect(router.currentRoute().isNotFound).toBe(true)
    expect(leafOf(router)?.component).toBe(NotFoundPage)
  })
})
