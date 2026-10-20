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
  Object.defineProperty(o, 'plain', {
    value: 1,
    writable: true,
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(o, 'readonly', {
    value: 2,
    writable: false,
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(o, 'hidden', {
    value: 3,
    writable: true,
    enumerable: false,
    configurable: true,
  })
  Object.defineProperty(o, 'locked', {
    value: 4,
    writable: true,
    enumerable: true,
    configurable: false,
  })
  Object.defineProperty(o, 'getter', { get: getter, enumerable: true, configurable: true })
  Object.defineProperty(o, 'accessor', {
    get: getter,
    set: setter,
    enumerable: true,
    configurable: false,
  })
  Object.defineProperty(o, 'setterOnly', { set: setter, enumerable: true, configurable: true })
  Object.defineProperty(o, '__proto__', {
    value: { polluted: true },
    writable: true,
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(o, Symbol.for('brand'), {
    value: 5,
    writable: true,
    enumerable: true,
    configurable: true,
  })
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
    _copyProp(target, '__proto__', {
      value: { polluted: true },
      writable: true,
      enumerable: true,
      configurable: true,
    })
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
    expect(Object.getOwnPropertyDescriptors(picked)).toEqual(
      Object.getOwnPropertyDescriptors(expectedPicked),
    )
    expect(Object.getOwnPropertyDescriptors(rest)).toEqual(
      Object.getOwnPropertyDescriptors(expectedRest),
    )
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
    expect(Object.getOwnPropertyDescriptor(m, 'x')).toEqual({
      value: 2,
      writable: true,
      enumerable: true,
      configurable: true,
    })
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
    expect(Object.getOwnPropertyDescriptors(out)).toEqual(
      Object.getOwnPropertyDescriptors(expected),
    )
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })
})

describe('_mergePropsOmit ≡ omit(mergeProps(...), keys)', () => {
  // Reference `omit` with @pyreon/ui-core's semantics: own STRING keys
  // (non-enumerable included), descriptors copied verbatim.
  function refOmit(obj: object, keys: Set<string>): object {
    const out = {}
    for (const k of Object.getOwnPropertyNames(obj)) {
      if (!keys.has(k)) Object.defineProperty(out, k, Object.getOwnPropertyDescriptor(obj, k)!)
    }
    return out
  }

  it('matches for every descriptor shape, overlapping keys and symbols', async () => {
    const { _mergePropsOmit } = await import('../props')
    let n = 0
    const a: Record<PropertyKey, unknown> = { shared: 'a', onlyA: 1, pseudo: {}, drop1: 'x' }
    const b = makeSource()
    Object.defineProperty(b, 'shared', { get: () => ++n, enumerable: true, configurable: true })
    Object.defineProperty(b, 'onlyA', {
      value: undefined,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    b.drop2 = 'y'
    b[Symbol.for('sym')] = 1
    const keys = new Set(['drop1', 'drop2', 'locked'])
    const fused = _mergePropsOmit(keys, a as never, b as never) as object
    const reference = refOmit(mergeProps(a as never, b as never), keys)
    const strip = (o: object) => {
      // Getter identity differs between two independent merges (each wraps a
      // fresh closure); compare shape + values instead of function identity.
      const d = Object.getOwnPropertyDescriptors(o) as Record<string, PropertyDescriptor>
      return Object.fromEntries(
        Object.entries(d).map(([k, v]) => [
          k,
          v.get ? { ...v, get: 'fn', set: v.set ? 'fn' : undefined } : v,
        ]),
      )
    }
    expect(Reflect.ownKeys(fused)).toEqual(Reflect.ownKeys(reference))
    expect(strip(fused)).toEqual(strip(reference))
    // The merged getter stays LIVE: each read re-runs the source getter.
    const first = (fused as Record<string, unknown>).shared as number
    expect((fused as Record<string, unknown>).shared).toBe(first + 1)
    expect(Object.getPrototypeOf(fused)).toBe(Object.prototype)
  })
})

describe('_pickProps / _mergePropsExcept ≡ splitProps + mergeProps(rest, ...)', () => {
  const strip = (o: object) => {
    const d = Object.getOwnPropertyDescriptors(o) as Record<string | symbol, PropertyDescriptor>
    return Reflect.ownKeys(d).map((k) => {
      const v = d[k as string]!
      return [k, v.get ? { ...v, get: 'fn', set: v.set ? 'fn' : undefined } : v]
    })
  }

  it('match for every descriptor shape, symbol keys and a re-supplied excluded key', async () => {
    const { _pickProps, _mergePropsExcept } = await import('../props')
    const src = makeSource()
    src[Symbol.for('extra')] = 'sym'
    const keys = ['plain', 'getter', 'locked', 'tag'] as const
    Object.defineProperty(src, 'tag', {
      value: 'div',
      writable: true,
      enumerable: true,
      configurable: true,
    })
    const [picked, rest] = splitProps(src, keys as never)
    const keySet = new Set<PropertyKey>(keys)
    // A later source re-supplies an EXCLUDED key — it must still land.
    const extra = { tag: 'section', added: 1 }
    const reference = mergeProps(rest as never, extra as never)
    const fused = _mergePropsExcept(keySet, src as never, extra)
    expect(strip(_pickProps(src, keySet))).toEqual(strip(picked))
    expect(strip(fused)).toEqual(strip(reference))
    expect((fused as Record<string, unknown>).tag).toBe('section')
    expect(Object.getPrototypeOf(fused)).toBe(Object.prototype)
  })
})
