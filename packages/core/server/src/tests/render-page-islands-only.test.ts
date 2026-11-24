// @vitest-environment node
/**
 * Islands-only pages (#4371): a route whose matched chain declares
 * `meta: { hydrate: 'islands' }` is static HTML plus its islands. The browser
 * never starts the app on it, so the server must not ship what only a
 * hydrating app reads (the loader-data blob, the route's modulepreloads), and
 * it must mark the page so the client knows not to start the app.
 *
 * Locked here for every server path that renders a page: `renderPage` (the
 * production string handler, zero's SSG prerender and zero's dev SSR all call
 * it) and the handler's streaming path.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { createRouter, lazy, type RouteRecord, RouterView, useLoaderData } from '@pyreon/router'
import { createHandler } from '../handler'
import { island } from '../island'
import { hasIslandToHydrate, ISLANDS_ONLY_MARKER, isIslandsOnlyMeta, renderPage } from '../render-page'

const App: ComponentFn = () => h(RouterView, null)

const Page: ComponentFn = () => {
  const data = useLoaderData<{ title: string }>()
  return h('main', null, data?.title ?? 'no data')
}

const loader = async () => ({ title: 'from the loader' })

function routesWith(meta: Record<string, unknown> | undefined): RouteRecord[] {
  return [
    {
      path: '/',
      component: App,
      ...(meta ? { meta } : {}),
      children: [{ path: 'page', component: Page, loader }],
    },
  ]
}

async function render(routes: RouteRecord[], path = '/page') {
  const router = createRouter({ routes, mode: 'history', url: path })
  const result = await renderPage(() => h(RouterView, null), router as never, path)
  if (result.kind !== 'html') throw new Error(`expected html, got ${result.kind}`)

  return result
}

describe('isIslandsOnlyMeta', () => {
  test('only the literal "islands" marks a page', () => {
    expect(isIslandsOnlyMeta({ hydrate: 'islands' })).toBe(true)
    expect(isIslandsOnlyMeta({ hydrate: 'app' })).toBe(false)
    expect(isIslandsOnlyMeta({})).toBe(false)
    expect(isIslandsOnlyMeta(undefined)).toBe(false)
  })
})

describe('renderPage — islands-only page', () => {
  test('renders the loader output into the HTML but ships no loader-data script', async () => {
    const result = await render(routesWith({ hydrate: 'islands' }))
    expect(result.appHtml).toContain('from the loader')
    expect(result.loaderScript).not.toContain('__PYREON_LOADER_DATA__')
  })

  test('marks the page in the head', async () => {
    const result = await render(routesWith({ hydrate: 'islands' }))
    expect(result.head).toContain(ISLANDS_ONLY_MARKER)
    expect(result.hydrate).toBe('islands')
  })

  test('reports no route modules, so the SSG adds no route modulepreloads', async () => {
    const LazyPage = lazy(() => Promise.resolve({ default: Page }))
    ;(LazyPage as { _hmrId?: string })._hmrId = '/src/routes/page.tsx'
    const appRoutes: RouteRecord[] = [{ path: '/page', component: LazyPage, loader }]
    const islandsRoutes: RouteRecord[] = [
      { path: '/page', component: LazyPage, loader, meta: { hydrate: 'islands' } as never },
    ]
    expect((await render(appRoutes)).routeModules).toEqual(['/src/routes/page.tsx'])
    expect((await render(islandsRoutes)).routeModules).toEqual([])
  })

  test('a page declaration beats its layout (leaf wins, like renderMode)', async () => {
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: App,
        meta: { hydrate: 'islands' } as never,
        children: [{ path: 'page', component: Page, loader, meta: { hydrate: 'app' } as never }],
      },
    ]
    const result = await render(routes)
    expect(result.hydrate).toBe('app')
    expect(result.head).not.toContain(ISLANDS_ONLY_MARKER)
    expect(result.loaderScript).toContain('__PYREON_LOADER_DATA__')
  })

  test('an unmarked page is unchanged: loader data shipped, no marker', async () => {
    const result = await render(routesWith(undefined))
    expect(result.hydrate).toBe('app')
    expect(result.head).not.toContain(ISLANDS_ONLY_MARKER)
    expect(result.loaderScript).toContain('__PYREON_LOADER_DATA__')
  })

  test('store state is still shipped: islands that share a store read it', async () => {
    const g = globalThis as {
      __PYREON_DEHYDRATE_STORES__?: () => Record<string, Record<string, unknown>>
    }
    g.__PYREON_DEHYDRATE_STORES__ = () => ({ cart: { items: 2 } })
    try {
      const result = await render(routesWith({ hydrate: 'islands' }))
      expect(result.loaderScript).toContain('window.__PYREON_STORE_STATE__=')
      expect(result.loaderScript).not.toContain('__PYREON_LOADER_DATA__')
    } finally {
      delete g.__PYREON_DEHYDRATE_STORES__
    }
  })
})

describe('createHandler — islands-only page', () => {
  for (const mode of ['string', 'stream'] as const) {
    test(`${mode} mode: marker present, no loader-data script`, async () => {
      const handler = createHandler({
        App,
        routes: routesWith({ hydrate: 'islands' }),
        mode,
        clientEntry: false,
      })
      const html = await (await handler(new Request('http://localhost/page'))).text()
      expect(html).toContain('from the loader')
      expect(html).toContain(ISLANDS_ONLY_MARKER)
      expect(html).not.toContain('__PYREON_LOADER_DATA__')
    })

    test(`${mode} mode: an unmarked page keeps its loader data and has no marker`, async () => {
      const handler = createHandler({
        App,
        routes: routesWith(undefined),
        mode,
        clientEntry: false,
      })
      const html = await (await handler(new Request('http://localhost/page'))).text()
      expect(html).toContain('__PYREON_LOADER_DATA__')
      expect(html).not.toContain(ISLANDS_ONLY_MARKER)
    })
  }
})

/**
 * `clientPreload` (#4371): a server-rendered page preloads what its client
 * loads first beyond the entry, the same set zero's SSG pages preload. With
 * zero's lazy entry an app page otherwise paid one extra round trip (the
 * entry had to run before the browser saw the app chunks).
 */
describe('createHandler — clientPreload', () => {
  const clientPreload = { app: ['/assets/app-A.js', '/assets/routes-B.js'], islands: ['/assets/islands-C.js'] }
  const Counter = island(() => Promise.resolve({ default: () => h('button', null, '0') }), {
    name: 'Counter',
  })
  const Never = island(() => Promise.resolve({ default: () => h('i', null, 'x') }), {
    name: 'Never',
    hydrate: 'never',
  })
  const pages = (component: ComponentFn, meta?: Record<string, unknown>): RouteRecord[] => [
    { path: '/page', component, loader, ...(meta ? { meta: meta as never } : {}) },
  ]
  const WithIsland: ComponentFn = () => h('main', null, 'static ', h(Counter, null))
  const WithNeverIsland: ComponentFn = () => h('main', null, 'static ', h(Never, null))
  const preloadsOf = (html: string): string[] =>
    [...html.matchAll(/<link rel="modulepreload" href="([^"]+)" crossorigin>/g)].map((m) => m[1] as string)

  async function get(routes: RouteRecord[], mode: 'string' | 'stream'): Promise<string> {
    const handler = createHandler({ App, routes, mode, clientEntry: false, clientPreload })
    return (await handler(new Request('http://localhost/page'))).text()
  }

  for (const mode of ['string', 'stream'] as const) {
    test(`${mode} mode: an app page preloads the app set, before the body`, async () => {
      const html = await get(pages(Page), mode)
      expect(preloadsOf(html)).toEqual(clientPreload.app)
      expect(html.indexOf('/assets/app-A.js')).toBeLessThan(html.indexOf('<main'))
    })

    test(`${mode} mode: an islands-only page with an island preloads only the islands runtime`, async () => {
      const html = await get(pages(WithIsland, { hydrate: 'islands' }), mode)
      expect(html).toContain('<pyreon-island')
      expect(preloadsOf(html)).toEqual(clientPreload.islands)
    })

    test(`${mode} mode: an islands-only page with nothing to hydrate preloads nothing`, async () => {
      expect(preloadsOf(await get(pages(Page, { hydrate: 'islands' }), mode))).toEqual([])
      expect(preloadsOf(await get(pages(WithNeverIsland, { hydrate: 'islands' }), mode))).toEqual([])
    })
  }

  test('no clientPreload: no preload links (byte-identical to before)', async () => {
    const handler = createHandler({ App, routes: pages(Page), clientEntry: false })
    const html = await (await handler(new Request('http://localhost/page'))).text()
    expect(preloadsOf(html)).toEqual([])
  })

  test('hasIslandToHydrate: a hydrate="never" island loads nothing, so it does not count', () => {
    expect(hasIslandToHydrate('<pyreon-island data-component="X" data-hydrate="load">')).toBe(true)
    expect(hasIslandToHydrate('<pyreon-island data-component="X" data-hydrate="never">')).toBe(false)
    expect(hasIslandToHydrate('<main></main>')).toBe(false)
  })
})
