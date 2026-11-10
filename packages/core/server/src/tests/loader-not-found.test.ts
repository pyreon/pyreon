import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { notFound, type RouteRecord, RouterView, useLoaderData } from '@pyreon/router'
import { createHandler } from '../handler'

// "Matched route, missing resource": `/items/:id` matches, but its loader
// throws `notFound()` for an unknown id. That must answer 404 with the
// not-found page inside the layout — never the 500 a generic loader error
// produces — in string AND stream mode, and the loader-data blob must carry
// the not-found marker so the hydrating client resolves the same chain.

const ITEMS: Record<string, string> = { '1': 'First item' }

const Item: ComponentFn = () => {
  const data = useLoaderData<{ name: string } | undefined>()
  return h('h1', { 'data-testid': 'item' }, data?.name ?? '')
}
const NotFound: ComponentFn = () => h('h1', { 'data-testid': 'not-found' }, 'Page Not Found')
const Layout: ComponentFn = () =>
  h('div', { 'data-testid': 'layout' }, h('nav', null, 'NAV'), h(RouterView, {}))

const itemLoader = ({ params }: { params: Record<string, string> }) => {
  const name = ITEMS[params.id as string]
  if (!name) notFound()
  return { name }
}

function routesWith(key: 'loader' | 'serverLoader', withNotFound = true): RouteRecord[] {
  return [
    {
      path: '/',
      component: Layout,
      loader: async () => ({ user: 'ada' }),
      ...(withNotFound ? { notFoundComponent: NotFound } : {}),
      children: [{ path: '/items/:id', component: Item, [key]: itemLoader }],
    },
  ] as RouteRecord[]
}

describe.each(['string', 'stream'] as const)('createHandler (%s) — loader notFound()', (mode) => {
  for (const key of ['loader', 'serverLoader'] as const) {
    test(`${key} throwing notFound() → 404 with the not-found page inside the layout`, async () => {
      const handler = createHandler({ App: RouterView, routes: routesWith(key), mode })
      const res = await handler(new Request('http://localhost/items/9999'))
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toContain('data-testid="layout"')
      expect(html).toContain('data-testid="not-found"')
      expect(html).not.toContain('data-testid="item"')
      // The hydration marker + the layout's own loader data still ship.
      expect(html).toContain('"__pyreonNotFound":true')
      expect(html).toContain('"user":"ada"')
    })
  }

  test('a found item still renders 200 with no not-found marker', async () => {
    const handler = createHandler({ App: RouterView, routes: routesWith('loader'), mode })
    const res = await handler(new Request('http://localhost/items/1'))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('First item')
    expect(html).not.toContain('__pyreonNotFound')
  })

  test('no notFoundComponent anywhere → still 404, no page content', async () => {
    const handler = createHandler({ App: RouterView, routes: routesWith('loader', false), mode })
    const res = await handler(new Request('http://localhost/items/9999'))
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).not.toContain('data-testid="item"')
  })

  test('a non-notFound loader error still answers 500', async () => {
    const routes = [
      {
        path: '/boom',
        component: Item,
        loader: () => {
          throw new Error('db down')
        },
      },
    ] as RouteRecord[]
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const handler = createHandler({ App: RouterView, routes, mode })
      const res = await handler(new Request('http://localhost/boom'))
      expect(res.status).toBe(500)
    } finally {
      errSpy.mockRestore()
    }
  })
})
