/**
 * `_copyProp` and the prop helpers built on it take an ASSIGNMENT fast path
 * for plain data descriptors instead of `Object.defineProperty`. These specs
 * are a differential against the old defineProperty-only implementation: for
 * every descriptor shape the result's own descriptors must be identical, and
 * a `__proto__` own key must stay an own key (never a prototype write).
 */
import { _copyProp, mergeProps, removeUndefinedProps, splitProps } from '../props'

const getter = () => 1
const setter = (_v: unknown) => {}

/** One source object carrying every descriptor shape that can reach a copy. */
function makeSource(): Record<PropertyKey, unknown> {
  const o: Record<PropertyKey, unknown> = {}
  Object.defineProperty(o, 'plain', { value: 1, writable: true, enumerable: true, configurable: true })
  Object.defineProperty(o, 'readonly', { value: 2, writable: false, enumerable: true, configurable: true })
  Object.defineProperty(o, 'hidden', { value: 3, writable: true, enumerable: false, configurable: true })
  Object.defineProperty(o, 'locked', { value: 4, writable: true, enumerable: true, configurable: false })
  Object.defineProperty(o, 'getter', { get: getter, enumerable: true, configurable: true })
  Object.defineProperty(o, 'accessor', { get: getter, set: setter, enumerable: true, configurable: false })
  Object.defineProperty(o, 'setterOnly', { set: setter, enumerable: true, configurable: true })
  Object.defineProperty(o, '__proto__', { value: { polluted: true }, writable: true, enumerable: true, configurable: true })
  Object.defineProperty(o, Symbol.for('brand'), { value: 5, writable: true, enumerable: true, configurable: true })
  return o
}

/** The pre-fast-path behaviour: always defineProperty with configurable forced. */
function oldCopy(target: object, key: PropertyKey, desc: PropertyDescriptor): void {
  Object.defineProperty(target, key, { ...desc, configurable: true })
}

describe('_copyProp', () => {
  it('produces the same descriptor as defineProperty for every shape', () => {
    const src = makeSource()
    const a = {}
    const b = {}
    for (const key of Reflect.ownKeys(src)) {
      const d = Object.getOwnPropertyDescriptor(src, key)!
      _copyProp(a, key, d)
      oldCopy(b, key, d)
    }
    expect(Object.getOwnPropertyDescriptors(a)).toEqual(Object.getOwnPropertyDescriptors(b))
    expect(Reflect.ownKeys(a)).toEqual(Reflect.ownKeys(b))
  })

  it('keeps a __proto__ own key as an own data property, never the prototype', () => {
    const target = {}
    _copyProp(target, '__proto__', { value: { polluted: true }, writable: true, enumerable: true, configurable: true })
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype)
    expect(Object.hasOwn(target, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('prop helpers built on the fast path', () => {
  it('splitProps copies every descriptor shape exactly', () => {
    const src = makeSource()
    const [picked, rest] = splitProps(src, ['plain', 'getter'] as never)
    const expectedPicked = {}
    const expectedRest = {}
    for (const key of Reflect.ownKeys(src)) {
      const d = Object.getOwnPropertyDescriptor(src, key)!
      oldCopy(key === 'plain' || key === 'getter' ? expectedPicked : expectedRest, key, d)
    }
    expect(Object.getOwnPropertyDescriptors(picked)).toEqual(Object.getOwnPropertyDescriptors(expectedPicked))
    expect(Object.getOwnPropertyDescriptors(rest)).toEqual(Object.getOwnPropertyDescriptors(expectedRest))
    expect(Object.getPrototypeOf(rest)).toBe(Object.prototype)
  })

  it('mergeProps: later static value wins over an earlier one, getters stay live', () => {
    let n = 0
    const a = { x: 1, y: 'a' }
    const b: Record<string, unknown> = { x: 2, z: undefined }
    Object.defineProperty(b, 'live', { get: () => ++n, enumerable: true })
    const m = mergeProps(a, b as never) as Record<string, unknown>
    expect(m.x).toBe(2)
    expect(m.y).toBe('a')
    expect(Object.getOwnPropertyDescriptor(m, 'x')).toEqual({ value: 2, writable: true, enumerable: true, configurable: true })
    expect(typeof Object.getOwnPropertyDescriptor(m, 'live')!.get).toBe('function')
    expect(m.live).toBe(1)
    expect(m.live).toBe(2)
  })

  it('removeUndefinedProps copies verbatim, preserving non-configurable flags', () => {
    const src = makeSource()
    const out = removeUndefinedProps(src as never) as object
    const expected = {}
    // Same key set the helper uses: every own STRING key, non-enumerable included.
    for (const key of Object.getOwnPropertyNames(src)) {
      const d = Object.getOwnPropertyDescriptor(src, key)!
      if (d.get || d.value !== undefined) Object.defineProperty(expected, key, d)
    }
    expect(Object.getOwnPropertyDescriptors(out)).toEqual(Object.getOwnPropertyDescriptors(expected))
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })
})
