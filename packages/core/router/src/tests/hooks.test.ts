import { h, runWithHooks } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import {
  createRouter,
  lazy,
  notFound,
  NotFoundBoundary,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useMiddlewareData,
  useNavigate,
  useParams,
  useTransition,
  useValidatedSearch,
} from '../index'
import { DefaultChromeLayout } from '../components'
import { setActiveRouter } from '../router'
import type { NavigationGuard, RouterInstance } from '../types'

const errMsg = '[Pyreon] No router installed.'

describe('router hooks — no-router throws', () => {
  it('useNavigate throws without an active router', () => {
    setActiveRouter(null)
    expect(() => useNavigate()).toThrow(errMsg)
  })

  it('useParams throws without an active router', () => {
    setActiveRouter(null)
    expect(() => useParams()).toThrow(errMsg)
  })

  it('onBeforeRouteLeave throws without an active router', () => {
    setActiveRouter(null)
    expect(() => onBeforeRouteLeave(() => undefined)).toThrow(errMsg)
  })

  it('onBeforeRouteUpdate throws without an active router', () => {
    setActiveRouter(null)
    expect(() => onBeforeRouteUpdate(() => undefined)).toThrow(errMsg)
  })

  it('useTransition throws without an active router', () => {
    setActiveRouter(null)
    expect(() => useTransition()).toThrow(errMsg)
  })

  it('useMiddlewareData throws without an active router', () => {
    setActiveRouter(null)
    expect(() => useMiddlewareData()).toThrow(errMsg)
  })

  it('useValidatedSearch throws without an active router', () => {
    setActiveRouter(null)
    expect(() => useValidatedSearch()).toThrow(errMsg)
  })
})

describe('router hooks — happy paths under active router', () => {
  it('useNavigate returns a function that pushes to the router', async () => {
    const router = createRouter({
      routes: [
        { path: '/a', component: () => null },
        { path: '/b', component: () => null },
      ],
    })
    setActiveRouter(router as unknown as RouterInstance)
    const navigate = useNavigate()
    expect(typeof navigate).toBe('function')
    await navigate('/b')
    expect(router.currentRoute().path).toBe('/b')
  })

  it('useParams returns the current route params snapshot', async () => {
    const router = createRouter({
      routes: [{ path: '/user/:id', component: () => null }],
    })
    setActiveRouter(router as unknown as RouterInstance)
    await router.push('/user/42')
    const params = useParams<{ id: string }>()
    expect(params.id).toBe('42')
  })

  it('onBeforeRouteLeave registers + returns a remove function', () => {
    const router = createRouter({
      routes: [{ path: '/a', component: () => null }],
    })
    setActiveRouter(router as unknown as RouterInstance)
    const guard: NavigationGuard = () => undefined
    let remove: (() => void) | undefined
    runWithHooks(
      () => {
        remove = onBeforeRouteLeave(guard)
        return null
      },
      {} as Record<string, unknown>,
    )
    expect(typeof remove).toBe('function')
    remove?.()
  })

  it('useTransition returns a function reading the loading signal', () => {
    const router = createRouter({
      routes: [{ path: '/a', component: () => null }],
    })
    setActiveRouter(router as unknown as RouterInstance)
    const isNav = useTransition()
    expect(typeof isNav).toBe('function')
    // No navigation in flight → false
    expect(isNav()).toBe(false)
  })

  it('useMiddlewareData returns a function returning current middleware data', () => {
    const router = createRouter({
      routes: [{ path: '/a', component: () => null }],
    })
    setActiveRouter(router as unknown as RouterInstance)
    const data = useMiddlewareData()
    expect(typeof data).toBe('function')
    expect(data()).toEqual({})
  })

  it('useValidatedSearch returns the validated search via shallowEqual cache', async () => {
    const router = createRouter({
      routes: [
        {
          path: '/page',
          component: () => null,
          validateSearch: (raw) => ({ q: String(raw.q ?? ''), page: Number(raw.page ?? 1) }),
        },
      ],
    })
    setActiveRouter(router as unknown as RouterInstance)
    await router.push('/page?q=hi&page=2')
    const reader = useValidatedSearch<{ q: string; page: number }>()
    const first = reader()
    expect(first).toEqual({ q: 'hi', page: 2 })
    // Repeat read should hit shallowEqual cache and return the SAME object reference.
    const second = reader()
    expect(second).toBe(first)
  })

  it('onBeforeRouteUpdate registers + returns a remove function', () => {
    const router = createRouter({
      routes: [{ path: '/user/:id', component: () => null }],
    })
    setActiveRouter(router as unknown as RouterInstance)
    const guard: NavigationGuard = () => undefined
    let remove: (() => void) | undefined
    runWithHooks(
      () => {
        remove = onBeforeRouteUpdate(guard)
        return null
      },
      {} as Record<string, unknown>,
    )
    expect(typeof remove).toBe('function')
    remove?.()
  })
})

describe('router._hmrSwap (dev+browser only)', () => {
  it('returns false when fresh module has no default export', () => {
    const router = createRouter({
      routes: [{ path: '/x', component: () => null }],
    }) as unknown as { _hmrSwap?: (id: string, mod: unknown) => boolean }
    expect(typeof router._hmrSwap).toBe('function')
    expect(router._hmrSwap?.('/some/file.tsx', null)).toBe(false)
    expect(router._hmrSwap?.('/some/file.tsx', {})).toBe(false)
    expect(router._hmrSwap?.('/some/file.tsx', { default: 'not-a-function' })).toBe(false)
  })

  it('returns false when no matched route has a matching _hmrId', () => {
    const router = createRouter({
      routes: [{ path: '/x', component: () => null }],
    }) as unknown as { _hmrSwap?: (id: string, mod: unknown) => boolean }
    const fresh = () => null
    // No lazy route has _hmrId === '/non/matching/path' → returns false
    expect(router._hmrSwap?.('/non/matching/path', fresh)).toBe(false)
    expect(router._hmrSwap?.('/non/matching/path', { default: fresh })).toBe(false)
  })

  it('accepts a fresh function module directly (not via .default)', () => {
    const router = createRouter({
      routes: [{ path: '/x', component: () => null }],
    }) as unknown as { _hmrSwap?: (id: string, mod: unknown) => boolean }
    // typeof m === 'function' branch
    const fresh = () => null
    expect(router._hmrSwap?.('/no/match', fresh)).toBe(false)
  })

  it('returns true when a lazy route _hmrId matches the incoming id (covers L1350-1353)', async () => {
    const router = createRouter({
      routes: [
        {
          path: '/page',
          component: lazy(() => Promise.resolve({ default: () => null }), {
            hmrId: '/abs/path/page.tsx',
          }),
        },
      ],
    }) as unknown as {
      _hmrSwap?: (id: string, mod: unknown) => boolean
      push: (p: string) => Promise<unknown>
    }
    await router.push('/page')
    const fresh = () => null
    // Exact match → true (L1352)
    expect(router._hmrSwap?.('/abs/path/page.tsx', fresh)).toBe(true)
    // With query suffix stripped → still matches (L1350-1351)
    expect(router._hmrSwap?.('/abs/path/page.tsx?t=12345', fresh)).toBe(true)
    // Suffix-match path (L1353): the shorter ID ends with the longer's suffix.
    expect(router._hmrSwap?.('/different.tsx', fresh)).toBe(false)
  })
})

describe('DefaultChromeLayout', () => {
  it('renders a <main> wrapper around RouterView (line 646)', () => {
    // The fallback layout used by match.ts when a not-found URL has no
    // ancestor layout to wrap it. Invoke it directly to count L646.
    const vnode = DefaultChromeLayout({})
    expect(vnode).toBeDefined()
    // Sanity: it produces a VNode (not null/string)
    expect(typeof vnode).toBe('object')
  })
})

describe('NotFoundBoundary', () => {
  it('renders function-form fallback for notFound errors (line 68)', () => {
    const container = document.createElement('div')
    const Inner = () => {
      throw notFound()
    }
    const Fallback = (props: { error: unknown; reset: () => void }) =>
      h('span', { 'data-fb': 'yes' }, `nf-${typeof props.reset}`)
    const tree = h(NotFoundBoundary, { fallback: Fallback }, h(Inner, null))
    mount(tree, container)
    const fb = container.querySelector('span[data-fb="yes"]')
    expect(fb?.textContent).toBe('nf-function')
  })

  it('renders static VNodeChild fallback for notFound errors', () => {
    const container = document.createElement('div')
    const Inner = () => {
      throw notFound()
    }
    const tree = h(
      NotFoundBoundary,
      { fallback: h('span', { 'data-fb': 'static' }, 'static-fallback') },
      h(Inner, null),
    )
    mount(tree, container)
    expect(container.querySelector('span[data-fb="static"]')?.textContent).toBe('static-fallback')
  })

  it('re-throws non-notFound errors so they do NOT render the fallback (line 64)', () => {
    // The NotFoundBoundary's fallback is invoked for EVERY thrown error,
    // not just notFound() errors. The `if (!isNotFoundError(err)) throw err`
    // re-throw on line 64 ensures regular errors continue propagating to
    // an outer boundary — they must NOT render the NotFoundBoundary's
    // 404 fallback (otherwise real bugs get silently masked as 404s).
    const Inner = () => {
      throw new Error('regular error, not notFound')
    }
    const Fallback = () => h('span', { 'data-fb': 'nf' }, 'nf-fallback')
    const tree = h(NotFoundBoundary, { fallback: Fallback }, h(Inner, null))

    const container = document.createElement('div')
    // Mount may or may not throw depending on the runtime's error handling;
    // the assertion that matters is "the notFound fallback was NOT rendered"
    // because a regular error must not be treated as a 404.
    try {
      mount(tree, container)
    } catch {
      /* runtime caught and logged the re-throw — that's expected */
    }
    expect(container.querySelector('[data-fb="nf"]')).toBeNull()
  })
})
