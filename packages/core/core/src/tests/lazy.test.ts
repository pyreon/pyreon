import { h } from '../h'
import { lazy } from '../lazy'
import type { ComponentFn, Props, VNode, VNodeChild } from '../types'

// The wrapper renders REACTIVELY: its output is an accessor re-read when the
// chunk lands (a component body runs once). Read it the way the renderer does.
const render = <P extends object>(C: (p: P) => VNodeChild, props: P): VNodeChild =>
  (C(props) as () => VNodeChild)()

describe('lazy', () => {
  test('returns a LazyComponent with __loading flag', () => {
    const Comp = lazy<Props>(() => new Promise(() => {})) // never resolves
    expect(typeof Comp).toBe('function')
    expect(typeof Comp.__loading).toBe('function')
    expect(Comp.__loading()).toBe(true)
  })

  test('__loading returns true while loading', () => {
    const Comp = lazy<Props>(() => new Promise(() => {}))
    expect(Comp.__loading()).toBe(true)
  })

  test('renders nothing while loading (component not yet available)', () => {
    const Comp = lazy<Props>(() => new Promise(() => {}))
    const out = Comp({})
    // An accessor, not `null`: a lazy mounted while loading must render the
    // component once the chunk lands, and a component body runs only once.
    expect(typeof out).toBe('function')
    expect((out as () => VNodeChild)()).toBeNull()
  })

  test('the accessor renders the component once the chunk lands (a lazy mounted while loading)', async () => {
    const Inner: ComponentFn = () => h('i', null, 'in')
    let resolve!: (m: { default: ComponentFn }) => void
    const Comp = lazy(() => new Promise<{ default: ComponentFn }>((r) => (resolve = r)))
    const out = Comp({}) as () => VNodeChild
    expect(out()).toBeNull()
    resolve({ default: Inner })
    await new Promise((r) => setTimeout(r, 0))
    expect((out() as VNode).type).toBe(Inner)
  })

  test('a failure AFTER mount renders a child whose setup throws (so an ErrorBoundary catches it)', async () => {
    let reject!: (e: unknown) => void
    const Comp = lazy<Props>(() => new Promise((_r, rj) => (reject = rj)))
    const out = Comp({}) as () => VNodeChild
    reject(new Error('late'))
    await new Promise((r) => setTimeout(r, 0))
    const child = out() as VNode
    expect(() => (child.type as ComponentFn)(child.props)).toThrow('late')
  })

  test('resolves to the loaded component', async () => {
    const Inner: ComponentFn<{ name: string }> = (props) => h('span', null, props.name)
    const Comp = lazy(() => Promise.resolve({ default: Inner }))

    await new Promise((r) => setTimeout(r, 0))

    expect(Comp.__loading()).toBe(false)
    const result = render(Comp, { name: 'test' })
    expect(result).not.toBeNull()
    expect((result as VNode).type).toBe(Inner)
    expect((result as VNode).props).toEqual({ name: 'test' })
  })

  test('throws on import error', async () => {
    const Comp = lazy<Props>(() => Promise.reject(new Error('load failed')))

    await new Promise((r) => setTimeout(r, 0))

    expect(Comp.__loading()).toBe(false)
    expect(() => Comp({})).toThrow('load failed')
  })

  test('wraps non-Error rejection in Error', async () => {
    const Comp = lazy<Props>(() => Promise.reject('string-error'))

    await new Promise((r) => setTimeout(r, 0))

    expect(() => Comp({})).toThrow('string-error')
  })

  test('wraps numeric rejection in Error', async () => {
    const Comp = lazy<Props>(() => Promise.reject(404))

    await new Promise((r) => setTimeout(r, 0))

    expect(() => Comp({})).toThrow('404')
  })

  test('__loading is false after successful load', async () => {
    const Inner: ComponentFn = () => null
    const Comp = lazy(() => Promise.resolve({ default: Inner }))

    expect(Comp.__loading()).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(Comp.__loading()).toBe(false)
  })

  test('__loading is false after failed load', async () => {
    const Comp = lazy<Props>(() => Promise.reject(new Error('fail')))

    expect(Comp.__loading()).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(Comp.__loading()).toBe(false)
  })

  test('multiple calls after load return consistent results', async () => {
    const Inner: ComponentFn = () => h('div', null, 'content')
    const Comp = lazy(() => Promise.resolve({ default: Inner }))

    await new Promise((r) => setTimeout(r, 0))

    const result1 = render(Comp, {})
    const result2 = render(Comp, {})
    expect((result1 as VNode).type).toBe(Inner)
    expect((result2 as VNode).type).toBe(Inner)
  })

  test('passes props through to loaded component via h()', async () => {
    const Inner: ComponentFn<{ count: number }> = (props) => h('span', null, String(props.count))
    const Comp = lazy(() => Promise.resolve({ default: Inner }))

    await new Promise((r) => setTimeout(r, 0))

    const result = render(Comp, { count: 42 })
    expect((result as VNode).props).toEqual({ count: 42 })
  })

  test('__load exposes the settle promise — used by SSR wait-for and hydration deferral', async () => {
    const Inner: ComponentFn = () => h('i', null, 'in')
    const Comp = lazy(() => Promise.resolve({ default: Inner }))
    expect(typeof Comp.__load).toBe('function')
    // Never rejects — it resolves once the chunk has loaded OR FAILED (the
    // failure itself surfaces later, from the wrapper throwing on render).
    await expect(Comp.__load!()).resolves.toBeUndefined()
  })

  test('__load resolves even when the chunk failed to load', async () => {
    const Comp = lazy<Props>(() => Promise.reject(new Error('network error')))
    await expect(Comp.__load!()).resolves.toBeUndefined()
    // The failure is surfaced by the wrapper throwing on render, not by __load.
    expect(() => Comp({})).toThrow('network error')
  })
})
