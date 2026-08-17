import { describe, expect, it } from 'vitest'
import { elementRef } from '../ref'

describe('elementRef — one value, both shapes', () => {
  it('reads null before anything is attached', () => {
    expect(elementRef()()).toBeNull()
    expect(elementRef().current).toBeNull()
  })

  it('acts as a ref CALLBACK: set on mount, cleared on unmount', () => {
    // Exactly how the runtime drives it — `ref(el)` then `ref(null)`.
    const el = elementRef<HTMLDivElement>()
    const node = { tagName: 'DIV' } as HTMLDivElement
    el(node)
    expect(el()).toBe(node)
    expect(el.current).toBe(node)
    el(null)
    expect(el()).toBeNull()
  })

  it('acts as the `() => T | null` accessor the hooks take', () => {
    const el = elementRef<HTMLDivElement>()
    const node = {} as HTMLDivElement
    el(node)
    // The shape every element-consuming hook declares.
    const consume = (getEl: () => HTMLDivElement | null) => getEl()
    expect(consume(el)).toBe(node)
  })

  it('null is a legal SET, not a read — that is what unmount passes', () => {
    // The discriminator is `undefined`, not arity: an arrow function has no
    // `arguments`, and treating null as a read would make unmount a no-op and
    // leak the detached node.
    const el = elementRef<HTMLDivElement>()
    el({} as HTMLDivElement)
    el(null)
    expect(el.current).toBeNull()
  })

  it('one ref serves MANY hooks — the composition win', () => {
    const el = elementRef<HTMLDivElement>()
    const node = {} as HTMLDivElement
    el(node)
    const a = (g: () => HTMLDivElement | null) => g()
    const b = (g: () => HTMLDivElement | null) => g()
    expect([a(el), b(el)]).toEqual([node, node])
  })

  it('drops into code written against createRef', () => {
    const el = elementRef<HTMLDivElement>()
    const node = {} as HTMLDivElement
    el(node)
    const readsCurrent = (r: { current: HTMLDivElement | null }) => r.current
    expect(readsCurrent(el)).toBe(node)
  })
})
