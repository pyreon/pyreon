import { effect } from '../effect'
import { createStore, isStore, markRaw, shallowReactive, snapshot } from '../store'

describe('snapshot()', () => {
  it('returns a plain deep copy with no store proxies at any depth', () => {
    const store = createStore({ user: { name: 'Ann', tags: ['a', 'b'] }, n: 1 })
    const copy = snapshot(store)
    expect(copy).toEqual({ user: { name: 'Ann', tags: ['a', 'b'] }, n: 1 })
    expect(isStore(copy)).toBe(false)
    expect(isStore(copy.user)).toBe(false)
    expect(isStore(copy.user.tags)).toBe(false)
    expect(Array.isArray(copy.user.tags)).toBe(true)
  })

  it('is detached: later store writes do not reach the copy, and vice versa', () => {
    const store = createStore({ user: { name: 'Ann' }, list: [1, 2] })
    const copy = snapshot(store)
    store.user.name = 'Bob'
    store.list.push(3)
    expect(copy.user.name).toBe('Ann')
    expect(copy.list).toEqual([1, 2])
    copy.user.name = 'Cy'
    expect(store.user.name).toBe('Bob')
  })

  it('tracks nothing: an effect that snapshots a store does not re-run on writes', () => {
    const store = createStore({ user: { name: 'Ann' }, list: [1] })
    let runs = 0
    const fx = effect(() => {
      runs++
      snapshot(store)
    })
    store.user.name = 'Bob'
    store.list.push(2)
    expect(runs).toBe(1)
    fx.dispose()
  })

  it('unwraps a store proxy assigned into another store', () => {
    const a = createStore({ items: [{ id: 1 }] })
    const b = createStore({ ref: null as null | { items: { id: number }[] } })
    b.ref = a
    const copy = snapshot(b)
    expect(isStore(copy.ref)).toBe(false)
    expect(isStore(copy.ref!.items[0])).toBe(false)
    // A proxy anywhere in the tree makes structuredClone throw.
    expect(() => structuredClone(b)).toThrow()
    expect(structuredClone(copy)).toEqual({ ref: { items: [{ id: 1 }] } })
  })

  it('keeps class instances, Map, Set, Date and markRaw objects by reference, unwrapped', () => {
    class Point {
      constructor(public x: number) {}
    }
    const map = new Map([['k', 1]])
    const set = new Set([1])
    const date = new Date(0)
    const raw = markRaw({ heavy: true })
    const point = new Point(1)
    const store = createStore({ map, set, date, raw, point })
    const copy = snapshot(store)
    expect(copy.map).toBe(map)
    expect(copy.set).toBe(set)
    expect(copy.date).toBe(date)
    expect(copy.raw).toBe(raw)
    // `createStore` proxies a class instance; the copy holds the raw instance.
    expect(isStore(store.point)).toBe(true)
    expect(copy.point).toBe(point)
    expect(isStore(copy.point)).toBe(false)
  })

  it('preserves shared references and cycles', () => {
    const shared = { v: 1 }
    const node: Record<string, unknown> = { a: shared, b: shared }
    node.self = node
    const copy = snapshot(createStore(node))
    expect(copy.a).toBe(copy.b)
    expect(copy.a).not.toBe(shared)
    expect(copy.self).toBe(copy)
  })

  it('copies plain values that are not stores, and passes primitives through', () => {
    const plain = { nested: { x: 1 } }
    const copy = snapshot(plain)
    expect(copy).toEqual(plain)
    expect(copy.nested).not.toBe(plain.nested)
    expect(snapshot(5)).toBe(5)
    expect(snapshot(null)).toBe(null)
    expect(snapshot('s')).toBe('s')
  })

  it('handles shallowReactive stores and null-prototype objects', () => {
    const nullProto = Object.assign(Object.create(null) as Record<string, number>, { a: 1 })
    const store = shallowReactive({ inner: { x: 1 }, nullProto })
    const copy = snapshot(store)
    expect(isStore(copy)).toBe(false)
    expect(copy.inner).toEqual({ x: 1 })
    expect(copy.inner).not.toBe(store.inner)
    expect(Object.getPrototypeOf(copy.nullProto)).toBe(null)
    expect(copy.nullProto.a).toBe(1)
  })

  it('drops an own __proto__ key instead of setting the prototype of the copy', () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}') as Record<string, unknown>
    const copy = snapshot(createStore(parsed))
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype)
    expect((copy as { polluted?: boolean }).polluted).toBeUndefined()
    expect(Object.hasOwn(copy, '__proto__')).toBe(false)
    expect(copy.ok).toBe(1)
  })
})
