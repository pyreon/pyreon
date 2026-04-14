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

// View Transitions stay enabled (the Chromium default). `commitNavigation`
// now awaits `vt.updateCallbackDone` so `await router.push()` resolves
// AFTER the DOM swap — no more per-route opt-outs to keep tests
// deterministic.
const routes = [
  { path: '/', component: Home },
  { path: '/about', component: About },
  { path: '/user/:id', component: User },
]

describe('router in real browser', () => {
  // Track unhandled promise rejections across each test so regressions
  // of the "Transition was skipped AbortError leaks as unhandled
  // rejection" bug fail loudly instead of silently polluting the run.
  const unhandledRejections: unknown[] = []
  const onUnhandledRejection = (e: PromiseRejectionEvent) => {
    unhandledRejections.push(e.reason)
    // Let vitest's own handler still see the event (so other unrelated
    // regressions still surface).
  }

  beforeEach(() => {
    // Reset hash so each test starts at '/'.
    window.location.hash = ''
    unhandledRejections.length = 0
    window.addEventListener('unhandledrejection', onUnhandledRejection)
  })

  afterEach(() => {
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
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

  it('View Transitions API — `await router.push()` resolves AFTER the DOM swap', async () => {
    // Regression for the bug fixed alongside this PR:
    //   commitNavigation() was sync, so when the browser ran `doCommit`
    //   inside `startViewTransition(cb)`, `await router.push()` resolved
    //   BEFORE `cb` fired. Browser tests had to opt out of View
    //   Transitions per-route to stay deterministic.
    //
    // After the fix, commitNavigation awaits `vt.updateCallbackDone`;
    // `await router.push()` resolves once the DOM state is live (but
    // before the animation finishes, which would block 200-300ms).
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    expect(container.querySelector('#home')).not.toBeNull()

    // Sanity: Chromium exposes the API this test exercises.
    expect(
      typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition,
    ).toBe('function')

    await router.push('/about')
    // No polling — immediately after the await, the DOM MUST reflect
    // the new route. If this ever regresses, the rest of the suite
    // will fail too.
    expect(container.querySelector('#about')?.textContent).toBe('About Page')
    expect(container.querySelector('#home')).toBeNull()
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
      { path: '/', component: Home },
      {
        path: '/protected',
        component: About,
        beforeEnter: () => false,

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
      { path: '/', component: Home },
      {
        path: '/old',
        component: About,
        beforeEnter: () => '/new',

      },
      { path: '/new', component: Redirected },
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
      { path: '/', component: Home },
      { path: '/source', redirect: '/target', component: Home },
      { path: '/target', component: Target },
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
      { path: '/', component: Home },
      {
        path: '/profile',
        component: Profile,
        loader: async () => {
          await Promise.resolve()
          seen.push('loader')
          return { user: 'Alice' }
        },

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
      { path: '/', component: Home },
      { path: '/search', component: Search },
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
      { path: '/', component: Home },
      { path: '/user/:id', component: User, name: 'user' },
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
      { path: '/', component: Home },
      { path: '*', component: NotFound },
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

  it('rapid push() calls — only the final destination wins, no unhandled rejections', async () => {
    // Each push() starts a new ViewTransition. The older in-flight
    // transition(s) get skipped, which makes their `.ready` and
    // `.finished` promises reject with `AbortError: Transition was
    // skipped`. The router installs `.catch(() => {})` on both so the
    // rejections don't escape. This test asserts both contracts:
    //   1. Final destination resolves correctly.
    //   2. `window.onunhandledrejection` fires zero times.
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

    // Give the microtask queue a chance to surface any leaked rejection.
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(unhandledRejections).toEqual([])
    unmount()
  })

  it('await router.replace() resolves after DOM swap (same VT contract as push)', async () => {
    // `push` and `replace` both go through `navigate()` which awaits
    // `commitNavigation()`. This test locks in that the DOM-after-await
    // contract holds for replace() too — so a future refactor that
    // splits their code paths can't silently regress one without the
    // other.
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(RouterProvider, { router }, h(RouterView, {})),
    )
    expect(container.querySelector('#home')).not.toBeNull()

    await router.replace('/about')
    // Immediate — no polling, no flush(). If the VT await chain skips
    // replace(), this assertion fails.
    expect(container.querySelector('#about')?.textContent).toBe('About Page')
    expect(container.querySelector('#home')).toBeNull()
    unmount()
  })
})
