import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRouter, RouterLink, RouterProvider, RouterView } from '../index'
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
})
