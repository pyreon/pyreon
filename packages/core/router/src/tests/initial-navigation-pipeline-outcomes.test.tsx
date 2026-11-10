import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { RouterProvider, RouterView } from '../index'
import { createRouter } from '../router'
import type { RouteMiddleware, RouteRecord, RouterInstance } from '../types'

// Every outcome of the INITIAL navigation's gating pipeline on the client —
// route middleware (cancel / redirect / throw / continue with data), guard
// arrays, a guard throw, a newer navigation superseding a pending guard, and a
// redirect whose own target is refused. `initial-navigation-guards.test.tsx`
// covers the guard happy paths; these are the arms it does not reach.

const Home = () => h('p', { id: 'home' }, 'home')
const Admin = () => h('p', { id: 'admin' }, 'secret')
const Login = () => h('p', { id: 'login' }, 'login')

const internals = (r: unknown) => r as RouterInstance
const tick = () => new Promise((r) => setTimeout(r, 0))

function render(router: unknown) {
  const el = document.createElement('div')
  mount(h(RouterProvider, { router: router as never }, h(RouterView, {})), el)
  return el
}

function withMiddleware(mw: RouteMiddleware, extra: Partial<RouteRecord> = {}): RouteRecord[] {
  return [
    { path: '/', component: Home },
    { path: '/login', component: Login },
    { path: '/admin', component: Admin, middleware: mw, ...extra },
  ]
}

describe('initial navigation — route middleware outcomes (client)', () => {
  it('middleware returning false cancels the deep link: the page never renders', async () => {
    const router = createRouter({ routes: withMiddleware(() => false), url: '/admin' })
    const el = render(router)
    await router.isReady()
    await tick()
    expect(internals(router)._initialGate()).toBe(true)
    expect(el.querySelector('#admin')).toBeNull()
  })

  it('middleware returning a path redirects the deep link', async () => {
    const router = createRouter({ routes: withMiddleware(() => '/login'), url: '/admin', mode: 'history' })
    const el = render(router)
    await router.isReady()
    await tick()
    expect(router.currentRoute().path).toBe('/login')
    expect(el.querySelector('#login')).not.toBeNull()
    expect(el.querySelector('#admin')).toBeNull()
  })

  it('middleware that THROWS on the client cancels and warns, naming the stage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const router = createRouter({
        routes: withMiddleware(() => {
          throw new Error('boom')
        }),
        url: '/admin',
      })
      const el = render(router)
      await router.isReady()
      await tick()
      expect(internals(router)._initialGate()).toBe(true)
      expect(el.querySelector('#admin')).toBeNull()
      expect(warn.mock.calls.some((c) => String(c[0]).includes('Route middleware threw on the initial navigation'))).toBe(
        true,
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('middleware that continues commits its data and the page renders', async () => {
    const router = createRouter({
      routes: withMiddleware((ctx) => {
        ctx.data.user = 'ada'
      }),
      url: '/admin',
    })
    const el = render(router)
    await router.isReady()
    await tick()
    expect(internals(router)._initialGate()).toBe(false)
    expect(internals(router)._committedMiddlewareData).toEqual({ user: 'ada' })
    expect(el.querySelector('#admin')).not.toBeNull()
  })
})

describe('initial navigation — guard outcomes (client)', () => {
  it('runs every guard of a beforeEnter ARRAY, in order', async () => {
    const order: string[] = []
    const router = createRouter({
      url: '/admin',
      routes: withMiddleware(() => undefined, {
        beforeEnter: [
          () => {
            order.push('a')
            return true
          },
          () => {
            order.push('b')
            return true
          },
        ],
      }),
    })
    await router.isReady()
    expect(order).toEqual(['a', 'b'])
    expect(internals(router)._initialGate()).toBe(false)
  })

  it('a guard that THROWS on the client cancels and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const router = createRouter({
        url: '/admin',
        routes: withMiddleware(() => undefined, {
          beforeEnter: () => {
            throw new Error('no window here')
          },
        }),
      })
      const el = render(router)
      await router.isReady()
      await tick()
      expect(internals(router)._initialGate()).toBe(true)
      expect(el.querySelector('#admin')).toBeNull()
      expect(warn.mock.calls.some((c) => String(c[0]).includes('Navigation guard threw on the initial navigation'))).toBe(
        true,
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('a navigation started while the initial guard is pending supersedes it', async () => {
    let approve!: (v: boolean) => void
    const pending = new Promise<boolean>((r) => {
      approve = r
    })
    const router = createRouter({
      url: '/admin',
      routes: withMiddleware(() => undefined, { beforeEnter: () => pending }),
    })
    const el = render(router)
    await tick()
    await router.push('/login')
    approve(true)
    await router.isReady()
    await tick()
    // The late approval of /admin must not resurrect the stale initial route.
    expect(router.currentRoute().path).toBe('/login')
    expect(el.querySelector('#login')).not.toBeNull()
    expect(el.querySelector('#admin')).toBeNull()
  })

  it('a redirect whose target is itself refused leaves nothing approved', async () => {
    const router = createRouter({
      url: '/admin',
      mode: 'history',
      routes: [
        { path: '/', component: Home },
        { path: '/login', component: Login, beforeEnter: () => false },
        { path: '/admin', component: Admin, beforeEnter: () => '/login' },
      ],
    })
    const el = render(router)
    await router.isReady()
    await tick()
    expect(internals(router)._initialGate()).toBe(true)
    expect(el.querySelector('#admin')).toBeNull()
    expect(el.querySelector('#login')).toBeNull()
  })
})
