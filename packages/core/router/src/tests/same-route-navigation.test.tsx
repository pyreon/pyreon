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
import { effect } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, RouterView, routerTabs, useRoute, useSearchParams } from '../index'
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

    // NEW loader data still remounts: `useLoaderData()` is a snapshot, and a
    // loader keyed on the query is how a page asks for fresh data.
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
