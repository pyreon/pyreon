// Per-tab back stacks — `createRouter({ tabs })` (#4060).
//
// The router keeps one stack per tab and one ACTIVE tab; the URL is the active
// tab's top entry. These specs pin the model (push/replace/selectTab/deep
// link), the history stamps that let Back/Forward restore a tab AND its stack
// through the full navigation pipeline, and the rendering contract: a
// tab-scoped `<RouterView>` shows ITS tab's page, so a hidden tab keeps its
// own page mounted while another tab navigates.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, RouterView, useParams, useRoute } from '../index'
import { createRouter, setActiveRouter } from '../router'
import type { RouteRecord, Router, RouterTab } from '../types'

const flush = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

const page = (name: string) => () => h('p', { 'data-page': name }, name)

const routes: RouteRecord[] = [
  { path: '/', component: page('home') },
  { path: '/feed', component: page('feed') },
  { path: '/feed/post/:id', component: page('post') },
  { path: '/me', component: page('me') },
  { path: '/me/settings', component: page('settings') },
  { path: '/users/:id', component: page('user') },
]
const tabs: RouterTab[] = [
  { name: 'feed', root: '/feed' },
  { name: 'me', root: '/me' },
]

let router: Router | null = null
function make(url = '/feed', extra: Partial<Parameters<typeof createRouter>[0] & object> = {}): Router {
  window.history.replaceState(null, '', url)
  router = createRouter({ routes, tabs, mode: 'history', ...extra })
  return router
}

afterEach(() => {
  router?.destroy()
  router = null
  setActiveRouter(null)
  document.body.innerHTML = ''
})

/** What a real browser does on Back/Forward: move to the entry, then fire popstate. */
function traverseTo(state: unknown, url: string): void {
  window.history.replaceState(state, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

describe('tab stacks — model', () => {
  it('starts on the tab whose root prefixes the URL, with every other tab at its root', () => {
    const r = make('/feed')
    expect(r.activeTab()).toBe('feed')
    expect(r.tabStack('feed')).toEqual(['/feed'])
    expect(r.tabStack('me')).toEqual(['/me'])
  })

  it('push acts on the ACTIVE tab and the URL is its top entry', async () => {
    const r = make('/feed')
    await r.push('/feed/post/1')
    await r.push('/users/7') // under no tab root → the active tab
    expect(r.activeTab()).toBe('feed')
    expect(r.tabStack('feed')).toEqual(['/feed', '/feed/post/1', '/users/7'])
    expect(r.tabStack('me')).toEqual(['/me'])
    expect(window.location.pathname).toBe('/users/7')
  })

  it('switching tabs keeps every stack and shows the selected tab top entry', async () => {
    const r = make('/feed')
    await r.push('/feed/post/1')
    await r.selectTab('me')
    await r.push('/me/settings')
    expect(r.currentRoute().path).toBe('/me/settings')

    await r.selectTab('feed')
    expect(r.activeTab()).toBe('feed')
    expect(r.currentRoute().path).toBe('/feed/post/1')
    expect(r.tabStack('feed')).toEqual(['/feed', '/feed/post/1'])
    expect(r.tabStack('me')).toEqual(['/me', '/me/settings'])
  })

  it('re-selecting the active tab pops it to its root', async () => {
    const r = make('/feed')
    await r.push('/feed/post/1')
    await r.push('/feed/post/2')
    expect(await r.selectTab('feed')).toBe('committed')
    expect(r.tabStack('feed')).toEqual(['/feed'])
    expect(r.currentRoute().path).toBe('/feed')
    // Already at the root: a second re-select is a no-op.
    expect(await r.selectTab('feed')).toBe('committed')
    expect(r.tabStack('feed')).toEqual(['/feed'])
  })

  it('a path under ANOTHER tab root selects that tab and pushes onto it', async () => {
    const r = make('/feed')
    await r.push('/me/settings')
    expect(r.activeTab()).toBe('me')
    expect(r.tabStack('me')).toEqual(['/me', '/me/settings'])
    expect(r.tabStack('feed')).toEqual(['/feed'])
  })

  it('navigating to a tab root selects it and pops it to the root', async () => {
    const r = make('/feed')
    await r.push('/me/settings')
    await r.selectTab('feed')
    await r.push('/me')
    expect(r.activeTab()).toBe('me')
    expect(r.tabStack('me')).toEqual(['/me'])
  })

  it('replace swaps the active top but never the root entry', async () => {
    const r = make('/feed')
    await r.replace('/feed/post/1') // root-only stack → pushes
    expect(r.tabStack('feed')).toEqual(['/feed', '/feed/post/1'])
    await r.replace('/feed/post/2')
    expect(r.tabStack('feed')).toEqual(['/feed', '/feed/post/2'])
  })

  it('a deep link selects the tab and pushes the path onto its root', () => {
    const r = make('/me/settings')
    expect(r.activeTab()).toBe('me')
    expect(r.tabStack('me')).toEqual(['/me', '/me/settings'])
  })

  it('a URL under no tab root lands on the first tab', () => {
    const r = make('/users/3')
    expect(r.activeTab()).toBe('feed')
    expect(r.tabStack('feed')).toEqual(['/feed', '/users/3'])
  })

  it('a cancelled navigation leaves every stack alone', async () => {
    const r = make('/feed')
    r.beforeEach((to) => to.path !== '/me/settings')
    expect(await r.push('/me/settings')).toBe('cancelled')
    expect(r.activeTab()).toBe('feed')
    expect(r.tabStack('me')).toEqual(['/me'])
  })

  it('selectTab runs the guards too (it changes the route)', async () => {
    const r = make('/feed')
    r.beforeEach((to) => to.path !== '/me')
    expect(await r.selectTab('me')).toBe('cancelled')
    expect(r.activeTab()).toBe('feed')
  })

  it('selectTab of an unknown tab, and on a router without tabs, is cancelled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = make('/feed')
    expect(await r.selectTab('nope')).toBe('cancelled')
    r.destroy()
    window.history.replaceState(null, '', '/')
    router = createRouter({ routes, mode: 'history' })
    expect(router.activeTab()).toBeUndefined()
    expect(router.tabStack('feed')).toEqual([])
    expect(await router.selectTab('feed')).toBe('cancelled')
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe('tab stacks — browser history', () => {
  it('stamps every entry with its tab and that tab stack', async () => {
    const r = make('/feed')
    expect(window.history.state).toMatchObject({ __pyreonTab: 'feed', __pyreonTabStack: ['/feed'] })
    await r.push('/feed/post/1')
    expect(window.history.state).toMatchObject({
      __pyreonTab: 'feed',
      __pyreonTabStack: ['/feed', '/feed/post/1'],
    })
    await r.selectTab('me')
    expect(window.history.state).toMatchObject({ __pyreonTab: 'me', __pyreonTabStack: ['/me'] })
  })

  it('Back to an entry in another tab restores that tab AND its stack', async () => {
    const r = make('/feed')
    await r.push('/feed/post/1')
    const feedEntry = window.history.state
    await r.selectTab('me')
    await r.push('/me/settings')
    // Simulate the stack moving on in feed after the entry (e.g. a later
    // re-select): Back must restore the stack the ENTRY recorded.
    expect(r.tabStack('feed')).toEqual(['/feed', '/feed/post/1'])

    traverseTo(feedEntry, '/feed/post/1')
    await flush(20)
    expect(r.activeTab()).toBe('feed')
    expect(r.currentRoute().path).toBe('/feed/post/1')
    expect(r.tabStack('feed')).toEqual(['/feed', '/feed/post/1'])
    // The other tab keeps the stack it had.
    expect(r.tabStack('me')).toEqual(['/me', '/me/settings'])
  })

  it('Back restores a shorter stack recorded in an earlier entry of the same tab', async () => {
    const r = make('/feed')
    const rootEntry = window.history.state
    await r.push('/feed/post/1')
    await r.push('/feed/post/2')
    traverseTo(rootEntry, '/feed')
    await flush(20)
    expect(r.tabStack('feed')).toEqual(['/feed'])
  })

  it('a traversal between two tabs at the SAME path is not swallowed as an echo', async () => {
    const r = make('/feed')
    await r.push('/users/1') // feed: [/feed, /users/1]
    const feedEntry = window.history.state
    await r.selectTab('me')
    await r.push('/users/1') // me: [/me, /users/1] — same URL
    expect(r.activeTab()).toBe('me')
    traverseTo(feedEntry, '/users/1')
    await flush(20)
    expect(r.activeTab()).toBe('feed')
  })

  it('a traversal runs the full pipeline: a guard can refuse it', async () => {
    const r = make('/feed')
    await r.push('/feed/post/1')
    const feedEntry = window.history.state
    await r.selectTab('me')
    r.beforeEach((to) => to.path !== '/feed/post/1')
    traverseTo(feedEntry, '/feed/post/1')
    await flush(20)
    expect(r.activeTab()).toBe('me')
    expect(r.tabStack('feed')).toEqual(['/feed', '/feed/post/1'])
  })

  it('a reload restores the stack stamped on the current entry', async () => {
    const r = make('/feed')
    await r.push('/feed/post/1')
    await r.push('/feed/post/2')
    r.destroy()
    router = createRouter({ routes, tabs, mode: 'history' })
    expect(router.activeTab()).toBe('feed')
    expect(router.tabStack('feed')).toEqual(['/feed', '/feed/post/1', '/feed/post/2'])
  })
})

describe('tab stacks — rendering', () => {
  /** The app shape `<Tabs router>` produces: one tab-scoped panel per tab. */
  function mountTabs(r: Router): HTMLElement {
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(
      h(
        RouterProvider,
        { router: r },
        h('section', { id: 'feed' }, r.withTab('feed', () => h(RouterView, {}))),
        h('section', { id: 'me' }, r.withTab('me', () => h(RouterView, {}))),
      ),
      el,
    )
    return el
  }
  const shown = (el: HTMLElement, id: string): string =>
    el.querySelector(`#${id} [data-page]`)?.getAttribute('data-page') ?? '(none)'

  it('each tab view shows ITS tab top entry, not the URL', async () => {
    const r = make('/feed')
    const el = mountTabs(r)
    expect(shown(el, 'feed')).toBe('feed')
    expect(shown(el, 'me')).toBe('me')
    await r.push('/feed/post/1')
    await flush()
    expect(shown(el, 'feed')).toBe('post')
    expect(shown(el, 'me')).toBe('me')
  })

  it('a hidden tab keeps its page MOUNTED while another tab navigates', async () => {
    const r = make('/feed')
    const el = mountTabs(r)
    await r.push('/feed/post/1')
    await flush()
    const postNode = el.querySelector('#feed [data-page]')
    await r.selectTab('me')
    await r.push('/me/settings')
    await flush()
    // Same DOM node: the feed page was never rebuilt by the other tab moving.
    expect(el.querySelector('#feed [data-page]')).toBe(postNode)
    expect(shown(el, 'me')).toBe('settings')
    await r.selectTab('feed')
    await flush()
    expect(el.querySelector('#feed [data-page]')).toBe(postNode)
  })

  it('useParams / useRoute inside a tab read that tab route', async () => {
    const r = make('/feed/post/42')
    const seen: { id?: string; path?: () => string } = {}
    const Post = () => {
      seen.id = useParams<{ id: string }>().id
      const route = useRoute()
      seen.path = () => route().path
      return null
    }
    ;(routes[2] as RouteRecord).component = Post
    try {
      mountTabs(r)
      expect(seen.id).toBe('42')
      await r.selectTab('me')
      await r.push('/me/settings')
      // The ACTIVE tab moved; the post page still reads its own route.
      expect(seen.path!()).toBe('/feed/post/42')
    } finally {
      ;(routes[2] as RouteRecord).component = page('post')
    }
  })

  it('a hidden tab keeps its loader data (no remount with undefined data)', async () => {
    const loaded = { title: 'post-1' }
    const loaderRoutes: RouteRecord[] = [
      ...routes.filter((x) => x.path !== '/feed/post/:id'),
      { path: '/feed/post/:id', component: page('post'), loader: async () => loaded },
    ]
    window.history.replaceState(null, '', '/feed')
    router = createRouter({ routes: loaderRoutes, tabs, mode: 'history' })
    const r = router
    const el = mountTabs(r)
    await r.push('/feed/post/1')
    await flush()
    const node = el.querySelector('#feed [data-page]')
    await r.selectTab('me')
    await r.push('/me/settings')
    await flush()
    expect(el.querySelector('#feed [data-page]')).toBe(node)
    const rec = loaderRoutes[loaderRoutes.length - 1]!
    expect((r as unknown as { _loaderData: Map<RouteRecord, unknown> })._loaderData.get(rec)).toBe(loaded)
  })
})
