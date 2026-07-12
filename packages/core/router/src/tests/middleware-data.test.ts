import { describe, expect, it } from 'vitest'
import { createRouter, setActiveRouter, useMiddlewareData } from '../router'
import type { RouteMiddleware, RouteRecord, RouterInstance } from '../types'

const Noop = () => null

describe('useMiddlewareData after navigation', () => {
  it('exposes data accumulated by middleware for the committed route', async () => {
    const mw: RouteMiddleware = (ctx) => {
      ctx.data.user = 'admin'
    }
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/protected', component: Noop, middleware: mw },
    ]
    const router = createRouter({ routes, url: '/' })
    setActiveRouter(router as unknown as RouterInstance)
    await router.push('/protected')
    const data = useMiddlewareData()
    expect(data()).toEqual({ user: 'admin' })
    router.destroy()
    setActiveRouter(null)
  })
})

describe('useMiddlewareData reset + reactivity', () => {
  it('resets to {} when navigating to a route without middleware', async () => {
    const mw: RouteMiddleware = (ctx) => {
      ctx.data.token = 't1'
    }
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/with', component: Noop, middleware: mw },
      { path: '/without', component: Noop },
    ]
    const router = createRouter({ routes, url: '/' })
    setActiveRouter(router as unknown as RouterInstance)
    const data = useMiddlewareData()
    await router.push('/with')
    expect(data()).toEqual({ token: 't1' })
    await router.push('/without')
    expect(data()).toEqual({})
    router.destroy()
    setActiveRouter(null)
  })

  it('parent + leaf middleware accumulate into one bag', async () => {
    const parentMw: RouteMiddleware = (ctx) => {
      ctx.data.parent = true
    }
    const leafMw: RouteMiddleware = (ctx) => {
      ctx.data.leaf = true
    }
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/app',
        component: Noop,
        middleware: parentMw,
        children: [{ path: 'page', component: Noop, middleware: leafMw }],
      },
    ]
    const router = createRouter({ routes, url: '/' })
    setActiveRouter(router as unknown as RouterInstance)
    await router.push('/app/page')
    expect(useMiddlewareData()()).toEqual({ parent: true, leaf: true })
    router.destroy()
    setActiveRouter(null)
  })
})
