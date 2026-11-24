// A navigation that resolves to the SAME matched records with the SAME params
// (only the query or the hash changed) keeps the mounted route component and
// updates the route reactively (#4814). Remounting there tore down a search box
// on every `useUrlState().set()` once url-state was wired to the router with
// `setUrlRouter(router)`: the input lost focus, local state reset, data loaded
// twice.
//
// Structure is decided by matched-record identity + params, never by the full
// URL, for every way a navigation arrives: push, replace, Back/Forward
// (popstate), a tab stack's top entry, and nested layouts.
import { h, onMount, onUnmount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RouterLink,
  RouterProvider,
  RouterView,
  routerTabs,
  useLoaderData,
  useRoute,
  useSearchParams,
} from '../index'
import { createRouter, setActiveRouter } from '../router'
import type { RouteRecord, Router } from '../types'

const settle = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Counts {
  mounts: number
  unmounts: number
}

/** A route component that counts its mounts and records the query it is shown. */
function counted(name: string, counts: Counts, seen?: string[]) {
  return (props: Record<string, unknown>) => {
    onMount(() => {
      counts.mounts++
    })
    onUnmount(() => {
      counts.unmounts++
    })
    if (seen) {
      // `props.query` must stay live across a query-only navigation now that
      // the component is no longer remounted to receive a fresh snapshot.
      effect(() => {
        seen.push(JSON.stringify(props.query))
      })
    }

    return h('p', { 'data-page': name }, name)
  }
}

let router: Router | null = null

afterEach(() => {
  router?.destroy()
  router = null
  setActiveRouter(null)
  document.body.innerHTML = ''
})

function mountRouter(r: Router): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  mount(h(RouterProvider, { router: r }, h(RouterView, null)), el)

  return el
}

describe('same matched route + params: no remount (#4814)', () => {
  it('replace() that changes only the query keeps the component and updates props.query', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    const seen: string[] = []
    window.history.replaceState(null, '', '/')
    router = createRouter({
      mode: 'history',
      routes: [{ path: '/', component: counted('home', counts, seen) }],
    })
    mountRouter(router)
    await settle()
    expect(counts.mounts).toBe(1)

    await router.replace('/?q=a')
    await settle()
    expect(window.location.search).toBe('?q=a')
    expect(router.currentRoute().query).toEqual({ q: 'a' })
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
    expect(seen.at(-1)).toBe('{"q":"a"}')

    await router.replace('/?q=ab')
    await settle()
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
    expect(seen.at(-1)).toBe('{"q":"ab"}')
  })

  it('push() that changes only the query or only the hash keeps the component', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    window.history.replaceState(null, '', '/list')
    router = createRouter({
      mode: 'history',
      routes: [{ path: '/list', component: counted('list', counts) }],
    })
    mountRouter(router)
    await settle()

    await router.push('/list?page=2')
    await router.push('/list?page=2#row-9')
    await router.push('/list?page=3')
    await settle()
    expect(router.currentRoute().query).toEqual({ page: '3' })
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
  })

  it('Back/Forward between query-only entries keeps the component', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    window.history.replaceState(null, '', '/list')
    router = createRouter({
      mode: 'history',
      routes: [{ path: '/list', component: counted('list', counts) }],
    })
    mountRouter(router)
    await settle()
    await router.push('/list?page=2')

    // What a real browser does on Back: move to the entry, then fire popstate.
    window.history.replaceState(null, '', '/list')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await settle(10)
    expect(router.currentRoute().query).toEqual({})
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
  })

  it('useSearchParams().set() (a router.replace under the hood) keeps the component', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    let setter: ((u: Record<string, string>) => Promise<void>) | undefined
    let readQ: (() => string | undefined) | undefined
    const Page = () => {
      const [get, set] = useSearchParams<{ q: string }>()
      setter = set as never
      readQ = () => get().q

      return counted('search', counts)({})
    }
    window.history.replaceState(null, '', '/search')
    router = createRouter({ mode: 'history', routes: [{ path: '/search', component: Page }] })
    mountRouter(router)
    await settle()

    await setter!({ q: 'pyreon' })
    await settle()
    expect(readQ!()).toBe('pyreon')
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
  })

  it('a PARAM change still remounts the leaf (it is a different resource)', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    window.history.replaceState(null, '', '/user/1')
    router = createRouter({
      mode: 'history',
      routes: [{ path: '/user/:id', component: counted('user', counts) }],
    })
    const el = mountRouter(router)
    await settle()

    await router.replace('/user/1?tab=posts')
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })

    await router.push('/user/2')
    await settle()
    expect(counts).toEqual({ mounts: 2, unmounts: 1 })
    expect(el.querySelector('[data-page="user"]')).not.toBeNull()
  })

  it('nested routes: a query-only change keeps the layout AND the leaf', async () => {
    const layout = { mounts: 0, unmounts: 0 }
    const leaf = { mounts: 0, unmounts: 0 }
    const Layout = () => {
      onMount(() => {
        layout.mounts++
      })

      return h('section', null, h(RouterView, null))
    }
    const routes: RouteRecord[] = [
      {
        path: '/admin',
        component: Layout,
        children: [{ path: 'users', component: counted('users', leaf) }],
      },
    ]
    window.history.replaceState(null, '', '/admin/users')
    router = createRouter({ mode: 'history', routes })
    mountRouter(router)
    await settle()

    await router.replace('/admin/users?sort=name')
    await router.push('/admin/users?sort=name#top')
    await settle()
    expect(layout.mounts).toBe(1)
    expect(leaf).toEqual({ mounts: 1, unmounts: 0 })
  })

  it('a loader route keeps its component unless the query-only navigation produced NEW loader data', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    const data = { rows: [1, 2, 3] }
    window.history.replaceState(null, '', '/')
    router = createRouter({
      mode: 'history',
      routes: [
        { path: '/', component: () => h('p', null, 'home') },
        {
          path: '/data',
          component: counted('data', counts),
          // The default loader key ignores the query, so a query-only
          // navigation serves the cached data. A loader that reads the query
          // keys on it, and only a DIFFERENT key runs it again.
          loaderKey: ({ query }) => (query.page === undefined ? 'all' : `page:${query.page}`),
          loader: async ({ query }) => (query.page === undefined ? data : { rows: [Number(query.page)] }),
        },
      ],
    })
    mountRouter(router)
    await router.push('/data') // the loader has run before the page mounts
    await settle()
    expect(counts.mounts).toBe(1)

    await router.replace('/data?q=x')
    await settle()
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })

    // A NEW loader key (a `loaderKey` that reads the query) is a different
    // resource: the page remounts.
    await router.replace('/data?q=x&page=2')
    await settle()
    expect(counts).toEqual({ mounts: 2, unmounts: 1 })
  })

  it('useRoute() inside the kept component sees the new query', async () => {
    const queries: string[] = []
    const Page = () => {
      const route = useRoute()
      effect(() => {
        queries.push(route().query.q ?? '')
      })

      return h('p', null, 'p')
    }
    window.history.replaceState(null, '', '/')
    router = createRouter({ mode: 'history', routes: [{ path: '/', component: Page }] })
    mountRouter(router)
    await settle()
    await router.replace('/?q=a')
    await router.replace('/?q=ab')
    expect(queries).toEqual(['', 'a', 'ab'])
  })
})

describe('same matched route + params inside a tab stack (#4814)', () => {
  it('a query-only push/replace on the active tab keeps its page mounted', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    const seen: string[] = []
    window.history.replaceState(null, '', '/feed')
    router = createRouter({
      mode: 'history',
      routes: [
        { path: '/feed', component: counted('feed', counts, seen) },
        { path: '/me', component: () => h('p', null, 'me') },
      ],
      tabs: routerTabs([
        { name: 'feed', root: '/feed' },
        { name: 'me', root: '/me' },
      ]),
    })
    const r = router
    const el = document.createElement('div')
    document.body.appendChild(el)
    // The app shape `<Tabs router>` produces: one tab-scoped panel per tab.
    mount(
      h(
        RouterProvider,
        { router: r },
        h('section', null, r.withTab('feed', () => h(RouterView, {}))),
        h('section', null, r.withTab('me', () => h(RouterView, {}))),
      ),
      el,
    )
    await settle()
    expect(counts.mounts).toBe(1)

    await r.replace('/feed?filter=new')
    await r.push('/feed?filter=old')
    await settle()
    expect(r.currentRoute().query).toEqual({ filter: 'old' })
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
    expect(seen.at(-1)).toBe('{"filter":"old"}')
  })
})

describe('an in-place replace (same page, only the query moved) (#4814)', () => {
  it('does not reset the scroll; a push and a page change still do', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      window.history.replaceState(null, '', '/search')
      router = createRouter({
        mode: 'history',
        routes: [
          { path: '/search', component: () => h('p', null, 's') },
          { path: '/other', component: () => h('p', null, 'o') },
        ],
      })
      mountRouter(router)
      await settle()
      scrollTo.mockClear()

      await router.replace('/search?q=a')
      await router.replace('/search?q=ab')
      await settle()
      expect(scrollTo).not.toHaveBeenCalled()

      await router.push('/search?q=abc') // a new entry: the default 'top' applies
      await settle()
      expect(scrollTo).toHaveBeenCalledTimes(1)

      await router.replace('/other') // a different page
      await settle()
      expect(scrollTo).toHaveBeenCalledTimes(2)
    } finally {
      scrollTo.mockRestore()
    }
  })

  it('does not start a view transition; a page change still does', async () => {
    const start = vi.fn((cb: () => void) => {
      cb()
      return undefined
    })
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true })
    try {
      window.history.replaceState(null, '', '/search')
      router = createRouter({
        mode: 'history',
        routes: [
          { path: '/search', component: () => h('p', null, 's') },
          { path: '/other', component: () => h('p', null, 'o') },
        ],
      })
      mountRouter(router)
      await settle()

      await router.replace('/search?q=a')
      expect(start).not.toHaveBeenCalled()

      await router.replace('/other')
      expect(start).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
    }
  })
})

describe('the page kept mounted still recovers, and never sees the next page early (#4814)', () => {
  it('a route error boundary recovers on a query-only navigation', async () => {
    const Page = (props: Record<string, unknown>) => {
      if ((props.query as Record<string, string>).q === 'bad') throw new Error('bad q')

      return h('p', null, 'PAGE')
    }
    window.history.replaceState(null, '', '/search?q=bad')
    router = createRouter({
      mode: 'history',
      routes: [{ path: '/search', component: Page, errorComponent: () => h('p', null, 'ERR') }],
    })
    const el = mountRouter(router)
    await settle()
    expect(el.textContent).toBe('ERR')

    await router.replace('/search?q=good')
    await settle()
    expect(el.textContent).toBe('PAGE')
  })

  it("the error page's query prop is live", async () => {
    const Page = () => {
      throw new Error('always')
    }
    const Err = (props: Record<string, unknown>) =>
      h('p', null, () => `ERR ${(props.query as Record<string, string>).q}`)
    window.history.replaceState(null, '', '/s?q=one')
    router = createRouter({ mode: 'history', routes: [{ path: '/s', component: Page, errorComponent: Err }] })
    const el = mountRouter(router)
    await settle()
    expect(el.textContent).toBe('ERR one')
    await router.replace('/s?q=two')
    await settle()
    expect(el.textContent).toBe('ERR two')
  })

  it('the leaf being replaced on a param change never sees the new params', async () => {
    const seen: string[] = []
    let n = 0
    const Page = (props: Record<string, unknown>) => {
      const me = ++n
      effect(() => {
        seen.push(`inst${me}:${(props.params as Record<string, string>).id}`)
      })

      return h('p', null, 'u')
    }
    window.history.replaceState(null, '', '/user/1')
    router = createRouter({ mode: 'history', routes: [{ path: '/user/:id', component: Page }] })
    mountRouter(router)
    await settle()
    await router.push('/user/2')
    await settle()
    expect(seen).not.toContain('inst1:2')
    expect(seen.at(-1)).toBe('inst2:2')
  })
})

describe('loader data under the same loader key is delivered in place (#4814)', () => {
  function loaderPage(counts: Counts, read: 'none' | 'accessor', shown: unknown[]) {
    return () => {
      onMount(() => {
        counts.mounts++
      })
      if (read === 'accessor') {
        const data = useLoaderData<{ n: number }>()
        effect(() => {
          shown.push(data().n)
        })
      }

      return h('input', null)
    }
  }

  it.each([
    ['gcTime: 0', { gcTime: 0 }],
    ['staleWhileRevalidate', { staleWhileRevalidate: true }],
  ] as const)('a %s loader re-run by a query-only replace keeps the page; the accessor follows', async (_n, extra) => {
    const counts = { mounts: 0, unmounts: 0 }
    const shown: unknown[] = []
    let runs = 0
    window.history.replaceState(null, '', '/')
    router = createRouter({
      mode: 'history',
      routes: [
        { path: '/', component: () => h('p', null, 'home') },
        {
          path: '/d',
          component: loaderPage(counts, 'accessor', shown),
          loader: async () => ({ n: ++runs }),
          ...extra,
        },
      ],
    })
    const el = mountRouter(router)
    await router.push('/d')
    await settle(5)
    const input = el.querySelector('input')
    await router.replace('/d?q=a')
    await settle(5)
    await router.replace('/d?q=ab')
    await settle(5)
    expect(runs).toBe(3)
    expect(counts.mounts).toBe(1)
    expect(el.querySelector('input')).toBe(input)
    expect(shown.at(-1)).toBe(3)
  })

  it('a server loader refetched by a query-only replace keeps the page', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    const shown: unknown[] = []
    let fetches = 0
    vi.stubGlobal('fetch', async () => {
      fetches++
      return new Response(JSON.stringify({ data: { '0': { n: fetches } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    try {
      window.history.replaceState(null, '', '/')
      router = createRouter({
        mode: 'history',
        routes: [
          { path: '/', component: () => h('p', null, 'home') },
          { path: '/d', component: loaderPage(counts, 'accessor', shown), hasServerLoader: true },
        ],
      })
      mountRouter(router)
      await router.push('/d')
      await settle(5)
      await router.replace('/d?q=a')
      await settle(5)
      await router.replace('/d?q=ab')
      await settle(5)
      expect(fetches).toBe(3)
      expect(counts.mounts).toBe(1)
      expect(shown.at(-1)).toBe(3)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a page that reads no loader data is never remounted for it', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    let runs = 0
    window.history.replaceState(null, '', '/')
    router = createRouter({
      mode: 'history',
      routes: [
        { path: '/', component: () => h('p', null, 'home') },
        { path: '/d', component: loaderPage(counts, 'none', []), gcTime: 0, loader: async () => ({ n: ++runs }) },
      ],
    })
    mountRouter(router)
    await router.push('/d')
    await router.replace('/d?q=a')
    await settle(5)
    expect(counts.mounts).toBe(1)
  })
})

describe('per-navigation scroll / viewTransition options (#4814)', () => {
  it('push(path, { scroll: false, viewTransition: false }) neither scrolls nor animates', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const start = vi.fn((cb: () => void) => {
      cb()
      return undefined
    })
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true })
    try {
      window.history.replaceState(null, '', '/list')
      router = createRouter({ mode: 'history', routes: [{ path: '/list', component: () => h('p', null, 'l') }] })
      mountRouter(router)
      await settle()
      scrollTo.mockClear()
      await router.push('/list?page=2', { scroll: false, viewTransition: false })
      await settle()
      expect(scrollTo).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()

      // An explicit `true` wins over the in-place default of a replace.
      await router.replace('/list?page=3', { scroll: true, viewTransition: true })
      await settle()
      expect(scrollTo).toHaveBeenCalledTimes(1)
      expect(start).toHaveBeenCalledTimes(1)
    } finally {
      scrollTo.mockRestore()
      Reflect.deleteProperty(document, 'startViewTransition')
    }
  })

  it('a useSearchParams() write does not scroll, even when the hash differs', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    let setter: ((u: Record<string, string>) => Promise<unknown>) | undefined
    try {
      window.history.replaceState(null, '', '/s')
      router = createRouter({
        mode: 'history',
        routes: [
          {
            path: '/s',
            component: () => {
              setter = useSearchParams()[1] as never

              return h('p', null, 's')
            },
          },
        ],
      })
      mountRouter(router)
      await settle()
      scrollTo.mockClear()
      await setter!({ q: 'x' })
      await settle()
      expect(scrollTo).not.toHaveBeenCalled()
    } finally {
      scrollTo.mockRestore()
    }
  })

  it('a named-route push takes the options too', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      window.history.replaceState(null, '', '/')
      router = createRouter({
        mode: 'history',
        routes: [
          { path: '/', component: () => h('p', null, 'h') },
          { path: '/item/:id', name: 'item', component: () => h('p', null, 'i') },
        ],
      })
      mountRouter(router)
      await settle()
      scrollTo.mockClear()
      await router.push({ name: 'item', params: { id: '1' } }, { scroll: false })
      await settle()
      expect(router.currentRoute().path).toBe('/item/1')
      expect(scrollTo).not.toHaveBeenCalled()
    } finally {
      scrollTo.mockRestore()
    }
  })
})

describe('round-2 review: the loader accessor (#4814)', () => {
  it('the page being replaced on a param change never sees the next page\'s data', async () => {
    const seen: string[] = []
    let n = 0
    const Page = (props: Record<string, unknown>) => {
      const me = ++n
      const data = useLoaderData<{ id: string }>()
      effect(() => {
        seen.push(`inst${me}:params=${(props.params as Record<string, string>).id}:data=${data()?.id}`)
      })

      return h('p', null, 'u')
    }
    window.history.replaceState(null, '', '/')
    router = createRouter({
      mode: 'history',
      routes: [
        { path: '/', component: () => h('p', null, 'h') },
        { path: '/user/:id', component: Page, loader: async ({ params }) => ({ id: params.id }) },
      ],
    })
    mountRouter(router)
    await router.push('/user/1')
    await settle(5)
    await router.push('/user/2')
    await settle(5)
    // It may re-run while it unmounts, but only ever with its own page's values.
    expect(new Set(seen.filter((e) => e.startsWith('inst1:')))).toEqual(new Set(['inst1:params=1:data=1']))
    expect(seen.at(-1)).toBe('inst2:params=2:data=2')
  })

  it('a consumer re-runs once per data change, not once per navigation tick', async () => {
    let runs = 0
    let version = 0
    const Page = () => {
      const data = useLoaderData<{ v: number }>()
      effect(() => {
        data()
        runs++
      })

      return h('p', null, 'p')
    }
    window.history.replaceState(null, '', '/')
    router = createRouter({
      mode: 'history',
      routes: [
        { path: '/', component: () => h('p', null, 'h') },
        // Same data object unless `revalidate()` bumps it.
        { path: '/d', component: Page, loader: async () => ({ v: version }) },
      ],
    })
    mountRouter(router)
    await router.push('/d')
    await settle(5)
    expect(runs).toBe(1)
    // Cached data (same object): no re-run however many ticks the navigation makes.
    await router.replace('/d?q=a')
    await router.replace('/d?q=ab')
    await settle(5)
    expect(runs).toBe(1)
    // New data: exactly one re-run.
    version++
    await router.revalidate()
    await settle(5)
    expect(runs).toBe(2)
  })

  it('new data under the same key reaches a component mounted later in the page, never remounting it', async () => {
    let mounts = 0
    let runs = 0
    const show = signal(false)
    const Child = () => {
      const data = useLoaderData<{ n: number }>()

      return h('b', { id: 'c' }, () => `c${data().n}`)
    }
    const Page = () => {
      onMount(() => {
        mounts++
      })

      return h('div', null, () => (show() ? h(Child, null) : null))
    }
    window.history.replaceState(null, '', '/')
    router = createRouter({
      mode: 'history',
      routes: [
        { path: '/', component: () => h('p', null, 'h') },
        { path: '/a', component: Page, gcTime: 0, loader: async () => ({ n: ++runs }) },
      ],
    })
    const el = mountRouter(router)
    await router.push('/a')
    await settle(5)
    await router.replace('/a?q=1')
    await settle(5)
    show.set(true)
    await settle(5)
    expect(el.querySelector('#c')?.textContent).toBe('c2')
    await router.replace('/a?q=2')
    await settle(10)
    expect(el.querySelector('#c')?.textContent).toBe('c3')
    expect(mounts).toBe(1)
  })

  it("an error page's reset() recovers in place; a later query-only navigation does not remount", async () => {
    let mounts = 0
    let bad = true
    let reset: (() => void) | undefined
    const Page = () => {
      if (bad) throw new Error('x')
      onMount(() => {
        mounts++
      })

      return h('input', null)
    }
    const Err = (props: Record<string, unknown>) => {
      reset = props.reset as () => void

      return h('p', null, 'ERR')
    }
    window.history.replaceState(null, '', '/s')
    router = createRouter({ mode: 'history', routes: [{ path: '/s', component: Page, errorComponent: Err }] })
    const el = mountRouter(router)
    await settle()
    expect(el.textContent).toBe('ERR')
    bad = false
    reset!()
    await settle()
    expect(mounts).toBe(1)
    const input = el.querySelector('input')
    await router.replace('/s?q=1')
    await settle()
    expect(mounts).toBe(1)
    expect(el.querySelector('input')).toBe(input)
  })

  it('RouterLink forwards scroll / viewTransition and keeps them off the anchor', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      window.history.replaceState(null, '', '/list')
      router = createRouter({
        mode: 'history',
        routes: [
          {
            path: '/list',
            component: () =>
              h(RouterLink, { to: '/list?page=2', scroll: false, viewTransition: false, id: 'next' }, 'next'),
          },
        ],
      })
      const el = mountRouter(router)
      await settle()
      scrollTo.mockClear()
      const a = el.querySelector<HTMLAnchorElement>('#next')!
      expect(a.hasAttribute('scroll')).toBe(false)
      expect(a.hasAttribute('viewTransition') || a.hasAttribute('viewtransition')).toBe(false)
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
      await settle(5)
      expect(router.currentRoute().query).toEqual({ page: '2' })
      expect(scrollTo).not.toHaveBeenCalled()
    } finally {
      scrollTo.mockRestore()
    }
  })
})

describe('the page on screen never sees data loaded for the next route (#4814)', () => {
  it('a loading tick inside a deferred View Transition does not hand the next page\'s data to the current one', async () => {
    const seen: string[] = []
    let n = 0
    const Page = () => {
      const me = ++n
      const data = useLoaderData<{ p: string }>()
      effect(() => {
        seen.push(`inst${me}:${data()?.p}`)
      })

      return h('p', null, 'p')
    }
    // The commit runs 30 ms after the loaders wrote the next page's data.
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (cb: () => void) => {
        const done = new Promise<void>((r) =>
          setTimeout(() => {
            cb()
            r()
          }, 30),
        )

        return { updateCallbackDone: done, finished: done, ready: done }
      },
    })
    try {
      window.history.replaceState(null, '', '/')
      router = createRouter({
        mode: 'history',
        routes: [
          { path: '/', component: () => h('p', null, 'h') },
          { path: '/p/:id', component: Page, loader: async ({ params }) => ({ p: params.id }) },
          { path: '/x', component: () => h('p', null, 'x'), loader: () => new Promise((r) => setTimeout(() => r({}), 100)) },
        ],
      })
      mountRouter(router)
      await router.push('/p/1')
      await settle(40)
      const toP2 = router.push('/p/2')
      await settle(15)
      expect(router.currentRoute().path).toBe('/p/1') // still inside the transition window
      void router.push('/x') // a second navigation ticks the loading counter
      await settle(1)
      await toP2
      await settle(150)
      expect(seen.filter((e) => e.startsWith('inst1:'))).toEqual(['inst1:1'])
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
    }
  })
})
