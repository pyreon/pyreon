import { Fragment, h } from '../h'
import { Suspense } from '../suspense'
import type { ComponentFn, VNodeChild } from '../types'

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
