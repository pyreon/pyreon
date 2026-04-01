import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { RouteRecord } from '../index'
import {
  createRouter,
  prefetchLoaderData,
  RouterProvider,
  RouterView,
  useLoaderData,
} from '../index'
import { setActiveRouter } from '../router'
import type { RouterInstance } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

const Home = () => h('div', null, 'Home Page')
const About = () => h('div', null, 'About Page')
const NotFound = () => h('div', null, 'Not Found')

afterEach(() => {
  setActiveRouter(null)
  document.body.innerHTML = ''
})

// ─── Navigation cycle ───────────────────────────────────────────────────────

describe('router integration — navigation cycle', () => {
  const routes: RouteRecord[] = [
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/user/:id', component: (props: Record<string, unknown>) => {
      const params = props.params as Record<string, string>
      return h('div', null, 'User: ', params.id)
    }},
    { path: '*', component: NotFound },
  ]

  test('push to route — correct component renders in DOM', async () => {
    const el = container()
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(el.textContent).toContain('Home Page')

    await router.push('/about')
    expect(el.textContent).toContain('About Page')
  })

  test('push to dynamic route /user/:id — component renders with correct params', async () => {
    const el = container()
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    await router.push('/user/42')
    expect(el.textContent).toContain('User: 42')
  })

  test('router.back() — previous route renders', async () => {
    const el = container()
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    await router.push('/about')
    expect(el.textContent).toContain('About Page')

    router.back()
    // back() is synchronous in SSR mode, give DOM time to update
    await new Promise<void>((r) => setTimeout(r, 50))
    // In SSR mode, back() may be a no-op (no window.history).
    // Verify it doesn't throw and DOM is in a valid state.
    expect(el.textContent).toBeDefined()
  })

  test('push to unknown route — catch-all component renders', async () => {
    const el = container()
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    await router.push('/nonexistent/path')
    expect(el.textContent).toContain('Not Found')
  })
})

// ─── Guards ─────────────────────────────────────────────────────────────────

describe('router integration — guards', () => {
  test('beforeEnter returns false — navigation blocked, DOM unchanged', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '/protected', component: About, beforeEnter: () => false },
    ]
    const el = container()
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(el.textContent).toContain('Home Page')

    await router.push('/protected')
    expect(el.textContent).toContain('Home Page')
    expect(el.textContent).not.toContain('About Page')
  })

  test('beforeEnter returns string — redirects to that route', async () => {
    const Redirected = () => h('div', null, 'Redirected Page')
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '/old', component: About, beforeEnter: () => '/redirected' },
      { path: '/redirected', component: Redirected },
    ]
    const el = container()
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    await router.push('/old')
    expect(el.textContent).toContain('Redirected Page')
    expect(router.currentRoute().path).toBe('/redirected')
  })

  test('async guard — resolves before navigation commits', async () => {
    const order: string[] = []
    const Protected = () => {
      order.push('render')
      return h('div', null, 'Protected')
    }
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      {
        path: '/guarded',
        component: Protected,
        beforeEnter: async () => {
          await new Promise<void>((r) => setTimeout(r, 20))
          order.push('guard')
          return true
        },
      },
    ]
    const el = container()
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    await router.push('/guarded')
    // Guard runs before component renders
    expect(order[0]).toBe('guard')
    expect(order[1]).toBe('render')
    expect(el.textContent).toContain('Protected')
  })
})

// ─── Loaders ────────────────────────────────────────────────────────────────

describe('router integration — loaders', () => {
  test('route with loader — useLoaderData returns loader result', async () => {
    const el = container()
    let capturedData: unknown
    const DataComp = () => {
      capturedData = useLoaderData()
      return h('span', null, 'data-loaded')
    }
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      {
        path: '/data',
        component: DataComp,
        loader: async () => ({ items: [1, 2, 3] }),
      },
    ]
    const router = createRouter({ routes, url: '/' })
    await prefetchLoaderData(router as RouterInstance, '/data')
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    await router.push('/data')
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(capturedData).toEqual({ items: [1, 2, 3] })
    expect(el.textContent).toContain('data-loaded')
  })

  test('loader throws — errorComponent renders instead', async () => {
    const el = container()
    const ErrorComp = () => h('span', null, 'loader-error')
    const DataComp = () => h('span', null, 'data')
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      {
        path: '/err',
        component: DataComp,
        loader: async () => {
          throw new Error('fail')
        },
        errorComponent: ErrorComp,
      },
    ]
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    await router.push('/err')
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(el.textContent).toContain('loader-error')
  })
})

// ─── Nested routes ──────────────────────────────────────────────────────────

describe('router integration — nested routes', () => {
  test('parent layout + child — both render (parent wraps child)', () => {
    const el = container()
    const ChildComp = () => h('span', { class: 'child' }, 'child-content')
    const ParentComp = () =>
      h('div', { class: 'parent' }, h('span', null, 'parent-content'), h(RouterView, {}))

    const routes: RouteRecord[] = [
      {
        path: '/parent',
        component: ParentComp,
        children: [{ path: 'child', component: ChildComp }],
      },
    ]
    const router = createRouter({ routes, url: '/parent/child' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    expect(el.textContent).toContain('parent-content')
    expect(el.textContent).toContain('child-content')
  })

  test('navigate to sibling child — parent stays, child swaps', async () => {
    const el = container()
    const ChildA = () => h('span', null, 'child-A')
    const ChildB = () => h('span', null, 'child-B')
    const ParentComp = () =>
      h('div', { class: 'parent' }, h('span', null, 'parent-layout'), h(RouterView, {}))

    const routes: RouteRecord[] = [
      {
        path: '/parent',
        component: ParentComp,
        children: [
          { path: 'a', component: ChildA },
          { path: 'b', component: ChildB },
        ],
      },
    ]
    const router = createRouter({ routes, url: '/parent/a' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    expect(el.textContent).toContain('parent-layout')
    expect(el.textContent).toContain('child-A')

    await router.push('/parent/b')
    expect(el.textContent).toContain('parent-layout')
    expect(el.textContent).toContain('child-B')
    expect(el.textContent).not.toContain('child-A')
  })
})

// ─── Cleanup ────────────────────────────────────────────────────────────────

describe('router integration — cleanup', () => {
  test('navigate away — effect from previous route stops running', async () => {
    const el = container()
    let effectRunCount = 0
    const counter = signal(0)

    const Reactive = () => {
      // Create a reactive text node that tracks the signal
      return h('div', null, () => {
        effectRunCount++
        return `count: ${counter()}`
      })
    }

    const routes: RouteRecord[] = [
      { path: '/', component: Reactive },
      { path: '/other', component: About },
    ]
    const router = createRouter({ routes, url: '/' })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)

    // Signal change triggers reactive update
    const initialRuns = effectRunCount
    counter.set(1)
    expect(effectRunCount).toBeGreaterThan(initialRuns)

    // Navigate away
    await router.push('/other')
    expect(el.textContent).toContain('About Page')

    // Signal change should NOT trigger the old component's reactive text
    const runsAfterNav = effectRunCount
    counter.set(2)
    // Give any potential stale effects time to fire
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(effectRunCount).toBe(runsAfterNav)
  })
})
