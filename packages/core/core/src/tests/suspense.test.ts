import { effectScope, runWithContextOwner } from '@pyreon/reactivity'
import { useContext } from '../context'
import { Fragment, h } from '../h'
import { _setSuspenseHydrating, Suspense, type SuspenseBoundary, SuspenseBoundaryContext } from '../suspense'
import type { ComponentFn, VNodeChild } from '../types'

/**
 * `Suspense({...})` provides `SuspenseBoundaryContext` onto the ACTIVE owner
 * (client model) or the SSR stack (no owner). Running it inside a real owner
 * scope — the shape `@pyreon/runtime-dom`'s `mountComponent` actually uses —
 * lets `useContext` right after retrieve the SAME boundary object `Suspense`
 * just created, so tests can exercise `SuspenseBoundary` directly instead of
 * only its effect on the returned Fragment's child accessor.
 */
function renderWithBoundary(props: {
  fallback: VNodeChild
  children?: VNodeChild
}): { node: ReturnType<typeof Suspense>; boundary: SuspenseBoundary } {
  const scope = effectScope()
  return runWithContextOwner(scope, () => {
    const node = Suspense(props)
    const boundary = useContext(SuspenseBoundaryContext)
    if (boundary === null) throw new Error('Suspense did not provide a boundary')
    return { node, boundary }
  })
}

describe('Suspense', () => {
  test('returns a Fragment VNode', () => {
    const node = Suspense({
      fallback: h('div', null, 'loading'),
      children: h('div', null, 'content'),
    })
    expect(node.type).toBe(Fragment)
  })

  test('Fragment contains a single reactive getter child', () => {
    const node = Suspense({
      fallback: h('span', null, 'loading'),
      children: h('div', null, 'content'),
    })
    expect(node.children).toHaveLength(1)
    expect(typeof node.children[0]).toBe('function')
  })

  test('renders children when not loading (plain VNode)', () => {
    const child = h('div', null, 'loaded')
    const node = Suspense({
      fallback: h('span', null, 'loading'),
      children: child,
    })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test('renders children when child type has no __loading', () => {
    const regularComp: ComponentFn = () => h('div', null)
    const child = h(regularComp, null)
    const node = Suspense({
      fallback: 'loading',
      children: child,
    })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test('renders fallback when child __loading() is true', () => {
    const fallback = h('span', null, 'loading...')
    const lazyFn = (() => h('div', null)) as unknown as ComponentFn & {
      __loading: () => boolean
    }
    lazyFn.__loading = () => true
    const child = h(lazyFn, null)

    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(fallback)
  })

  test('renders children when __loading() is false', () => {
    const fallback = h('span', null, 'loading...')
    const lazyFn = (() => h('div', null)) as unknown as ComponentFn & {
      __loading: () => boolean
    }
    lazyFn.__loading = () => false
    const child = h(lazyFn, null)

    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test('handles function children (reactive getter)', () => {
    const child = h('div', null, 'content')
    const node = Suspense({
      fallback: h('span', null, 'loading'),
      children: () => child,
    })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test('evaluates function fallback', () => {
    const fbNode = h('div', null, 'fb')
    const lazyFn = (() => h('div', null)) as unknown as ComponentFn & {
      __loading: () => boolean
    }
    lazyFn.__loading = () => true
    const child = h(lazyFn, null)

    const node = Suspense({ fallback: () => fbNode, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(fbNode)
  })

  test('handles null/undefined children', () => {
    const node = Suspense({ fallback: 'loading' })
    const getter = node.children[0] as () => VNodeChild
    // undefined children — not a VNode, not loading
    expect(getter()).toBeUndefined()
  })

  test('handles string children', () => {
    const node = Suspense({ fallback: 'loading', children: 'text content' })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe('text content')
  })

  test('handles array children (not loading)', () => {
    const children = [h('a', null), h('b', null)]
    const node = Suspense({
      fallback: 'loading',
      children: children as unknown as VNodeChild,
    })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(children)
  })

  test('warns when fallback prop is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    Suspense({ fallback: undefined as unknown as VNodeChild, children: 'x' })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('<Suspense>'))
    warnSpy.mockRestore()
  })

  test('transition from loading to loaded', () => {
    let isLoading = true
    const lazyFn = (() => h('div', null)) as unknown as ComponentFn & {
      __loading: () => boolean
    }
    lazyFn.__loading = () => isLoading
    const child = h(lazyFn, null)
    const fallback = h('span', null, 'loading')

    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild

    expect(getter()).toBe(fallback)
    isLoading = false
    expect(getter()).toBe(child)
  })
})

describe('SuspenseBoundary (registration + hydration awareness)', () => {
  afterEach(() => {
    // Module-level state — restore it so later tests in this file (and this
    // file's own re-runs) start from the real default.
    _setSuspenseHydrating(false)
  })

  test('_setSuspenseHydrating saves and restores the previous value', () => {
    expect(_setSuspenseHydrating(true)).toBe(false)
    expect(_setSuspenseHydrating(true)).toBe(true)
    expect(_setSuspenseHydrating(false)).toBe(true)
    expect(_setSuspenseHydrating(false)).toBe(false)
  })

  test('register() is a no-op on the server — @pyreon/core runs in Node, so isServer is true', () => {
    const { boundary } = renderWithBoundary({ fallback: 'loading' })
    expect(boundary.pending()).toBe(0)
    // The server already waited for every lazy before rendering it, so a
    // registration here must never increment `pending()` — there is nothing
    // for a boundary to show a fallback for.
    boundary.register(new Promise(() => {}))
    expect(boundary.pending()).toBe(0)
  })

  test('register() is a no-op while hydrating, even off the server', () => {
    const { boundary } = renderWithBoundary({ fallback: 'loading' })
    _setSuspenseHydrating(true)
    boundary.register(new Promise(() => {}))
    expect(boundary.pending()).toBe(0)
  })

  test('fallback() resolves a plain VNode fallback', () => {
    const fb = h('span', null, 'loading...')
    const { boundary } = renderWithBoundary({ fallback: fb })
    expect(boundary.fallback()).toBe(fb)
  })

  test('fallback() calls a function fallback', () => {
    const fb = h('div', null, 'spinner')
    const { boundary } = renderWithBoundary({ fallback: () => fb })
    expect(boundary.fallback()).toBe(fb)
  })

  test('hydrating: the child renders even though it reports __loading (its own hydration keeps the range)', () => {
    const fallback = h('span', null, 'loading...')
    const lazyFn = (() => h('div', null)) as unknown as ComponentFn & {
      __loading: () => boolean
      __load: () => Promise<void>
    }
    lazyFn.__loading = () => true
    lazyFn.__load = () => Promise.resolve()
    const child = h(lazyFn, null)

    _setSuspenseHydrating(true)
    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild
    // Without hydration awareness this would show the fallback (see 'renders
    // fallback when child __loading() is true' above) — but hydrating over
    // server content must keep the CHILD, never swap to the fallback, or it
    // discards the nodes hydration is about to adopt.
    expect(getter()).toBe(child)
  })

  test('NOT hydrating: the same loading lazy still shows the fallback', () => {
    const fallback = h('span', null, 'loading...')
    const lazyFn = (() => h('div', null)) as unknown as ComponentFn & {
      __loading: () => boolean
      __load: () => Promise<void>
    }
    lazyFn.__loading = () => true
    lazyFn.__load = () => Promise.resolve()
    const child = h(lazyFn, null)

    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(fallback)
  })

  test('hydrating but the child is not a lazy (no __load): falls through to the __loading check', () => {
    const fallback = h('span', null, 'loading...')
    const lazyFn = (() => h('div', null)) as unknown as ComponentFn & {
      __loading: () => boolean
    }
    lazyFn.__loading = () => true
    const child = h(lazyFn, null)

    _setSuspenseHydrating(true)
    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(fallback)
  })
})
