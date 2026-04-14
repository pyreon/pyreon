import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createRouter,
  RouterLink,
  RouterProvider,
  RouterView,
  useIsActive,
  useLoaderData,
  useSearchParams,
} from '../index'
import { setActiveRouter } from '../router'

// Real-Chromium smoke suite for @pyreon/router.
//
// Runs in hash mode so each test mutates only `location.hash`, not the
// real browser URL path — keeps tests isolated from one another and from
// the vitest harness page. The recurring risk these tests close: happy-dom's
// `history.pushState` is a stub; real browsers fire `popstate`, update the
// address bar, and integrate with View Transitions. This suite exercises
// the real wiring.

const Home = () => h('div', { id: 'home' }, 'Home Page')
const About = () => h('div', { id: 'about' }, 'About Page')
const User = (props: Record<string, unknown>) => {
  const params = props.params as Record<string, string>
  return h('div', { id: 'user' }, `User: ${params.id}`)
}

// Opt out of View Transitions so `await router.push()` is deterministic.
// With VT enabled, the signal commit runs inside an async transition
// callback that resolves AFTER push() returns — see commitNavigation
// in router.ts. View Transitions are covered by a dedicated test.
const routes = [
  { path: '/', component: Home, meta: { viewTransition: false } },
  { path: '/about', component: About, meta: { viewTransition: false } },
  { path: '/user/:id', component: User, meta: { viewTransition: false } },
]

describe('router in real browser', () => {
  beforeEach(() => {
    // Reset hash so each test starts at '/'.
    window.location.hash = ''
  })

  afterEach(() => {
    setActiveRouter(null)
    window.location.hash = ''
  })

  it('mounts the initial route and renders its component', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )

    expect(container.querySelector('#home')?.textContent).toBe('Home Page')
    unmount()
  })

  it('router.push() updates both the DOM and location.hash', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )

    await router.push('/about')
    await flush()

    expect(container.querySelector('#about')?.textContent).toBe('About Page')
    expect(container.querySelector('#home')).toBeNull()
    expect(window.location.hash).toBe('#/about')
    unmount()
  })

  it('resolves dynamic :params from the URL', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )

    await router.push('/user/42')
    await flush()
    expect(container.querySelector('#user')?.textContent).toBe('User: 42')

    await router.push('/user/99')
    await flush()
    expect(container.querySelector('#user')?.textContent).toBe('User: 99')
    unmount()
  })

  it('RouterLink click triggers navigation without a full page load', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router },
        h(
          'div',
          null,
          h(RouterLink, { to: '/about', id: 'link' }, 'Go to about'),
          h(RouterView, {}),
        ),
      ),
    )

    const link = container.querySelector<HTMLAnchorElement>('#link')
    expect(link).not.toBeNull()
    link!.click()

    // RouterLink's onClick calls router.push() which is async; give it a tick.
    await flush()

    expect(container.querySelector('#about')?.textContent).toBe('About Page')
    expect(window.location.hash).toBe('#/about')
    unmount()
  })

  it('View Transitions API is invoked in Chromium (happy-dom cannot test this)', async () => {
    const vtRoutes = [
      { path: '/', component: Home },
      { path: '/about', component: About },
    ]
    const router = createRouter({ routes: vtRoutes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    expect(container.querySelector('#home')).not.toBeNull()

    // Real Chromium exposes document.startViewTransition — this is the
    // branch the router takes when meta.viewTransition is not false.
    expect(typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition)
      .toBe('function')

    await router.push('/about')
    // Transition runs async inside the startViewTransition callback.
    // Poll briefly for the DOM swap to land.
    for (let i = 0; i < 20 && !container.querySelector('#about'); i++) {
      await new Promise<void>((r) => setTimeout(r, 25))
    }
    expect(container.querySelector('#about')?.textContent).toBe('About Page')
    unmount()
  })

  it('popstate (browser back/forward) navigates', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )

    await router.push('/about')
    await flush()
    expect(container.querySelector('#about')).not.toBeNull()

    // Simulate user pressing back: reset hash + dispatch hashchange.
    // Hash mode listens to `hashchange` — mirrors real browser behavior.
    window.location.hash = '#/'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    await flush()

    expect(container.querySelector('#home')?.textContent).toBe('Home Page')
    expect(container.querySelector('#about')).toBeNull()
    unmount()
  })

  it('useIsActive() reactively flips when the route changes', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const ActiveBadge = () => {
      const isAbout = useIsActive('/about', true)
      return h('span', { id: 'badge' }, () => (isAbout() ? 'on-about' : 'off-about'))
    }
    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router },
        h('div', null, h(ActiveBadge, {}), h(RouterView, {})),
      ),
    )
    expect(container.querySelector('#badge')?.textContent).toBe('off-about')

    await router.push('/about')
    await flush()
    expect(container.querySelector('#badge')?.textContent).toBe('on-about')

    await router.push('/')
    await flush()
    expect(container.querySelector('#badge')?.textContent).toBe('off-about')
    unmount()
  })

  it('beforeEnter guard returning false blocks navigation (DOM unchanged)', async () => {
    const guardedRoutes = [
      { path: '/', component: Home, meta: { viewTransition: false } },
      {
        path: '/protected',
        component: About,
        beforeEnter: () => false,
        meta: { viewTransition: false },
      },
    ]
    const router = createRouter({ routes: guardedRoutes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    expect(container.querySelector('#home')).not.toBeNull()

    await router.push('/protected')
    await flush()
    // Still on home — guard blocked.
    expect(container.querySelector('#home')).not.toBeNull()
    expect(container.querySelector('#about')).toBeNull()
    unmount()
  })

  it('beforeEnter guard returning a string redirects', async () => {
    const Redirected = () => h('div', { id: 'redirected' }, 'Redirected')
    const guardRedirect = [
      { path: '/', component: Home, meta: { viewTransition: false } },
      {
        path: '/old',
        component: About,
        beforeEnter: () => '/new',
        meta: { viewTransition: false },
      },
      { path: '/new', component: Redirected, meta: { viewTransition: false } },
    ]
    const router = createRouter({ routes: guardRedirect, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )

    await router.push('/old')
    await flush()
    expect(container.querySelector('#redirected')?.textContent).toBe('Redirected')
    unmount()
  })

  it('static `redirect` field on route record forwards', async () => {
    const Target = () => h('div', { id: 'tgt' }, 'Target')
    const redirRoutes = [
      { path: '/', component: Home, meta: { viewTransition: false } },
      { path: '/source', redirect: '/target', component: Home },
      { path: '/target', component: Target, meta: { viewTransition: false } },
    ]
    const router = createRouter({ routes: redirRoutes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    await router.push('/source')
    await flush()
    expect(container.querySelector('#tgt')?.textContent).toBe('Target')
    unmount()
  })

  it('route loader runs before component renders; useLoaderData reads the result', async () => {
    const seen: string[] = []
    const Profile = () => {
      const data = useLoaderData<{ user: string }>()
      seen.push(`render:${data.user}`)
      return h('div', { id: 'profile' }, () => `User: ${data.user}`)
    }
    const loaderRoutes = [
      { path: '/', component: Home, meta: { viewTransition: false } },
      {
        path: '/profile',
        component: Profile,
        loader: async () => {
          await Promise.resolve()
          seen.push('loader')
          return { user: 'Alice' }
        },
        meta: { viewTransition: false },
      },
    ]
    const router = createRouter({ routes: loaderRoutes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    await router.push('/profile')
    await flush()

    expect(container.querySelector('#profile')?.textContent).toBe('User: Alice')
    // Loader runs before render.
    expect(seen[0]).toBe('loader')
    unmount()
  })

  it('useSearchParams reads typed search-string + signal updates from push', async () => {
    const Search = () => {
      const [params] = useSearchParams()
      return h('div', { id: 'q' }, () => `q=${params().q ?? ''}`)
    }
    const searchRoutes = [
      { path: '/', component: Home, meta: { viewTransition: false } },
      { path: '/search', component: Search, meta: { viewTransition: false } },
    ]
    const router = createRouter({ routes: searchRoutes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    await router.push('/search?q=hello')
    await flush()
    expect(container.querySelector('#q')?.textContent).toBe('q=hello')

    await router.push('/search?q=world')
    await flush()
    expect(container.querySelector('#q')?.textContent).toBe('q=world')
    unmount()
  })

  it('named navigation: router.push({ name, params }) resolves to URL', async () => {
    const namedRoutes = [
      { path: '/', component: Home, meta: { viewTransition: false } },
      { path: '/user/:id', component: User, name: 'user', meta: { viewTransition: false } },
    ]
    const router = createRouter({ routes: namedRoutes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )

    await router.push({ name: 'user', params: { id: '7' } })
    await flush()
    expect(container.querySelector('#user')?.textContent).toBe('User: 7')
    expect(window.location.hash).toBe('#/user/7')
    unmount()
  })

  it('catch-all wildcard route renders for unknown paths', async () => {
    const NotFound = () => h('div', { id: 'nf' }, 'Not found')
    const wildcardRoutes = [
      { path: '/', component: Home, meta: { viewTransition: false } },
      { path: '*', component: NotFound, meta: { viewTransition: false } },
    ]
    const router = createRouter({ routes: wildcardRoutes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    await router.push('/totally/does/not/exist')
    await flush()
    expect(container.querySelector('#nf')).not.toBeNull()
    unmount()
  })

  it('RouterLink with replace=true does NOT add to history', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router },
        h(
          'div',
          null,
          h(RouterLink, { to: '/about', id: 'l1' }, 'about'),
          h(RouterLink, { to: '/', id: 'l2', replace: true }, 'home-replace'),
          h(RouterView, {}),
        ),
      ),
    )

    container.querySelector<HTMLAnchorElement>('#l1')!.click()
    await flush()
    expect(container.querySelector('#about')).not.toBeNull()

    const histLenBefore = window.history.length
    container.querySelector<HTMLAnchorElement>('#l2')!.click()
    await flush()
    expect(container.querySelector('#home')).not.toBeNull()
    // replace navigation should not increase history length.
    expect(window.history.length).toBe(histLenBefore)
    unmount()
  })

  it('rapid push() calls — only the final destination wins', async () => {
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )

    // Don't await — fire all three before any has settled.
    const p1 = router.push('/about')
    const p2 = router.push('/user/1')
    const p3 = router.push('/user/2')
    await Promise.all([p1, p2, p3])
    await flush()

    // Final destination resolves and renders.
    expect(container.querySelector('#user')?.textContent).toBe('User: 2')
    expect(container.querySelector('#about')).toBeNull()
    expect(window.location.hash).toBe('#/user/2')
    unmount()
  })
})
